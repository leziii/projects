import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MESSAGE_CATEGORIES,
  MESSAGE_LIMITS,
  MESSAGE_LINK_TYPES,
  ORDER_STATUS_LABEL,
  PET_STATUS_LABEL,
  RuleError,
  checkMessageText,
  checkRoleSwitch,
  openCheck,
  type CaregiverStatus,
  type LinkState,
  type Message,
  type MessageCategory,
  type MessageLink,
  type MessageList,
  type OrderStatus,
  type OpenedMessage,
  type PetStatus,
  type Role,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';

export interface NewMessage {
  userId: number;
  role: Role | null;
  category: MessageCategory;
  title: string;
  body: string;
  link: MessageLink | null;
}

interface MessageRow {
  id: number;
  role: Role | null;
  category: MessageCategory;
  title: string;
  body: string;
  link_type: MessageLink['type'] | null;
  link_id: number | null;
  created: string;
  read: string | null;
}

const SELECT = `SELECT id, role, category, title, body, link_type, link_id, ${ts('created_at')} AS created, ${ts('read_at')} AS read FROM messages`;

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  role: r.role,
  category: r.category,
  title: r.title,
  body: r.body,
  link: r.link_type && r.link_id !== null ? { type: r.link_type, id: r.link_id } : null,
  createdAt: r.created,
  readAt: r.read,
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a caregiver is told when an admin changes their status. */
const CAREGIVER_NOTICE: Partial<Record<CaregiverStatus, { title: string; body: string }>> = {
  pending: { title: 'Application received', body: 'We are reviewing your caregiver application.' },
  approved: { title: 'You are a PawPal caregiver', body: 'Your application is approved. Switch to the Caregiver role to start.' },
  rejected: { title: 'Application not approved', body: 'Your caregiver application was not approved.' },
  suspended: { title: 'Caregiver account suspended', body: 'Your caregiver account is suspended. Contact support for details.' },
};

/** Message centre (E2-3): each message is a reminder with a link; opening it reads the latest state. */
@Injectable()
export class MessagesService {
  constructor(private readonly db: DbService) {}

  /** Saves a message. Pass the transaction's client so the message and the change it reports are saved together. */
  async send(conn: PoolClient | null, m: NewMessage): Promise<Message> {
    const { title, body } = checkMessageText(m);
    if (!MESSAGE_CATEGORIES.includes(m.category)) throw new RuleError('BAD_CATEGORY', `category must be one of ${MESSAGE_CATEGORIES.join(', ')}`);
    if (m.role !== null && m.role !== 'owner' && m.role !== 'caregiver') throw new RuleError('BAD_ROLE', 'role must be "owner", "caregiver" or empty');
    if (m.link && (!MESSAGE_LINK_TYPES.includes(m.link.type) || !Number.isInteger(m.link.id) || m.link.id < 1)) {
      throw new RuleError('BAD_LINK', `link type must be one of ${MESSAGE_LINK_TYPES.join(', ')} with a valid id`);
    }
    const { rows } = await (conn ?? this.db.pool).query<{ id: number }>(
      'INSERT INTO messages (user_id, role, category, title, body, link_type, link_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [m.userId, m.role, m.category, title, body, m.link?.type ?? null, m.link?.id ?? null],
    );
    return this.get(rows[0].id, m.userId, conn);
  }

  /** Tells a caregiver about a status change, inside the same transaction. */
  async caregiverStatusChanged(conn: PoolClient, userId: number, status: CaregiverStatus): Promise<void> {
    const notice = CAREGIVER_NOTICE[status];
    if (notice) await this.send(conn, { userId, role: null, category: 'account', ...notice, link: { type: 'caregiver_application', id: userId } });
  }

  /** Newest first, optionally one category; with the unread count over all messages. */
  async list(user: User, category?: unknown): Promise<MessageList> {
    if (category !== undefined && !MESSAGE_CATEGORIES.includes(category as MessageCategory)) {
      throw new RuleError('BAD_CATEGORY', `category must be one of ${MESSAGE_CATEGORIES.join(', ')}`);
    }
    const params: unknown[] = [user.id, MESSAGE_LIMITS.pageSize];
    const where = category ? (params.push(category), 'AND category = $3') : '';
    const [items, unread] = await Promise.all([
      this.db.pool.query<MessageRow>(`${SELECT} WHERE user_id = $1 ${where} ORDER BY id DESC LIMIT $2`, params),
      this.db.pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND read_at IS NULL', [user.id]),
    ]);
    return { items: items.rows.map(toMessage), unread: unread.rows[0].n };
  }

  /**
   * Opens a message: checks the role first, marks it read, and reads the linked item's latest state.
   * Wrong role → 409 ROLE_SWITCH_NEEDED (the app offers C04); role not allowed → 403 ROLE_NOT_ALLOWED.
   */
  async open(user: User, id: number): Promise<OpenedMessage> {
    const message = await this.get(id, user.id);
    const check = openCheck(user, message);
    if (check === 'switch') {
      throw new ConflictException({ code: 'ROLE_SWITCH_NEEDED', message: `Switch to the ${message.role} role to open this message`, role: message.role });
    }
    if (check === 'blocked') {
      let reason = 'You cannot open this message';
      try {
        checkRoleSwitch(user, message.role as Role);
      } catch (e) {
        reason = (e as Error).message;
      }
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: reason });
    }
    if (!message.readAt) await this.db.pool.query('UPDATE messages SET read_at = now() WHERE id = $1 AND read_at IS NULL', [id]);
    return { message: await this.get(id, user.id), latest: message.link ? await this.latest(message.link) : null };
  }

  /** Marks every message of this user as read; returns how many changed. */
  async readAll(user: User): Promise<{ read: number }> {
    const { rowCount } = await this.db.pool.query('UPDATE messages SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [user.id]);
    return { read: rowCount ?? 0 };
  }

  private async get(id: number, userId: number, conn?: PoolClient | null): Promise<Message> {
    const { rows } = await (conn ?? this.db.pool).query<MessageRow>(`${SELECT} WHERE id = $1 AND user_id = $2`, [id, userId]);
    // Someone else's message looks the same as a missing one.
    if (!rows[0]) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Message not found' });
    return toMessage(rows[0]);
  }

  /** The linked item as it is now, read fresh every time. */
  private async latest(link: MessageLink): Promise<LinkState> {
    const gone: LinkState = { ...link, status: 'gone', summary: 'This item no longer exists', gone: true };
    if (link.type === 'caregiver_application') {
      const { rows } = await this.db.pool.query<{ caregiver_status: CaregiverStatus }>('SELECT caregiver_status FROM users WHERE id = $1', [link.id]);
      if (!rows[0]) return gone;
      const status = rows[0].caregiver_status;
      return { ...link, status, summary: `Caregiver status: ${cap(status)}`, gone: false };
    }
    if (link.type === 'pet') {
      const { rows } = await this.db.pool.query<{ name: string; status: PetStatus }>('SELECT name, status FROM pets WHERE id = $1', [link.id]);
      if (!rows[0]) return gone;
      return { ...link, status: rows[0].status, summary: `${rows[0].name}: ${PET_STATUS_LABEL[rows[0].status]}`, gone: false };
    }
    if (link.type === 'request') {
      // E6-1: a booking request, as its caregiver sees it.
      const { rows } = await this.db.pool.query<{ number: string; open: boolean }>(
        "SELECT number, (status = 'pending_accept' AND accept_deadline > now()) AS open FROM orders WHERE id = $1",
        [link.id],
      );
      if (!rows[0]) return gone;
      return { ...link, status: rows[0].open ? 'open' : 'closed', summary: `Request ${rows[0].number}: ${rows[0].open ? 'Waiting for you' : 'No longer open'}`, gone: false };
    }
    if (link.type === 'order') {
      const { rows } = await this.db.pool.query<{ number: string; status: OrderStatus }>('SELECT number, status FROM orders WHERE id = $1', [link.id]);
      if (!rows[0]) return gone;
      return { ...link, status: rows[0].status, summary: `Order ${rows[0].number}: ${ORDER_STATUS_LABEL[rows[0].status]}`, gone: false };
    }
    const { rows } = await this.db.pool.query<{ kind: string; amount_sen: number; status: string }>(
      'SELECT kind, amount_sen, status FROM payments WHERE id = $1',
      [link.id],
    );
    if (!rows[0]) return gone;
    const p = rows[0];
    return { ...link, status: p.status, summary: `${cap(p.kind)} RM${(p.amount_sen / 100).toFixed(2)} · ${cap(p.status)}`, gone: false };
  }
}

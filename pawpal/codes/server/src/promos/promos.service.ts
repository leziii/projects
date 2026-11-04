import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROMO_RULES,
  RuleError,
  checkPromo,
  klDate,
  normalizeCode,
  promoDiscount,
  promoProblem,
  promoText,
  type AdminUser,
  type Promo,
  type PromoKind,
  type StatusChange,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';

interface PromoRow {
  id: number;
  code: string;
  kind: PromoKind;
  amount_sen: number | null;
  percent: number | null;
  max_sen: number | null;
  min_spend_sen: number;
  starts_on: string;
  ends_on: string;
  total_uses: number | null;
  once_per_owner: boolean;
  first_order_only: boolean;
  active: boolean;
  used: number;
  created: string;
}

/** The result of trying a code on a booking. */
export interface PromoTry {
  promo: Promo | null;
  problem: string | null;
  discountSen: number;
}

const ENTITY = 'promo';
/** A use held at Pay counts against the limits for this long; an order left unpaid stops holding it. */
const HOLD_MINUTES = 30;
// Uses that count against the limits: paid, or being paid right now by another owner (R23-4).
// The owner's own held use is left out: it belongs to the order they are paying again.
const TAKEN = `(status = 'used' OR (status = 'reserved' AND owner_id <> $2 AND created_at > now() - interval '${HOLD_MINUTES} minutes'))`;
const SELECT = `SELECT p.*, to_char(p.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(p.ends_on, 'YYYY-MM-DD') AS ends_on, ${ts('p.created_at')} AS created,
  (SELECT COUNT(*)::int FROM promo_uses u WHERE u.promo_id = p.id AND u.status = 'used') AS used FROM promo_codes p`;

const toPromo = (r: PromoRow): Promo => ({
  id: r.id,
  code: r.code,
  kind: r.kind,
  amountSen: r.amount_sen,
  percent: r.percent,
  maxSen: r.max_sen,
  minSpendSen: r.min_spend_sen,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  totalUses: r.total_uses,
  oncePerOwner: r.once_per_owner,
  firstOrderOnly: r.first_order_only,
  active: r.active,
  used: r.used,
  createdAt: r.created,
});

function checkReason(reason: unknown): string {
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < PROMO_RULES.reasonMin) throw new RuleError('REASON_REQUIRED', `Write a reason (at least ${PROMO_RULES.reasonMin} characters)`);
  return r.slice(0, 200);
}

/** Promo codes (E5-6): admins make and turn off codes; bookings try, reserve, use and give back. */
@Injectable()
export class PromosService {
  constructor(
    private readonly db: DbService,
    private readonly history: HistoryService,
  ) {}

  async list(): Promise<Promo[]> {
    const { rows } = await this.db.pool.query<PromoRow>(`${SELECT} ORDER BY p.id DESC`);
    return rows.map(toPromo);
  }

  async create(admin: AdminUser, body: Record<string, unknown>): Promise<Promo> {
    const p = checkPromo(body ?? {});
    const reason = checkReason(body?.reason);
    const id = await this.db.tx(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO promo_codes (code, kind, amount_sen, percent, max_sen, min_spend_sen, starts_on, ends_on, total_uses, once_per_owner, first_order_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (code) DO NOTHING RETURNING id`,
        [p.code, p.kind, p.amountSen, p.percent, p.maxSen, p.minSpendSen, p.startsOn, p.endsOn, p.totalUses, p.oncePerOwner, p.firstOrderOnly],
      );
      if (!rows[0]) throw new ConflictException({ code: 'PROMO_EXISTS', message: `Code ${p.code} already exists` });
      await this.history.record(client, { entity: ENTITY, entityId: rows[0].id, from: null, to: 'on', actor: { type: 'admin', id: admin.username }, reason: `${reason} · ${promoText(p)}`.slice(0, 255) });
      return rows[0].id;
    });
    return this.get(id);
  }

  /** Turn a code off (or on again); codes are never deleted (R23-6). */
  async setActive(admin: AdminUser, id: number, body: { active?: unknown; reason?: unknown }): Promise<Promo> {
    if (typeof body?.active !== 'boolean') throw new RuleError('PROMO_ACTIVE', 'active must be true or false');
    const reason = checkReason(body.reason);
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ active: boolean }>('SELECT active FROM promo_codes WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new NotFoundException({ code: 'PROMO_NOT_FOUND', message: 'Promo code not found' });
      if (rows[0].active === body.active) return;
      await client.query('UPDATE promo_codes SET active = $2, updated_at = now() WHERE id = $1', [id, body.active]);
      const [from, to] = body.active ? ['off', 'on'] : ['on', 'off'];
      await this.history.record(client, { entity: ENTITY, entityId: id, from, to, actor: { type: 'admin', id: admin.username }, reason });
    });
    return this.get(id);
  }

  historyOf(id: number): Promise<StatusChange[]> {
    return this.history.list(ENTITY, id);
  }

  /** Tries a code on a booking total for this owner (R23-2). Pass a client to count inside a transaction. */
  async try(ownerId: number, code: unknown, totalSen: number, client?: PoolClient): Promise<PromoTry> {
    const q = client ?? this.db.pool;
    const { rows } = await q.query<PromoRow>(`${SELECT} WHERE p.code = $1`, [normalizeCode(code)]);
    const promo = rows[0] ? toPromo(rows[0]) : null;
    if (!promo) return { promo, problem: promoProblem(null, { today: '', totalSen, usedTotal: 0, usedByOwner: 0, ownerPaidOrders: 0 }), discountSen: 0 };
    const counts = await q.query<{ total: number; mine: number; orders: number }>(
      `SELECT (SELECT COUNT(*)::int FROM promo_uses WHERE promo_id = $1 AND ${TAKEN}) AS total,
              (SELECT COUNT(*)::int FROM promo_uses WHERE promo_id = $1 AND owner_id = $2 AND status = 'used') AS mine,
              (SELECT COUNT(*)::int FROM orders WHERE owner_id = $2 AND paid_at IS NOT NULL AND status NOT IN ('failed', 'cancelled')) AS orders`,
      [promo.id, ownerId],
    );
    const c = counts.rows[0];
    const problem = promoProblem(promo, { today: klDate(new Date()), totalSen, usedTotal: c.total, usedByOwner: c.mine, ownerPaidOrders: c.orders });
    return { promo, problem, discountSen: problem ? 0 : promoDiscount(promo, totalSen) };
  }

  /**
   * Holds a use for an order at Pay, checked again under a lock so two payments cannot both take the last use.
   * Returns the problem when the code can no longer be used.
   */
  async reserve(client: PoolClient, ownerId: number, orderId: number, code: string, totalSen: number): Promise<PromoTry> {
    await client.query('SELECT id FROM promo_codes WHERE code = $1 FOR UPDATE', [code]);
    const t = await this.try(ownerId, code, totalSen, client);
    if (!t.problem) await client.query("INSERT INTO promo_uses (promo_id, order_id, owner_id, status) VALUES ($1, $2, $3, 'reserved')", [t.promo!.id, orderId, ownerId]);
    return t;
  }

  /** The order is paid: the use counts (R23-4). */
  async markUsed(client: PoolClient, orderId: number): Promise<void> {
    await client.query("UPDATE promo_uses SET status = 'used', updated_at = now() WHERE order_id = $1 AND status = 'reserved'", [orderId]);
  }

  /** Cancelled, failed or fully refunded: the use is given back (R23-4). */
  async giveBack(client: PoolClient, orderIds: number[]): Promise<void> {
    if (orderIds.length) await client.query("UPDATE promo_uses SET status = 'returned', updated_at = now() WHERE order_id = ANY ($1) AND status <> 'returned'", [orderIds]);
  }

  private async get(id: number): Promise<Promo> {
    const { rows } = await this.db.pool.query<PromoRow>(`${SELECT} WHERE p.id = $1`, [id]);
    return toPromo(rows[0]);
  }
}

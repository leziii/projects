import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  REVIEW_RULES,
  checkHideReason,
  checkReply,
  checkReview,
  ownerShortName,
  type AdminReviewRow,
  type AdminUser,
  type CaregiverReviews,
  type OrderReview,
  type Review,
  type User,
} from '@pawpal/shared';
import { AddressesService } from '../addresses/addresses.service';
import { DbService, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';

interface ReviewRow {
  id: string;
  stars: number;
  comment: string;
  owner_name: string;
  created: string;
  reply: string | null;
  replied: string | null;
}

const COLUMNS = `r.id, r.stars, r.comment, r.owner_name, ${ts('r.created_at')} AS created, r.reply, ${ts('r.replied_at')} AS replied`;
const toReview = (r: ReviewRow): Review => ({ id: Number(r.id), stars: r.stars, comment: r.comment, ownerName: r.owner_name, createdAt: r.created, reply: r.reply, repliedAt: r.replied });

/** E9-3 (round 41): the owner rates the caregiver once per order; the caregiver replies once; admin may hide. */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly db: DbService,
    private readonly addresses: AddressesService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
  ) {}

  /** R41-1, R41-3: open once every visit is confirmed, for 14 days after the last one. */
  async stateOf(orderId: number): Promise<OrderReview> {
    const mine = await this.db.pool.query<ReviewRow>(`SELECT ${COLUMNS} FROM reviews r WHERE r.order_id = $1`, [orderId]);
    if (mine.rows[0]) return { state: 'done', until: null, mine: toReview(mine.rows[0]) };
    const { rows } = await this.db.pool.query<{ visits: number; confirmed: number; cancelled: number; until: string | null; open: boolean }>(
      `SELECT jsonb_array_length(o.visits) AS visits,
         (SELECT count(*)::int FROM visit_runs r WHERE r.order_id = o.id AND r.status = 'confirmed') AS confirmed,
         (SELECT count(*)::int FROM visit_runs r WHERE r.order_id = o.id AND r.status = 'cancelled') AS cancelled,
         ${ts(`(SELECT max(confirmed_at) FROM visit_runs r WHERE r.order_id = o.id) + interval '${REVIEW_RULES.rateDays} days'`)} AS until,
         (SELECT max(confirmed_at) FROM visit_runs r WHERE r.order_id = o.id) + interval '${REVIEW_RULES.rateDays} days' > now() AS open
       FROM orders o WHERE o.id = $1 AND o.status = 'accepted'`,
      [orderId],
    );
    const o = rows[0];
    // E10-1: cancelled visits count as final; at least one visit must have happened.
    if (!o || !o.confirmed || o.confirmed + o.cancelled < o.visits) return { state: 'not_yet', until: null, mine: null };
    return { state: o.open ? 'open' : 'closed', until: o.until, mine: null };
  }

  /** R41-2: 1–5 stars and an optional comment; one per order, no edits. */
  async rate(user: User, orderId: number, input: { stars?: unknown; comment?: unknown }): Promise<OrderReview> {
    const fields = checkReview(input);
    const o = (await this.db.pool.query<{ owner_id: number; caregiver_id: number; address_id: number; number: string }>('SELECT owner_id, caregiver_id, address_id, number FROM orders WHERE id = $1', [orderId])).rows[0];
    if (!o || o.owner_id !== user.id) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    const state = await this.stateOf(orderId);
    if (state.state === 'done') throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'You already rated this order' });
    if (state.state === 'not_yet') throw new ConflictException({ code: 'NOT_CONFIRMED', message: 'You can rate once every visit is confirmed' });
    if (state.state === 'closed') throw new ConflictException({ code: 'REVIEW_CLOSED', message: `Rating closes ${REVIEW_RULES.rateDays} days after the last visit is confirmed` });
    const ownerName = ownerShortName((await this.addresses.forVisit(o.address_id))?.contactName ?? '').slice(0, 40);
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO reviews (order_id, owner_id, caregiver_id, stars, comment, owner_name) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (order_id) DO NOTHING RETURNING id',
        [orderId, user.id, o.caregiver_id, fields.stars, fields.comment, ownerName],
      );
      if (!rows[0]) throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'You already rated this order' });
      await this.history.record(client, { entity: 'review', entityId: Number(rows[0].id), from: null, to: 'posted', actor: { type: 'owner', id: String(user.id) }, reason: `${fields.stars} stars for order ${o.number}` });
      await this.messages.send(client, {
        userId: o.caregiver_id,
        role: 'caregiver',
        category: 'order',
        title: `New review for order ${o.number}`,
        body: `${ownerName} gave you ${fields.stars} star${fields.stars === 1 ? '' : 's'} for order ${o.number}. You can reply once.`,
        link: { type: 'request', id: orderId },
      });
    });
    return this.stateOf(orderId);
  }

  /** R41-4 O08: the average and the 5 newest visible reviews. */
  async forCaregiver(caregiverId: number): Promise<CaregiverReviews> {
    const agg = await this.db.pool.query<{ avg: string | null; count: number }>(
      'SELECT round(avg(stars), 1) AS avg, count(*)::int AS count FROM reviews WHERE caregiver_id = $1 AND hidden_at IS NULL',
      [caregiverId],
    );
    const { rows } = await this.db.pool.query<ReviewRow>(
      `SELECT ${COLUMNS} FROM reviews r WHERE r.caregiver_id = $1 AND r.hidden_at IS NULL ORDER BY r.id DESC LIMIT ${REVIEW_RULES.profileShow}`,
      [caregiverId],
    );
    const a = agg.rows[0];
    return { rating: { avg: a.avg === null ? null : Number(a.avg), count: a.count }, reviews: rows.map(toReview) };
  }

  /** R41-5: the review of one of the caregiver's orders, if any. */
  async ofCaregiverOrder(user: User, orderId: number): Promise<{ review: Review | null }> {
    const o = (await this.db.pool.query<{ caregiver_id: number }>('SELECT caregiver_id FROM orders WHERE id = $1', [orderId])).rows[0];
    if (!o || o.caregiver_id !== user.id) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    const { rows } = await this.db.pool.query<ReviewRow>(`SELECT ${COLUMNS} FROM reviews r WHERE r.order_id = $1`, [orderId]);
    return { review: rows[0] ? toReview(rows[0]) : null };
  }

  /** R41-5: one reply; the owner is told. */
  async reply(user: User, orderId: number, text: unknown): Promise<{ review: Review | null }> {
    const reply = checkReply(text);
    const { review } = await this.ofCaregiverOrder(user, orderId);
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'There is no review to reply to' });
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ owner_id: number; number: string }>(
        `UPDATE reviews r SET reply = $2, replied_at = now() FROM orders o WHERE r.order_id = $1 AND r.reply IS NULL AND o.id = r.order_id RETURNING r.owner_id, o.number`,
        [orderId, reply],
      );
      if (!rows[0]) throw new ConflictException({ code: 'ALREADY_REPLIED', message: 'You already replied to this review' });
      await this.history.record(client, { entity: 'review', entityId: review.id, from: 'posted', to: 'replied', actor: { type: 'caregiver', id: String(user.id) }, reason: 'Caregiver replied' });
      await this.messages.send(client, {
        userId: rows[0].owner_id,
        role: 'owner',
        category: 'order',
        title: 'Your caregiver replied',
        body: `Order ${rows[0].number}: the caregiver replied to your review.`,
        link: { type: 'order', id: orderId },
      });
    });
    return this.ofCaregiverOrder(user, orderId);
  }

  /** R41-6: every review, newest first, hidden ones too. */
  async adminList(): Promise<AdminReviewRow[]> {
    const { rows } = await this.db.pool.query<ReviewRow & { order_id: string; number: string; caregiver: string; hidden: boolean; hidden_reason: string | null }>(
      `SELECT ${COLUMNS}, r.order_id, o.number, c.display_name AS caregiver, r.hidden_at IS NOT NULL AS hidden, r.hidden_reason
       FROM reviews r JOIN orders o ON o.id = r.order_id JOIN caregiver_profiles c ON c.user_id = r.caregiver_id ORDER BY r.id DESC LIMIT 200`,
    );
    return rows.map((r) => ({ ...toReview(r), orderId: Number(r.order_id), number: r.number, caregiver: r.caregiver, hidden: r.hidden, hiddenReason: r.hidden_reason }));
  }

  /** R41-6: hide with a reason; it leaves the profile and the average. Logged. */
  async hide(admin: AdminUser, id: number, reason: unknown): Promise<AdminReviewRow[]> {
    const why = checkHideReason(reason);
    await this.db.tx(async (client) => {
      const { rowCount } = await client.query('UPDATE reviews SET hidden_at = now(), hidden_reason = $2, hidden_by = $3 WHERE id = $1 AND hidden_at IS NULL', [id, why, admin.username]);
      if (!rowCount) throw new ConflictException({ code: 'ALREADY_HIDDEN', message: 'This review is already hidden, or does not exist' });
      await this.history.record(client, { entity: 'review', entityId: id, from: 'posted', to: 'hidden', actor: { type: 'admin', id: admin.username }, reason: why });
    });
    return this.adminList();
  }
}

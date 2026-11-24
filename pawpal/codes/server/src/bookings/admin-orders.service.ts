import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ADMIN_ORDER_RULES,
  ENTRY_METHOD_LABEL,
  FINAL_VISIT,
  TASK_STATUS_LABEL,
  actorLabel,
  checkOrderQuery,
  formatRM,
  maskPhone,
  parseMoneyRef,
  searchOf,
  type ActorType,
  type AdminOrderAddress,
  type AdminOrderDetail,
  type AdminOrderPage,
  type AdminOrderRow,
  type AdminUser,
  type BookingState,
  type EntryMethod,
  type MoneyStatus,
  type OrderVisit,
  type TaskStatus,
} from '@pawpal/shared';
import { AddressesService } from '../addresses/addresses.service';
import { DbService, ts } from '../db/db.service';
import { SecretBox } from '../files/secret-box';
import { HistoryService } from '../history/history.service';
import { RefundsService } from './refunds.service';

const ADDRESS_VIEW = 'order_address_view';

/**
 * Each order with its booking state and money state, worked out the same way for the list, its filters and the detail (R58-2).
 * Refund items are grouped by their reference without the retry suffix; one is open until a try succeeds.
 */
const ORDERS = `
  WITH rf AS (
    SELECT substring(ref from '^order-(\\d+)-refund-')::bigint AS order_id, regexp_replace(ref, '-r\\d+$', '') AS base, bool_or(status = 'succeeded') AS ok
    FROM payments WHERE kind = 'refund' AND ref LIKE 'order-%-refund-%' GROUP BY 1, 2
  ), ro AS (SELECT order_id, bool_and(ok) AS all_ok FROM rf GROUP BY 1),
  vr AS (
    SELECT order_id, count(*) FILTER (WHERE status = ANY ($1)) AS final, count(*) FILTER (WHERE status = 'cancelled') AS cancelled FROM visit_runs GROUP BY 1
  )
  SELECT o.id, o.number, ${ts('o.created_at')} AS created, u.phone, cp.display_name AS caregiver, jsonb_array_length(o.visits) AS visits,
    COALESCE(vr.cancelled, 0)::int AS cancelled,
    CASE WHEN o.status IN ('awaiting_payment', 'pending_accept') THEN 'waiting'
         WHEN o.status = 'cancelled' THEN 'cancelled'
         WHEN o.status = 'failed' THEN 'failed'
         WHEN COALESCE(vr.final, 0) >= jsonb_array_length(o.visits) THEN 'done'
         ELSE 'accepted' END AS booking,
    CASE WHEN c.status IS DISTINCT FROM 'succeeded' THEN 'unpaid'
         WHEN pp.status = 'failed' THEN 'payout_failed'
         WHEN ro.all_ok = false THEN 'refund_processing'
         WHEN pp.status = 'succeeded' THEN 'paid_out'
         WHEN pp.status IS NOT NULL THEN 'paying_out'
         WHEN ro.order_id IS NOT NULL THEN 'refunded'
         ELSE 'paid' END AS money,
    (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS day
  FROM orders o
  JOIN users u ON u.id = o.owner_id
  LEFT JOIN caregiver_profiles cp ON cp.user_id = o.caregiver_id
  LEFT JOIN payments c ON c.id = o.charge_id
  LEFT JOIN settlements s ON s.order_id = o.id
  LEFT JOIN payments pp ON pp.id = s.payout_id
  LEFT JOIN ro ON ro.order_id = o.id
  LEFT JOIN vr ON vr.order_id = o.id`;

interface Row {
  id: string;
  number: string;
  created: string;
  phone: string;
  caregiver: string | null;
  visits: number;
  cancelled: number;
  booking: BookingState;
  money: MoneyStatus;
  total?: number;
}

const toRow = (r: Row): AdminOrderRow => ({
  id: Number(r.id),
  number: r.number,
  createdAt: r.created,
  owner: maskPhone(r.phone),
  caregiver: r.caregiver ?? '—',
  visits: r.visits,
  cancelled: r.cancelled,
  booking: r.booking,
  money: r.money,
});

/** E14-2 A07 / A08 (round 58). Read only: changes stay in Exceptions, Cases and Money (R58-5). */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly db: DbService,
    private readonly refunds: RefundsService,
    private readonly addresses: AddressesService,
    private readonly secrets: SecretBox,
    private readonly history: HistoryService,
  ) {}

  /** R58-1, R58-2: newest first, 20 a page; booking and money filters apply on their own or together. */
  async list(input: Record<string, unknown>): Promise<AdminOrderPage> {
    const q = checkOrderQuery(input);
    const where: string[] = [];
    const args: unknown[] = [FINAL_VISIT];
    const arg = (v: unknown) => `$${args.push(v)}`;
    if (q.booking) where.push(`booking = ${arg(q.booking)}`);
    if (q.money) where.push(`money = ${arg(q.money)}`);
    if (q.from) where.push(`day >= ${arg(q.from)}::date`);
    if (q.to) where.push(`day <= ${arg(q.to)}::date`);
    if (q.q) {
      const s = searchOf(q.q);
      where.push(s.digits ? `(phone LIKE ${arg(`%${s.digits}%`)} OR number LIKE ${arg(`%${s.number}%`)})` : `number LIKE ${arg(`%${s.number}%`)}`);
    }
    const size = ADMIN_ORDER_RULES.pageSize;
    const { rows } = await this.db.pool.query<Row>(
      `SELECT *, count(*) OVER ()::int AS total FROM (${ORDERS}) x ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY id DESC LIMIT ${size} OFFSET ${(q.page - 1) * size}`,
      args,
    );
    let total = rows[0]?.total ?? 0;
    // A page past the end still says how many there are.
    if (!rows.length && q.page > 1) {
      const c = await this.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${ORDERS}) x ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, args);
      total = c.rows[0].n;
    }
    return { rows: rows.map(toRow), total, page: q.page };
  }

  /** R58-3: the order, each visit, its money and its whole record. */
  async detail(id: number): Promise<AdminOrderDetail> {
    const { rows } = await this.db.pool.query<Row>(`SELECT * FROM (${ORDERS}) x WHERE id = $2`, [FINAL_VISIT, id]);
    if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    const row = toRow(rows[0]);
    const { rows: oRows } = await this.db.pool.query<{ visits: OrderVisit[]; area: string; charge_sen: number | null; charge_status: string | null; sub_of: string | null; caregiver: string | null }>(
      `SELECT o.visits, a.area, c.amount_sen AS charge_sen, c.status AS charge_status, so.number AS sub_of, cp.display_name AS caregiver
       FROM orders o JOIN addresses a ON a.id = o.address_id LEFT JOIN payments c ON c.id = o.charge_id
       LEFT JOIN orders so ON so.id = o.substitute_of LEFT JOIN caregiver_profiles cp ON cp.user_id = o.caregiver_id WHERE o.id = $1`,
      [id],
    );
    const o = oRows[0];
    const { rows: runs } = await this.db.pool.query<{ idx: number; status: TaskStatus; reported: boolean; moved_number: string | null; moved_name: string | null }>(
      `SELECT r.idx, r.status, r.reported_at IS NOT NULL AS reported, m.number AS moved_number, mp.display_name AS moved_name
       FROM visit_runs r LEFT JOIN orders m ON m.id = r.moved_to LEFT JOIN caregiver_profiles mp ON mp.user_id = m.caregiver_id WHERE r.order_id = $1`,
      [id],
    );
    const { rows: probs } = await this.db.pool.query<{ idx: number; dispute: boolean }>(
      `SELECT idx, false AS dispute FROM problem_reports WHERE order_id = $1 AND kind <> 'dispute_evidence'
       UNION ALL SELECT idx, on_report AS dispute FROM cases WHERE order_id = $1`,
      [id],
    );
    const lines = await this.refunds.linesFor(id);
    const { rows: pays } = await this.db.pool.query<{ id: number; ref: string }>(
      "SELECT id, ref FROM payments WHERE id = (SELECT charge_id FROM orders WHERE id = $1) OR ref LIKE $2 ORDER BY id",
      [id, `order-${id}-%`],
    );
    const moneyIds = [...new Set(pays.map((p) => parseMoneyRef(p.ref)).filter((r) => r && r.orderId === id).map((r) => r!.base))];

    const visitList = o.visits.map((v, index) => {
      const run = runs.find((r) => r.idx === index);
      const status = run?.status ?? 'todo';
      const refund = lines.find((l) => l.key === `v${index}` || l.key === `x${index}`);
      return {
        index,
        date: v.date,
        start: v.start,
        caregiver: run?.moved_number ? `Moved to ${run.moved_number} (${run.moved_name ?? 'caregiver'})` : (o.caregiver ?? '—'),
        status: TASK_STATUS_LABEL[status],
        priceSen: v.paidSen ?? v.quote.total,
        refund: refund ? `${refund.state === 'refunded' ? 'Refunded' : 'Refund processing'} ${formatRM(refund.amountSen)}` : null,
        reportSent: !!run?.reported,
        exception: probs.some((p) => p.idx === index && !p.dispute),
        dispute: probs.some((p) => p.idx === index && p.dispute),
        money: moneyIds.filter((m) => m === `order-${id}-refund-v${index}` || m === `order-${id}-refund-x${index}`),
      };
    });

    return {
      ...row,
      area: o.area,
      paidSen: o.charge_status === 'succeeded' ? (o.charge_sen ?? 0) : 0,
      refundedSen: lines.filter((l) => l.state === 'refunded').reduce((s, l) => s + l.amountSen, 0),
      refundProcessingSen: lines.filter((l) => l.state !== 'refunded').reduce((s, l) => s + l.amountSen, 0),
      payout: moneyIds.find((m) => m === `order-${id}-payout`) ?? null,
      substituteOf: o.sub_of,
      visitList,
      log: await this.log(id, pays.map((p) => p.id)),
    };
  }

  /** R58-4: the address and entry notes, recorded each time with who asked. */
  async address(admin: AdminUser, id: number): Promise<AdminOrderAddress> {
    const { rows } = await this.db.pool.query<{ address_id: number; entry_method: EntryMethod; entry_secret: string | null }>('SELECT address_id, entry_method, entry_secret FROM orders WHERE id = $1', [id]);
    const o = rows[0];
    const a = o ? await this.addresses.forVisit(o.address_id) : null;
    if (!o || !a) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    const entry = o.entry_secret ? (JSON.parse(await this.secrets.open(o.entry_secret)) as { keyLock?: string; guard?: string; notes?: string }) : {};
    await this.db.tx((client) =>
      this.history.record(client, { entity: ADDRESS_VIEW, entityId: id, from: null, to: 'shown', actor: { type: 'admin', id: admin.username }, reason: 'Address and entry notes shown' }),
    );
    const notes = [entry.keyLock, entry.guard, entry.notes].filter((x) => x && x.trim()).join(' · ');
    return { ...a, entryMethod: ENTRY_METHOD_LABEL[o.entry_method].title, entryNotes: notes };
  }

  /** Every recorded change of the order, its visits, problems, cases, fees, substitutes and payments, oldest first. */
  private async log(id: number, paymentIds: number[]): Promise<AdminOrderDetail['log']> {
    const { rows } = await this.db.pool.query<{ actor_type: ActorType; actor_id: string | null; reason: string; to_status: string; entity: string; at: string }>(
      `SELECT h.actor_type, h.actor_id, h.reason, h.to_status, h.entity, ${ts('h.created_at')} AS at FROM status_history h
       WHERE ((h.entity IN ('order', 'visit', '${ADDRESS_VIEW}')) AND h.entity_id = $1)
          OR (h.entity = 'problem' AND h.entity_id IN (SELECT id FROM problem_reports WHERE order_id = $1))
          OR (h.entity = 'case' AND h.entity_id IN (SELECT id FROM cases WHERE order_id = $1))
          OR (h.entity = 'extra_fee' AND h.entity_id IN (SELECT id FROM extra_fees WHERE order_id = $1))
          OR (h.entity = 'substitute' AND h.entity_id IN (SELECT id FROM substitutes WHERE order_id = $1))
          OR (h.entity IN ('payment', 'money') AND h.entity_id = ANY ($2))
       ORDER BY h.created_at, h.id`,
      [id, paymentIds],
    );
    return rows.map((r) => ({ at: r.at, who: actorLabel(r.actor_type, r.actor_id), what: r.entity === 'payment' ? `Payment ${r.to_status}: ${r.reason}` : r.reason }));
  }
}

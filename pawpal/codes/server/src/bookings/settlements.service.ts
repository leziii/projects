import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CASE_KIND_LABEL,
  CASE_STATUS_LABEL,
  INCOME_RULES,
  PROBLEM_KIND_LABEL,
  PROBLEM_STATUS_LABEL,
  expectedSettlement,
  type CaseKind,
  type CaseStatus,
  type OrderSettlement,
  type ProblemKind,
  type ProblemStatus,
  SETTLEMENT_RULES,
  expectedIncome,
  formatRM,
  klDate,
  parseMoneyRef,
  type CaregiverIncome,
  type User,
  settleBlocker,
  settleOrder,
  type Fault,
  type OrderVisit,
  type SettleFee,
  type SettleResult,
  type SettlementLine,
  type SettlementState,
  type SettleVisit,
} from '@pawpal/shared';
import { DbService, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { RefundsService } from './refunds.service';
import { VisitRunsService } from './visit-runs.service';


interface Row {
  id: string;
  number: string;
  caregiver_id: number;
  visits: OrderVisit[];
  settled: boolean;
}

/** E13-1 (round 53): pays the caregiver once an order is done. */
@Injectable()
export class SettlementsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SettlementsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly runs: VisitRunsService,
    private readonly refunds: RefundsService,
    private readonly payments: PaymentsService,
    private readonly referrals: ReferralsService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.payments.onSettled((id) => this.paid(id));
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    // R53-4: every 10 minutes.
    this.timer = setInterval(() => void this.settleDue().catch((e: Error) => this.log.error(e.message)), SETTLEMENT_RULES.everyMinutes * 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** R53-4: every accepted order not settled yet is checked; the ones that are ready are settled. Returns how many. */
  async settleDue(): Promise<number> {
    const { rows } = await this.db.pool.query<{ id: string }>('SELECT id FROM orders WHERE accepted_at IS NOT NULL AND settled_at IS NULL ORDER BY id');
    let n = 0;
    for (const r of rows) {
      try {
        if (!(await this.check(Number(r.id)))) n += (await this.settle(Number(r.id))) ? 1 : 0;
      } catch (e) {
        this.log.error(`Settling order ${r.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  /** Why the order cannot settle yet (R53-1), or null. */
  async check(orderId: number): Promise<{ state: 'pending' | 'frozen'; reason: string } | null> {
    const o = await this.order(orderId);
    const runs = await this.runs.forOrders([orderId]);
    const statuses = o.visits.map((_, i) => runs.get(`${orderId}:${i}`)?.status ?? 'todo');
    const open = await this.db.pool.query(
      "SELECT 1 FROM problem_reports WHERE order_id = $1 AND status <> 'decided' UNION ALL SELECT 1 FROM cases WHERE order_id = $1 AND status <> 'decided'",
      [orderId],
    );
    const fee = await this.db.pool.query("SELECT 1 FROM extra_fees WHERE order_id = $1 AND status = 'requested'", [orderId]);
    return settleBlocker({ statuses, openProblem: !!open.rowCount, openFee: !!fee.rowCount, refundsDone: await this.refunds.allLanded(orderId) });
  }

  /** R53-2 … R53-5: works out the lines, saves them once and sends the payout. False when another run got there first. */
  private async settle(orderId: number): Promise<boolean> {
    const o = await this.order(orderId);
    const { visits, fees } = await this.inputs(o);
    const s = settleOrder(visits, fees);

    const made = await this.db.tx(async (client) => {
      const upd = await client.query("UPDATE orders SET settled_at = now(), updated_at = now() WHERE id = $1 AND settled_at IS NULL", [orderId]);
      if (!upd.rowCount) return false;
      await client.query('INSERT INTO settlements (order_id, caregiver_id, gross_sen, amount_sen, lines) VALUES ($1, $2, $3, $4, $5)', [orderId, o.caregiver_id, s.grossSen, s.caregiverSen, JSON.stringify(s.lines)]);
      await this.history.record(client, { entity: 'order', entityId: orderId, from: null, to: 'settled', actor: { type: 'system', id: 'settlement' }, reason: `Settled: ${formatRM(s.caregiverSen)} to the caregiver` });
      return true;
    });
    if (!made) return false;
    if (s.caregiverSen > 0) await this.sendPayout(orderId, o, s.caregiverSen);
    // R53-5: the friend's first settled order gives both the invite credit.
    await this.referrals.orderSettled(orderId);
    return true;
  }

  /** What settlement needs: each visit's price, state and decision, and the fees used (E11-4: the rest went back). */
  private async inputs(o: Pick<Row, 'id' | 'visits'>): Promise<{ visits: SettleVisit[]; fees: SettleFee[] }> {
    const orderId = Number(o.id);
    const { rows: runRows } = await this.db.pool.query<{ idx: number; status: SettleVisit['status']; cancel_percent: number | null }>(
      'SELECT idx, status, cancel_percent FROM visit_runs WHERE order_id = $1',
      [orderId],
    );
    const { rows: decisions } = await this.db.pool.query<{ idx: number; fault: Fault; refund_percent: number }>('SELECT idx, fault, refund_percent FROM visit_decisions WHERE order_id = $1', [orderId]);
    const visits: SettleVisit[] = o.visits.map((v, i) => {
      const run = runRows.find((r) => r.idx === i);
      const d = decisions.find((x) => x.idx === i);
      return { priceSen: v.quote.total, status: run?.status ?? 'todo', cancelPercent: run?.cancel_percent ?? null, decision: d ? { fault: d.fault, refundPercent: d.refund_percent } : null };
    });
    const { rows: feeRows } = await this.db.pool.query<{ idx: number; kind: SettleFee['kind']; used: number }>(
      "SELECT idx, kind, COALESCE(used_sen, amount_sen) AS used FROM extra_fees WHERE order_id = $1 AND status = 'paid'",
      [orderId],
    );
    return { visits, fees: feeRows.map((f) => ({ index: f.idx, kind: f.kind, usedSen: f.used })) };
  }

  /** E13-2 S15 (round 54): the caregiver's four totals and latest orders. Only their own orders. */
  async income(user: User, now = new Date()): Promise<CaregiverIncome> {
    const { rows } = await this.db.pool.query<Row & { amount_sen: number | null; pay_status: string | null }>(
      `SELECT o.id, o.number, o.caregiver_id, o.visits, o.settled_at IS NOT NULL AS settled, s.amount_sen, p.status AS pay_status
       FROM orders o LEFT JOIN settlements s ON s.order_id = o.id LEFT JOIN payments p ON p.id = s.payout_id
       WHERE o.caregiver_id = $1 AND o.accepted_at IS NOT NULL ORDER BY o.accepted_at DESC, o.id DESC`,
      [user.id],
    );
    const out: CaregiverIncome = { pendingSen: 0, frozenSen: 0, payingSen: 0, paidMonthSen: 0, fixing: false, orders: [] };
    for (const o of rows) {
      let state: SettlementState;
      let amountSen: number;
      if (o.settled) {
        amountSen = o.amount_sen ?? 0;
        state = amountSen === 0 ? 'nothing' : o.pay_status === 'succeeded' ? 'paid' : o.pay_status === 'failed' ? 'failed' : 'paying';
        if (state === 'paying' || state === 'failed') out.payingSen += amountSen;
        if (state === 'failed') out.fixing = true;
      } else {
        const { visits, fees } = await this.inputs(o);
        amountSen = expectedIncome(visits, fees);
        state = (await this.check(Number(o.id)))?.state === 'frozen' ? 'frozen' : 'pending';
        if (state === 'frozen') out.frozenSen += amountSen;
        else out.pendingSen += amountSen;
      }
      if (out.orders.length < INCOME_RULES.recentOrders) out.orders.push({ orderId: Number(o.id), number: o.number, visits: o.visits.length, amountSen, state });
    }
    // R54-2: paid this month, KL time.
    const month = `${klDate(now).slice(0, 7)}-01`;
    const paid = await this.db.pool.query<{ sen: number }>(
      `SELECT COALESCE(SUM(p.amount_sen), 0)::int AS sen FROM settlements s JOIN payments p ON p.id = s.payout_id
       WHERE s.caregiver_id = $1 AND p.status = 'succeeded' AND p.updated_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')`,
      [user.id, month],
    );
    out.paidMonthSen = paid.rows[0].sen;
    return out;
  }

  /** E13-3 S16 (round 55): one of my orders, line by line. Settled orders show what was saved (R55-6). */
  async detail(user: User, orderId: number): Promise<OrderSettlement> {
    const { rows } = await this.db.pool.query<Row & { accepted: boolean }>(
      'SELECT id, number, caregiver_id, visits, settled_at IS NOT NULL AS settled, accepted_at IS NOT NULL AS accepted FROM orders WHERE id = $1',
      [orderId],
    );
    const o = rows[0];
    if (!o || o.caregiver_id !== user.id || !o.accepted) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    const st = await this.stateOf(orderId);
    let lines: SettlementLine[] = st.lines;
    let amountSen = st.amountSen;
    if (!o.settled) {
      const { visits, fees } = await this.inputs(o);
      const e = expectedSettlement(visits, fees);
      lines = e.lines;
      amountSen = e.caregiverSen;
    }
    const { rows: probs } = await this.db.pool.query<{ idx: number; by: 'caregiver' | 'owner'; kind: string; status: string }>(
      `SELECT idx, 'caregiver' AS by, kind, status FROM problem_reports WHERE order_id = $1 AND kind <> 'dispute_evidence'
       UNION ALL SELECT idx, 'owner' AS by, kind, status FROM cases WHERE order_id = $1 ORDER BY idx, by`,
      [orderId],
    );
    const open = new Set(probs.filter((p) => p.status !== 'decided').map((p) => p.idx));
    const refunds = (await this.refunds.linesFor(orderId)).map((l) => ({ key: l.key, reason: l.reason, amountSen: l.amountSen, done: l.state === 'refunded' }));
    const pay = await this.db.pool.query<{ amount_sen: number; status: string; at: string }>(
      `SELECT p.amount_sen, p.status, ${ts('p.updated_at')} AS at FROM settlements s JOIN payments p ON p.id = s.payout_id WHERE s.order_id = $1`,
      [orderId],
    );
    const p = pay.rows[0];
    return {
      orderId,
      number: o.number,
      state: st.state,
      reason: st.reason,
      amountSen,
      lines: lines.map((l) => ({ ...l, problemOpen: open.has(l.index) })),
      refunds,
      problems: probs.map((x) => ({
        index: x.idx,
        by: x.by,
        kind: x.by === 'caregiver' ? PROBLEM_KIND_LABEL[x.kind as ProblemKind] : CASE_KIND_LABEL[x.kind as CaseKind],
        status: x.by === 'caregiver' ? PROBLEM_STATUS_LABEL[x.status as ProblemStatus] : CASE_STATUS_LABEL[x.status as CaseStatus],
      })),
      payout: p ? { amountSen: p.amount_sen, state: p.status === 'succeeded' ? 'paid' : p.status === 'failed' ? 'failed' : 'paying', at: p.at } : null,
    };
  }

  private async sendPayout(orderId: number, o: Row, amountSen: number): Promise<void> {
    const p = await this.payments.createPayout({ ref: `order-${orderId}-payout`, amountSen, payee: `caregiver-${o.caregiver_id}` });
    await this.db.pool.query('UPDATE settlements SET payout_id = $2 WHERE order_id = $1', [orderId, p.id]);
    await this.messages.send(null, {
      userId: o.caregiver_id,
      role: 'caregiver',
      category: 'order',
      title: `Payout on its way: ${formatRM(amountSen)}`,
      body: `Order ${o.number} is settled. ${formatRM(amountSen)} is being paid to your bank account.`,
      link: { type: 'settlement', id: orderId },
    });
  }

  /** The caregiver is told when the bank confirms; a failed payout goes to the money queue (E13-4). */
  private async paid(paymentId: number): Promise<void> {
    const p = await this.payments.get(paymentId);
    // order-12-payout, and order-12-payout-r1 … sent again from the money queue (E13-4).
    const m = parseMoneyRef(p.ref);
    if (p.kind !== 'payout' || m?.kind !== 'payout') return;
    const o = await this.order(m.orderId);
    if (p.status === 'failed') {
      this.log.error(`Payout ${p.ref} (${formatRM(p.amountSen)}) failed: ${p.failureReason ?? 'no reason'}. Admin: send it again from Money.`);
      return;
    }
    if (p.status !== 'succeeded') return;
    await this.messages.send(null, {
      userId: o.caregiver_id,
      role: 'caregiver',
      category: 'order',
      title: `Paid: ${formatRM(p.amountSen)}`,
      body: `Order ${o.number}: ${formatRM(p.amountSen)} has reached your bank account.`,
      link: { type: 'settlement', id: Number(o.id) },
    });
  }

  /** R53-1, R53-4: where the order's money for the caregiver is now. */
  async stateOf(orderId: number): Promise<{ state: SettlementState; amountSen: number; lines: SettlementLine[]; reason: string | null }> {
    const { rows } = await this.db.pool.query<{ amount_sen: number; lines: SettlementLine[]; status: string | null }>(
      'SELECT s.amount_sen, s.lines, p.status FROM settlements s LEFT JOIN payments p ON p.id = s.payout_id WHERE s.order_id = $1',
      [orderId],
    );
    const s = rows[0];
    if (s) {
      const state: SettlementState = s.amount_sen === 0 ? 'nothing' : s.status === 'succeeded' ? 'paid' : s.status === 'failed' ? 'failed' : 'paying';
      return { state, amountSen: s.amount_sen, lines: s.lines, reason: null };
    }
    const block = await this.check(orderId);
    return { state: block?.state ?? 'pending', amountSen: 0, lines: [], reason: block?.reason ?? null };
  }

  /** Test tools: settle one order now instead of waiting for the 10-minute check (R53-6). */
  async settleNow(number: unknown): Promise<SettleResult> {
    const n = typeof number === 'string' ? number.trim().toUpperCase() : '';
    const { rows } = await this.db.pool.query<{ id: string; accepted: boolean }>('SELECT id, accepted_at IS NOT NULL AS accepted FROM orders WHERE number = $1', [n]);
    if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'No order with this number' });
    const id = Number(rows[0].id);
    if (!rows[0].accepted) throw new ConflictException({ code: 'NOT_READY', message: 'The caregiver has not accepted this order' });
    let rewarded = false;
    if (!(await this.order(id)).settled) {
      const block = await this.check(id);
      if (block) throw new ConflictException({ code: 'NOT_READY', message: `Not ready to settle: ${block.reason}` });
      const before = await this.db.pool.query('SELECT 1 FROM referrals r JOIN orders o ON o.owner_id = r.friend_id WHERE o.id = $1 AND r.rewarded_at IS NULL', [id]);
      await this.settle(id);
      const after = await this.db.pool.query('SELECT 1 FROM referrals WHERE order_id = $1', [id]);
      rewarded = !!before.rowCount && !!after.rowCount;
    }
    const st = await this.stateOf(id);
    return { number: n, state: st.state, amountSen: st.amountSen, lines: st.lines, rewarded };
  }

  /**
   * Test tools: every visit not final yet is marked confirmed, as if the caregiver did it and the owner confirmed it.
   * Only for an accepted order with nothing open.
   */
  async finishNow(number: unknown): Promise<{ number: string; finished: number }> {
    const n = typeof number === 'string' ? number.trim().toUpperCase() : '';
    const { rows } = await this.db.pool.query<{ id: string; accepted: boolean }>('SELECT id, accepted_at IS NOT NULL AS accepted FROM orders WHERE number = $1', [n]);
    if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'No order with this number' });
    if (!rows[0].accepted) throw new ConflictException({ code: 'NOT_ACCEPTED', message: 'The caregiver has not accepted this order' });
    const id = Number(rows[0].id);
    const o = await this.order(id);
    const finished = await this.db.tx(async (client) => {
      let count = 0;
      for (let i = 0; i < o.visits.length; i++) {
        const r = await client.query<{ status: string }>('SELECT status FROM visit_runs WHERE order_id = $1 AND idx = $2 FOR UPDATE', [id, i]);
        const status = r.rows[0]?.status ?? 'todo';
        if (['confirmed', 'cancelled', 'closed', 'moved', 'disputed'].includes(status)) continue;
        await client.query(
          `INSERT INTO visit_runs (order_id, idx, status, arrived_at, entered_at, entered_by, reported_at, confirmed_at, confirmed_by)
           VALUES ($1, $2, 'confirmed', now(), now(), 'caregiver', now(), now(), 'auto')
           ON CONFLICT (order_id, idx) DO UPDATE SET status = 'confirmed', reported_at = COALESCE(visit_runs.reported_at, now()), confirmed_at = now(), confirmed_by = 'auto', updated_at = now()`,
          [id, i],
        );
        await this.history.record(client, { entity: 'visit', entityId: id, from: status, to: 'confirmed', actor: { type: 'system', id: 'test-tools' }, reason: `Visit ${i + 1} finished by Test tools` });
        count++;
      }
      return count;
    });
    return { number: n, finished };
  }

  private async order(id: number): Promise<Row> {
    const { rows } = await this.db.pool.query<Row>('SELECT id, number, caregiver_id, visits, settled_at IS NOT NULL AS settled FROM orders WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return rows[0];
  }
}

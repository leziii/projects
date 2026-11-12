import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NOT_STARTED,
  RuleError,
  cancelLines,
  formatRM,
  notCancelledText,
  refundSplitText,
  visitWhen,
  type CancelLine,
  type CancelPreview,
  type CancelRefundState,
  type CancelResult,
  type OrderVisit,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { PaymentsService } from '../payments/payments.service';
import { PromosService } from '../promos/promos.service';
import { ReferralsService } from '../referrals/referrals.service';
import { VisitRunsService, runKey } from './visit-runs.service';

interface Row {
  id: number;
  number: string;
  owner_id: number;
  caregiver_id: number;
  status: string;
  visits: OrderVisit[];
  credit_sen: number;
  charge_id: number | null;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** E10-1 O15 (round 42): the owner cancels chosen visits of a booked order that have not started. */
@Injectable()
export class CancelService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CancelService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly runs: VisitRunsService,
    private readonly payments: PaymentsService,
    private readonly referrals: ReferralsService,
    private readonly promos: PromosService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Tests run the retry themselves; ORDER_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    // R43-4: refunds that could not start are tried again every 5 minutes.
    this.timer = setInterval(() => void this.retryRefunds().catch((e: Error) => this.log.error(e.message)), 5 * 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** R42-1, R42-3: every visit with what cancelling it now would refund. */
  async preview(user: User, id: number, now = new Date()): Promise<CancelPreview> {
    const o = await this.booked(this.db.pool, user, id);
    return { orderId: o.id, number: o.number, lines: await this.lines(this.db.pool, o, now) };
  }

  /**
   * R42-3 … R42-6, R43-1 … R43-5: cancels the chosen visits at today's %. Visits that can no longer be cancelled are
   * left as they are and listed with why; the others go ahead. `percents` are what the owner saw: if a 24 h or 1 h line
   * has passed since for any of them, nothing is cancelled and the new amounts come back to confirm again (R42-4).
   */
  async cancel(user: User, id: number, body: { visits?: unknown; percents?: unknown }, now = new Date()): Promise<CancelResult> {
    const chosen = body?.visits;
    const seen = body?.percents;
    if (!Array.isArray(chosen) || !chosen.length || chosen.some((i) => !Number.isInteger(i)) || new Set(chosen).size !== chosen.length) {
      throw new RuleError('CANCEL_INVALID', 'Choose at least one visit');
    }
    if (!Array.isArray(seen) || seen.length !== chosen.length) throw new RuleError('CANCEL_INVALID', 'Refund amounts missing; open the page again');
    const picks = (chosen as number[]).map((index, k) => ({ index, seen: seen[k] as unknown })).sort((a, b) => a.index - b.index);

    const done = await this.db.tx(async (client) => {
      const o = await this.booked(client, user, id, true);
      const lines = await this.lines(client, o, now);
      if (picks.some((p) => !lines[p.index])) throw new RuleError('CANCEL_INVALID', 'Choose at least one visit');
      const failed: CancelResult['failed'] = picks.filter((p) => lines[p.index].blocked).map((p) => ({ index: p.index, reason: notCancelledText(lines[p.index].blocked!) }));
      const go = picks.filter((p) => !lines[p.index].blocked);
      if (go.some((p) => lines[p.index].percent !== p.seen)) {
        throw new ConflictException({ code: 'AMOUNT_CHANGED', message: 'The refund changed because time passed. Check the new amounts and confirm again.', preview: { orderId: o.id, number: o.number, lines } });
      }
      const pick: CancelLine[] = [];
      for (const p of go) {
        const l = lines[p.index];
        const v = o.visits[l.index];
        const { rowCount } = await client.query(
          "INSERT INTO visit_runs (order_id, idx, status, cancelled_at, cancel_percent, cancel_refund_sen, cancel_credit_sen) VALUES ($1, $2, 'cancelled', now(), $3, $4, $5) ON CONFLICT DO NOTHING",
          [o.id, l.index, l.percent, l.refundSen, l.creditSen],
        );
        // The caregiver tapped Arrived a moment ago.
        if (!rowCount) {
          failed.push({ index: l.index, reason: notCancelledText('Caregiver already arrived') });
          continue;
        }
        pick.push(l);
        // R42-5: the caregiver's time is free again.
        await client.query("DELETE FROM booked_visits WHERE order_id = $1 AND source = 'order' AND visit_date = $2 AND start_min = $3", [o.id, v.date, v.start]);
        await this.history.record(client, {
          entity: 'visit',
          entityId: o.id,
          from: 'todo',
          to: 'cancelled',
          actor: { type: 'owner', id: String(user.id) },
          reason: `Owner cancelled visit ${l.index + 1} (${v.date}): ${l.percent}% back = ${formatRM(l.refundSen)}`,
        });
      }
      failed.sort((a, b) => a.index - b.index);
      const creditSen = pick.reduce((s, l) => s + l.creditSen, 0);
      const refundSen = pick.reduce((s, l) => s + l.refundSen, 0);
      if (!pick.length) return { o, pick, failed, refundSen, creditSen, orderCancelled: false };
      if (creditSen) await this.referrals.returnPart(client, o.id, creditSen);

      // R42-6: every visit cancelled → the order is cancelled; the promo use comes back only on a 100% refund of all.
      const after = await this.runs.forOrders([o.id], client);
      const all = o.visits.map((_, i) => after.get(runKey(o.id, i)) ?? NOT_STARTED);
      const orderCancelled = all.every((r) => r.status === 'cancelled');
      if (orderCancelled) {
        await client.query("UPDATE orders SET status = 'cancelled', end_reason = 'cancelled', updated_at = now() WHERE id = $1", [o.id]);
        await this.history.record(client, { entity: 'order', entityId: o.id, from: 'accepted', to: 'cancelled', actor: { type: 'owner', id: String(user.id) }, reason: 'Owner cancelled every visit' });
        if (all.every((r) => r.cancel?.percent === 100)) await this.promos.giveBack(client, [o.id]);
      }

      // R43-5: only the visits actually cancelled.
      const whens = pick.map((l) => visitWhen(o.visits[l.index]));
      const names = pick.map((l) => `visit ${l.index + 1}`);
      await this.messages.send(client, {
        userId: o.caregiver_id,
        role: 'caregiver',
        category: 'order',
        title: pick.length === 1 ? `Visit ${pick[0].index + 1} cancelled` : `${pick.length} visits cancelled`,
        body: `Order ${o.number}: the owner cancelled ${list(whens)}. ${pick.length === 1 ? 'It is' : 'They are'} no longer in your tasks.`,
        link: { type: 'request', id: o.id },
      });
      if (refundSen) {
        await this.messages.send(client, {
          userId: o.owner_id,
          role: 'owner',
          category: 'refund',
          title: `Refund: ${formatRM(refundSen)}`,
          body: `Order ${o.number}: you cancelled ${list(names)}. ${refundSplitText(refundSen, creditSen)}.`,
          link: { type: 'order', id: o.id },
        });
      }
      return { o, pick, failed, refundSen, creditSen, orderCancelled };
    });

    // Money goes back per visit, once each (the ref makes a repeat do nothing). R43-4: if it cannot start, the visit
    // stays cancelled and the worker tries again.
    const cancelled: CancelResult['cancelled'] = [];
    for (const l of done.pick) {
      const money = l.refundSen - l.creditSen;
      const refund: CancelRefundState = !money ? (l.refundSen ? 'started' : 'none') : (await this.sendRefund(done.o.id, done.o.number, done.o.charge_id, l.index, money)) ? 'started' : 'processing';
      cancelled.push({ index: l.index, percent: l.percent!, refundSen: l.refundSen, creditSen: l.creditSen, refund });
    }
    return { cancelled, failed: done.failed, refundSen: done.refundSen, creditSen: done.creditSen, orderCancelled: done.orderCancelled };
  }

  /** R43-4: cancelled visits whose money refund never started are tried again. Returns how many started now. */
  async retryRefunds(): Promise<number> {
    const { rows } = await this.db.pool.query<{ order_id: number; number: string; charge_id: number | null; idx: number; money: number }>(
      `SELECT r.order_id, o.number, o.charge_id, r.idx, r.cancel_refund_sen - r.cancel_credit_sen AS money
       FROM visit_runs r JOIN orders o ON o.id = r.order_id
       WHERE r.status = 'cancelled' AND r.cancel_refund_sen > r.cancel_credit_sen
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.ref = 'order-' || r.order_id || '-refund-v' || r.idx)
       ORDER BY r.cancelled_at LIMIT 50`,
    );
    let started = 0;
    for (const r of rows) if (await this.sendRefund(Number(r.order_id), r.number, r.charge_id, r.idx, r.money)) started++;
    return started;
  }

  private async sendRefund(orderId: number, number: string, chargeId: number | null, idx: number, money: number): Promise<boolean> {
    try {
      if (!chargeId) throw new Error('no paid charge');
      await this.payments.createRefund({ ref: `order-${orderId}-refund-v${idx}`, chargeId: Number(chargeId), amountSen: money });
      return true;
    } catch (e) {
      this.log.error(`Refund for order ${number} visit ${idx + 1} could not start, will retry: ${(e as Error).message}`);
      return false;
    }
  }

  private async booked(conn: PoolClient | DbService['pool'], user: User, id: number, lock = false): Promise<Row> {
    const { rows } = await conn.query<Row>(`SELECT id, number, owner_id, caregiver_id, status, visits, credit_sen, charge_id FROM orders WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    const o = rows[0];
    if (!o || o.owner_id !== user.id) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (o.status !== 'accepted') throw new ConflictException({ code: 'ORDER_NOT_BOOKED', message: 'Only visits of a booked order can be cancelled' });
    return o;
  }

  private async lines(conn: PoolClient | DbService['pool'], o: Row, now: Date): Promise<CancelLine[]> {
    const map = await this.runs.forOrders([o.id], conn as PoolClient);
    return cancelLines(o.visits, o.credit_sen, o.visits.map((_, i) => map.get(runKey(o.id, i)) ?? NOT_STARTED), now);
  }
}

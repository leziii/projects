import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REFUND_RETRIES,
  REFUND_RETRY_MINUTES,
  formatRM,
  refundReason,
  refundTotals,
  type AdminUser,
  type OrderRefunds,
  type PaymentStatus,
  type RefundLine,
  type StuckRefund,
  type User,
} from '@pawpal/shared';
import { DbService, ts } from '../db/db.service';
import { MessagesService } from '../messages/messages.service';
import { PaymentsService } from '../payments/payments.service';

/** order-12-refund-v0, order-12-refund-34 (whole charge 34), order-12-refund-w5 / -o5 (unused extra fee 5), each with retries -r1, -r2 … */
const REF = /^order-(\d+)-refund-([vwo]\d+|\d+)(?:-r(\d+))?$/;

interface Attempt {
  id: number;
  ref: string;
  amount_sen: number;
  status: PaymentStatus;
  failure_reason: string | null;
  parent_id: number | null;
  updated: string;
  updated_ms: number;
}

/** One refund of an order with every try at it, oldest first. */
interface Refund {
  orderId: number;
  key: string;
  base: string;
  amountSen: number;
  attempts: Attempt[];
}

interface OrderRow {
  id: number;
  number: string;
  owner_id: number;
  end_reason: string | null;
  charge_id: number | null;
}

const keyOf = (part: string) => (/^[vwo]/.test(part) ? part : `full-${part}`);
const baseOf = (orderId: number, key: string) => `order-${orderId}-refund-${key.startsWith('full-') ? key.slice(5) : key}`;

/** E10-3 O16 (round 44): each refund of an order, retries of failed ones, and the admin's list of stuck ones. */
@Injectable()
export class RefundsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RefundsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly payments: PaymentsService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // R44-5: the owner is told once the bank confirms.
    this.payments.onSettled((id) => this.settled(id));
    // Tests run the retry themselves; ORDER_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    // R44-4: failed refunds are tried again a few minutes apart.
    this.timer = setInterval(() => void this.retryFailed().catch((e: Error) => this.log.error(e.message)), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** R44-1 … R44-3: what the owner sees on O16. */
  async forOrder(user: User, id: number): Promise<OrderRefunds> {
    const o = await this.order(id);
    if (!o || o.owner_id !== user.id) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return this.summary(o);
  }

  /** Due (money) for O13, counting refunds still being processed. */
  async dueSen(id: number): Promise<number> {
    const o = await this.order(id);
    return o ? (await this.summary(o)).dueSen : 0;
  }

  /** R44-4: every failed refund with tries left is tried again once the wait has passed. Returns how many were sent. */
  async retryFailed(now = new Date()): Promise<number> {
    let sent = 0;
    for (const r of await this.refunds()) {
      const last = r.attempts[r.attempts.length - 1];
      if (r.attempts.some((a) => a.status === 'succeeded') || last.status !== 'failed') continue;
      if (r.attempts.length > REFUND_RETRIES) continue;
      if (now.getTime() - last.updated_ms < REFUND_RETRY_MINUTES * 60_000) continue;
      if (await this.tryAgain(r, last)) sent++;
    }
    return sent;
  }

  /** R44-4: refunds that failed every automatic try; the admin sees them on Payments. */
  async stuck(): Promise<StuckRefund[]> {
    const out: StuckRefund[] = [];
    const orders = new Map<number, OrderRow>();
    for (const r of await this.refunds()) {
      const last = r.attempts[r.attempts.length - 1];
      if (r.attempts.some((a) => a.status === 'succeeded') || last.status !== 'failed' || r.attempts.length <= REFUND_RETRIES) continue;
      if (!orders.has(r.orderId)) orders.set(r.orderId, (await this.order(r.orderId))!);
      const o = orders.get(r.orderId)!;
      out.push({ orderId: o.id, number: o.number, key: r.key, reason: refundReason(r.key, o.end_reason), amountSen: r.amountSen, tries: r.attempts.length, lastFailure: last.failure_reason, failedAt: last.updated });
    }
    return out;
  }

  /** R44-4: the admin sends a stuck (or any failed) refund again. */
  async adminRetry(admin: AdminUser, orderId: unknown, key: unknown): Promise<StuckRefund[]> {
    const r = (await this.refunds(Number(orderId))).find((x) => x.key === key);
    const last = r?.attempts[r.attempts.length - 1];
    if (!r || !last) throw new NotFoundException({ code: 'REFUND_NOT_FOUND', message: 'Refund not found' });
    if (r.attempts.some((a) => a.status === 'succeeded') || last.status !== 'failed') {
      throw new ConflictException({ code: 'REFUND_NOT_FAILED', message: 'This refund has not failed' });
    }
    this.log.log(`Admin ${admin.username} retries refund ${r.base}`);
    if (!(await this.tryAgain(r, last))) throw new ConflictException({ code: 'REFUND_NOT_SENT', message: 'The refund could not be sent; try again later' });
    return this.stuck();
  }

  private async tryAgain(r: Refund, last: Attempt): Promise<boolean> {
    try {
      const p = await this.payments.createRefund({ ref: `${r.base}-r${r.attempts.length}`, chargeId: last.parent_id, amountSen: r.amountSen });
      // The gateway could not be reached at all: failed at once, with no callback to follow.
      if (p.status === 'failed' && r.attempts.length >= REFUND_RETRIES) this.alert(r, p.failureReason);
      return true;
    } catch (e) {
      this.log.error(`Refund ${r.base} could not be sent again: ${(e as Error).message}`);
      return false;
    }
  }

  private alert(r: Pick<Refund, 'base' | 'amountSen'>, why: string | null) {
    this.log.error(`Refund ${r.base} (${formatRM(r.amountSen)}) failed ${REFUND_RETRIES + 1} times: ${why ?? 'no reason'}. Admin: retry it from Payments.`);
  }

  /** R44-5: the owner is told when the money is back; R44-4: a failure after the last automatic try alerts the admin. */
  private async settled(paymentId: number): Promise<void> {
    const p = await this.payments.get(paymentId);
    const m = REF.exec(p.ref);
    if (p.kind !== 'refund' || !m) return;
    if (p.status === 'failed') {
      if (Number(m[3] ?? 0) >= REFUND_RETRIES) this.alert({ base: p.ref.replace(/-r\d+$/, ''), amountSen: p.amountSen }, p.failureReason);
      return;
    }
    const o = await this.order(Number(m[1]));
    if (!o) return;
    const money = formatRM(p.amountSen);
    await this.messages.send(null, {
      userId: o.owner_id,
      role: 'owner',
      category: 'refund',
      title: `Refund received: ${money}`,
      body: `Order ${o.number}: ${money} (${refundReason(keyOf(m[2]), o.end_reason)}) is back to how you paid.`,
      link: { type: 'order', id: o.id },
    });
  }

  private async summary(o: OrderRow): Promise<OrderRefunds> {
    const refunds = await this.refunds(o.id);
    const lines: RefundLine[] = refunds.map((r) => {
      const ok = r.attempts.find((a) => a.status === 'succeeded');
      const last = r.attempts[r.attempts.length - 1];
      const state: RefundLine['state'] = ok ? 'refunded' : last && last.status !== 'failed' ? 'on_its_way' : 'processing';
      return { key: r.key, reason: refundReason(r.key, o.end_reason), amountSen: r.amountSen, state, doneAt: ok?.updated ?? null };
    });
    const credit = await this.db.pool.query<{ sen: number }>("SELECT COALESCE(SUM(amount_sen), 0)::int AS sen FROM credit_spends WHERE order_id = $1 AND status = 'returned'", [o.id]);
    return { orderId: o.id, number: o.number, ...refundTotals(lines), creditBackSen: credit.rows[0].sen, lines };
  }

  /** Refunds of one order (or all), each with its tries; a cancelled visit whose refund never started has none yet. */
  private async refunds(orderId?: number): Promise<Refund[]> {
    const { rows } = await this.db.pool.query<Attempt>(
      `SELECT id, ref, amount_sen, status, failure_reason, parent_id, ${ts('updated_at')} AS updated, (extract(epoch FROM updated_at) * 1000)::float8 AS updated_ms
       FROM payments WHERE kind = 'refund' AND ref LIKE $1 ORDER BY id`,
      [orderId === undefined ? 'order-%-refund-%' : `order-${orderId}-refund-%`],
    );
    const map = new Map<string, Refund>();
    for (const a of rows) {
      const m = REF.exec(a.ref);
      if (!m) continue;
      const key = keyOf(m[2]);
      const base = baseOf(Number(m[1]), key);
      const r = map.get(base) ?? { orderId: Number(m[1]), key, base, amountSen: a.amount_sen, attempts: [] };
      r.attempts.push(a);
      map.set(base, r);
    }
    if (orderId !== undefined) {
      // R43-4: money due for a cancelled visit, not sent yet.
      const visits = await this.db.pool.query<{ idx: number; money: number }>(
        "SELECT idx, cancel_refund_sen - cancel_credit_sen AS money FROM visit_runs WHERE order_id = $1 AND status = 'cancelled' AND cancel_refund_sen > cancel_credit_sen ORDER BY idx",
        [orderId],
      );
      for (const v of visits.rows) {
        const base = baseOf(orderId, `v${v.idx}`);
        if (!map.has(base)) map.set(base, { orderId, key: `v${v.idx}`, base, amountSen: v.money, attempts: [] });
      }
    }
    return [...map.values()].sort((a, b) => order(a.key) - order(b.key));
  }

  private async order(id: number): Promise<OrderRow | undefined> {
    const { rows } = await this.db.pool.query<OrderRow>('SELECT id, number, owner_id, end_reason, charge_id FROM orders WHERE id = $1', [id]);
    return rows[0];
  }
}

/** Whole-order refunds first, then visits in order, then unused extra fees (E11-4). */
const order = (key: string) => (key.startsWith('v') ? 1 + Number(key.slice(1)) : /^[wo]/.test(key) ? 1e6 + Number(key.slice(1)) : 0);

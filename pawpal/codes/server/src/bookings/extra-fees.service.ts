import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import {
  PAY_METHODS,
  RuleError,
  WAITING_RULES,
  formatRM,
  overtimeText,
  overtimeUntilText,
  serviceEndMin,
  visitTime,
  waitingState,
  type ExtraFee,
  type ExtraFeeKind,
  type ExtraFeeStatus,
  type OrderVisit,
  type PaymentMethod,
  type PaymentStatus,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { PaymentsService } from '../payments/payments.service';

/** fee-12-0, fee-12-1 …: each try at paying fee 12. */
const CHARGE_REF = /^fee-(\d+)-(\d+)$/;

interface FeeRow {
  id: string;
  order_id: string;
  number: string;
  owner_id: number;
  caregiver_id: number;
  display_name: string;
  idx: number;
  kind: ExtraFeeKind;
  units: number;
  amount_sen: number;
  status: ExtraFeeStatus;
  requested: string;
  paid: string | null;
  visits: OrderVisit[];
  entry_method: ExtraFee['entryMethod'];
  arrived: string | null;
  entered: string | null;
}

const SELECT = `SELECT f.id, f.order_id, o.number, o.owner_id, o.caregiver_id, c.display_name, f.idx, f.kind, f.units, f.amount_sen, f.status,
    ${ts('f.requested_at')} AS requested, ${ts('f.paid_at')} AS paid, o.visits, o.entry_method, ${ts('r.arrived_at')} AS arrived, ${ts('r.entered_at')} AS entered
  FROM extra_fees f JOIN orders o ON o.id = f.order_id JOIN caregiver_profiles c ON c.user_id = o.caregiver_id
  LEFT JOIN visit_runs r ON r.order_id = f.order_id AND r.idx = f.idx`;

/** "Siti Aminah" → "Siti A." */
const shortName = (full: string) => {
  const w = full.trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1].charAt(0).toUpperCase()}.` : w[0];
};

/** E11-3 O19 (round 47): the owner pays or declines the caregiver's waiting and overtime requests. */
@Injectable()
export class ExtraFeesService implements OnModuleInit {
  private readonly log = new Logger(ExtraFeesService.name);

  constructor(
    private readonly db: DbService,
    private readonly payments: PaymentsService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit() {
    this.payments.onSettled((id) => this.settled(id));
  }

  /** R47-1: every extra fee of the owner's order, newest first. */
  async forOrder(user: User, orderId: number, now = new Date()): Promise<ExtraFee[]> {
    const owner = await this.db.pool.query<{ owner_id: number }>('SELECT owner_id FROM orders WHERE id = $1', [orderId]);
    if (owner.rows[0]?.owner_id !== user.id) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    await this.lapseDue(orderId, now);
    const { rows } = await this.db.pool.query<FeeRow>(`${SELECT} WHERE f.order_id = $1 AND f.status <> 'withdrawn' ORDER BY f.id DESC`, [orderId]);
    return Promise.all(rows.map((r) => this.toFee(r)));
  }

  /** R47-2, R47-3, R47-5: start (or try again) paying one fee. */
  async pay(user: User, orderId: number, feeId: number, methodIn: unknown, now = new Date()): Promise<{ fee: ExtraFee; paymentId: number }> {
    const method = methodIn as PaymentMethod;
    if (!PAY_METHODS.includes(method)) throw new RuleError('BAD_METHOD', 'Choose how to pay');
    const fee = await this.one(user, orderId, feeId, now);
    if (fee.status !== 'requested') throw new ConflictException({ code: 'FEE_CLOSED', message: `This request is closed: ${fee.status.replace('_', ' ')}` });
    // A payment still being checked is never doubled.
    if (fee.payment && (fee.payment.status === 'pending' || fee.payment.status === 'checking')) return { fee, paymentId: fee.payment.id };
    const tries = await this.db.pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM payments WHERE kind = 'charge' AND ref LIKE $1", [`fee-${feeId}-%`]);
    const p = await this.payments.createCharge({ ref: `fee-${feeId}-${tries.rows[0].n}`, amountSen: fee.amountSen, method });
    return { fee: await this.one(user, orderId, feeId, now), paymentId: p.id };
  }

  /** R47-2: overtime only; the caregiver is told and does the booked service only. */
  async decline(user: User, orderId: number, feeId: number, now = new Date()): Promise<ExtraFee> {
    const fee = await this.one(user, orderId, feeId, now);
    if (fee.kind !== 'overtime') throw new ConflictException({ code: 'CANNOT_DECLINE', message: 'Waiting cannot be declined: let the caregiver in, or pay the prepay' });
    if (fee.payment && (fee.payment.status === 'pending' || fee.payment.status === 'checking')) throw new ConflictException({ code: 'FEE_PAYING', message: 'Your payment is being checked' });
    await this.db.tx(async (client) => {
      const { rowCount } = await client.query("UPDATE extra_fees SET status = 'declined', updated_at = now() WHERE id = $1 AND status = 'requested'", [feeId]);
      if (!rowCount) throw new ConflictException({ code: 'FEE_CLOSED', message: 'This request is already closed' });
      await this.history.record(client, { entity: 'extra_fee', entityId: feeId, from: 'requested', to: 'declined', actor: { type: 'owner', id: String(user.id) }, reason: `Owner declined overtime ${overtimeText(fee.units)} for visit ${fee.index + 1} of ${fee.number}` });
      await this.tellCaregiver(client, fee, 'Overtime declined', `Order ${fee.number}: the owner declined ${overtimeText(fee.units)}. Finish the booked service only.`);
    });
    return this.one(user, orderId, feeId, now);
  }

  /** E11-1 → E11-3: the waiting request becomes a fee the owner can prepay (R45-4, R47-3). */
  async addWaiting(client: PoolClient, orderId: number, index: number): Promise<void> {
    await client.query(
      "INSERT INTO extra_fees (order_id, idx, kind, units, amount_sen, status) VALUES ($1, $2, 'waiting', $3, $4, 'requested') ON CONFLICT DO NOTHING",
      [orderId, index, WAITING_RULES.maxMin / WAITING_RULES.stepMin, WAITING_RULES.maxSen],
    );
  }

  /** R47-3: let in within the free 10 minutes (or before waiting began) → nothing to pay. Called inside the entry transaction. */
  async afterEntry(client: PoolClient, orderId: number, index: number): Promise<void> {
    const { rows } = await client.query<FeeRow>(`${SELECT} WHERE f.order_id = $1 AND f.idx = $2 AND f.kind = 'waiting' AND f.status = 'requested'`, [orderId, index]);
    const r = rows[0];
    if (!r || !r.entered) return;
    const v = r.visits[index];
    if (waitingState({ date: v.date, start: v.start, arrivedAt: r.arrived, enteredAt: r.entered }, new Date()).feeSen === 0) {
      await client.query("UPDATE extra_fees SET status = 'not_needed', updated_at = now() WHERE id = $1 AND status = 'requested'", [r.id]);
    }
  }

  /** R47-4: an unpaid overtime request lapses once the booked service time has ended. */
  async lapseDue(orderId: number, now = new Date()): Promise<void> {
    const { rows } = await this.db.pool.query<FeeRow>(`${SELECT} WHERE f.order_id = $1 AND f.kind = 'overtime' AND f.status = 'requested'`, [orderId]);
    for (const r of rows) {
      const v = r.visits[r.idx];
      const end = visitTime({ date: v.date, start: 0 }).getTime() + serviceEndMin({ start: v.start, minutes: v.quote.totalMinutes, enteredAt: r.entered }) * 60_000;
      if (now.getTime() < end) continue;
      const pay = await this.latestCharge(Number(r.id));
      if (pay && (pay.status === 'pending' || pay.status === 'checking')) continue;
      await this.db.pool.query("UPDATE extra_fees SET status = 'lapsed', updated_at = now() WHERE id = $1 AND status = 'requested'", [r.id]);
    }
  }

  /** R47-2, R47-5: a paid charge closes the fee and tells the caregiver; paid after it closed → refunded in full. */
  private async settled(paymentId: number): Promise<void> {
    const p = await this.payments.get(paymentId);
    const m = CHARGE_REF.exec(p.ref);
    if (p.kind !== 'charge' || p.status !== 'succeeded' || !m) return;
    const feeId = Number(m[1]);
    const { rows } = await this.db.pool.query<FeeRow>(`${SELECT} WHERE f.id = $1`, [feeId]);
    const r = rows[0];
    if (!r) return;
    const fee = await this.toFee(r);
    const paid = await this.db.tx(async (client) => {
      const { rowCount } = await client.query("UPDATE extra_fees SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1 AND status = 'requested'", [feeId]);
      if (!rowCount) return false;
      await this.history.record(client, { entity: 'extra_fee', entityId: feeId, from: 'requested', to: 'paid', actor: { type: 'gateway' }, reason: `Owner paid ${fee.kind} ${formatRM(fee.amountSen)} for visit ${fee.index + 1} of ${fee.number}` });
      if (fee.kind === 'overtime') {
        await this.tellCaregiver(client, fee, `Overtime paid: ${overtimeText(fee.units)}`, `Order ${fee.number}: the owner paid. You may stay until ${overtimeUntilText(fee.visit, fee.units)}.`);
      } else {
        await this.tellCaregiver(client, fee, 'Waiting prepaid', `Order ${fee.number}: the owner prepaid waiting (${formatRM(fee.amountSen)}). Wait until they let you in, up to 60 min.`);
      }
      return true;
    });
    if (!paid) {
      // The request closed (lapsed, declined, let in) while the payment was going through.
      this.log.warn(`Fee ${feeId} was paid after it closed; refunding ${formatRM(p.amountSen)}`);
      await this.payments.createRefund({ ref: `fee-${feeId}-refund-${paymentId}`, chargeId: paymentId, amountSen: p.amountSen }).catch((e: Error) => this.log.error(e.message));
    }
  }

  private async one(user: User, orderId: number, feeId: number, now: Date): Promise<ExtraFee> {
    const fee = (await this.forOrder(user, orderId, now)).find((f) => f.id === feeId);
    if (!fee) throw new NotFoundException({ code: 'FEE_NOT_FOUND', message: 'Request not found' });
    return fee;
  }

  private async latestCharge(feeId: number): Promise<{ id: number; status: PaymentStatus; method: PaymentMethod | null } | null> {
    const { rows } = await this.db.pool.query<{ id: number; status: PaymentStatus; method: PaymentMethod | null }>(
      "SELECT id, status, method FROM payments WHERE kind = 'charge' AND ref LIKE $1 ORDER BY id DESC LIMIT 1",
      [`fee-${feeId}-%`],
    );
    return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
  }

  private async toFee(r: FeeRow): Promise<ExtraFee> {
    const v = r.visits[r.idx];
    return {
      id: Number(r.id),
      orderId: Number(r.order_id),
      number: r.number,
      index: r.idx,
      kind: r.kind,
      units: r.units,
      amountSen: r.amount_sen,
      status: r.status,
      requestedAt: r.requested,
      paidAt: r.paid,
      caregiver: shortName(r.display_name),
      visit: { date: v.date, start: v.start, minutes: v.quote.totalMinutes, arrivedAt: r.arrived, enteredAt: r.entered },
      entryMethod: r.entry_method,
      payment: await this.latestCharge(Number(r.id)),
    };
  }

  private async tellCaregiver(client: PoolClient, fee: ExtraFee, title: string, body: string): Promise<void> {
    const { rows } = await client.query<{ caregiver_id: number }>('SELECT caregiver_id FROM orders WHERE id = $1', [fee.orderId]);
    await this.messages.send(client, { userId: rows[0].caregiver_id, role: 'caregiver', category: 'order', title, body, link: { type: 'request', id: fee.orderId } });
  }
}

import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RULES,
  ORDER_LIST_RULES,
  PAY_METHODS,
  RuleError,
  REJECT_REASONS,
  acceptWindow,
  isFree,
  isOrderFilter,
  clashText,
  deadlineText,
  firstVisitOf,
  klInstant,
  formatRM,
  visitWhen,
  orderNumber,
  splitDiscount,
  visitTime,
  type AcceptKind,
  type Actor,
  type OrderDetail,
  type OrderEnd,
  type OrderFilter,
  type OrderPage,
  type OrderStatus,
  type RejectReason,
  type OrderView,
  type OrderVisit,
  type PaymentMethod,
  type PetKind,
  type User,
  type VisitReport,
  NOT_STARTED,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { AddressesService } from '../addresses/addresses.service';
import { AlertsService } from '../alerts/alerts.service';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME } from '../files/file-store';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { PaymentsService } from '../payments/payments.service';
import { PromosService } from '../promos/promos.service';
import { ReferralsService } from '../referrals/referrals.service';
import { ScheduleService } from '../caregivers/schedule.service';
import { BookingsService } from './bookings.service';
import { ReviewsService } from './reviews.service';
import { VisitRunsService, runKey } from './visit-runs.service';

interface OrderRow {
  id: number;
  number: string;
  owner_id: number;
  caregiver_id: number;
  address_id: number;
  status: OrderStatus;
  level: OrderView['level'];
  pets: OrderView['pets'];
  visits: OrderVisit[];
  total_sen: number;
  discount_sen: number;
  credit_sen: number;
  promo_code: string | null;
  entry_method: OrderView['entryMethod'];
  charge_id: number | null;
  attempts: number;
  accept_kind: AcceptKind | null;
  end_reason: OrderEnd | null;
  created: string;
  paid: string | null;
  deadline: string | null;
}

const ENTITY = 'order';
const SYSTEM: Actor = { type: 'system' };
/** Payments still checking are asked about again this often (a lost callback, R22-2). */
const WORKER_EVERY_MS = 60_000;
/** Requests past their deadline are failed and refunded this often (R27-1). */
const EXPIRY_EVERY_MS = 30_000;

/** Confirm and pay (E5-4, O10) and the payment result (E5-5, O11): the order is made at Pay with prices locked; the result comes from the gateway. */
@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OrdersService.name);
  private timer?: ReturnType<typeof setInterval>;
  private expiryTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService,
    private readonly promos: PromosService,
    private readonly referrals: ReferralsService,
    private readonly alerts: AlertsService,
    private readonly schedules: ScheduleService,
    private readonly addresses: AddressesService,
    private readonly runs: VisitRunsService,
    private readonly files: FileStore,
    private readonly reviews: ReviewsService,
  ) {}

  onModuleInit() {
    // The order follows its payment as soon as the gateway answers, even with the app closed (R22-5).
    this.payments.onSettled(async (paymentId) => {
      const { rows } = await this.db.pool.query<{ id: number }>('SELECT id FROM orders WHERE charge_id = $1', [paymentId]);
      for (const { id } of rows) await this.sync(id);
    });
    // Tests run the check themselves; ORDER_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.checkStuck().catch((e: Error) => this.log.error(e.message)), WORKER_EVERY_MS);
    // R27-1: requests past their deadline fail with a full refund within 30 s.
    this.expiryTimer = setInterval(() => void this.expireDue().catch((e: Error) => this.log.error(e.message)), EXPIRY_EVERY_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    clearInterval(this.expiryTimer);
  }

  /**
   * R27-1 … R27-3: every request past its deadline fails, the owner gets a full refund at once, promo use and credit
   * go back, and the caregiver is told. Each order is claimed by one update, so two servers never refund it twice.
   */
  async expireDue(): Promise<number> {
    const { rows } = await this.db.pool.query<{ id: number }>("SELECT id FROM orders WHERE status = 'pending_accept' AND accept_deadline <= now() ORDER BY accept_deadline");
    let n = 0;
    for (const { id } of rows) {
      try {
        if (await this.timeOut(id)) n++;
      } catch (e) {
        // One bad order must not hold up the others; it is tried again next round.
        this.log.error(`Could not time out order ${id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  private async timeOut(id: number): Promise<boolean> {
    const done = await this.db.tx(async (client: PoolClient) => {
      const { rows } = await client.query<{ id: number }>(
        "UPDATE orders SET status = 'failed', end_reason = 'timeout', updated_at = now() WHERE id = $1 AND status = 'pending_accept' AND accept_deadline <= now() RETURNING id",
        [id],
      );
      if (!rows[0]) return false;
      await this.history.record(client, { entity: ENTITY, entityId: id, from: 'pending_accept', to: 'failed', actor: SYSTEM, reason: 'The caregiver did not answer before the deadline' });
      await this.promos.giveBack(client, [id]);
      await this.referrals.giveBack(client, [id]);
      const o = (await client.query<OrderRow>(`${SELECT} WHERE o.id = $1`, [id])).rows[0];
      // R27-3: short, no address.
      await this.messages.send(client, {
        userId: o.caregiver_id,
        role: 'caregiver',
        category: 'order',
        title: `Request ${o.number} expired`,
        body: `Request ${o.number} expired. You did not answer in time.`,
        link: { type: 'request', id },
      });
      return true;
    });
    if (!done) return false;
    const failed = (await this.row(id))!;
    const charge = await this.payments.get(failed.charge_id!);
    await this.refund(failed, charge.id, charge.amountSen);
    return true;
  }

  /** Asks the gateway about every unpaid order whose payment is still checking. */
  async checkStuck(): Promise<void> {
    const { rows } = await this.db.pool.query<{ id: number }>(
      "SELECT o.id FROM orders o JOIN payments p ON p.id = o.charge_id WHERE o.status = 'awaiting_payment' AND p.status = 'checking'",
    );
    for (const { id } of rows) await this.sync(id);
  }

  /**
   * R21-2 … R21-4: checks everything again, makes the order (or reuses the unpaid one) and starts a charge.
   * A charge still waiting for its result is returned as it is, so a second tap never pays twice.
   */
  async pay(user: User, body: { healthConfirmed?: unknown; method?: unknown }): Promise<{ order: OrderView; paymentId: number }> {
    if (body?.healthConfirmed !== true) throw new RuleError('HEALTH_NOT_CONFIRMED', 'Tick the health declaration first');
    const method = body.method as PaymentMethod;
    if (!PAY_METHODS.includes(method)) throw new RuleError('BAD_METHOD', 'Choose how to pay');
    const { draft, problems, promo, creditSen } = await this.bookings.checkout(user);
    if (problems.length) throw new ConflictException({ code: 'PAY_BLOCKED', message: problems[0].text, problems });

    const order = await this.db.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [user.id]);
      const open = await client.query<OrderRow>(`${SELECT} WHERE o.owner_id = $1 AND o.status = 'awaiting_payment' ORDER BY o.id DESC LIMIT 1`, [user.id]);
      if (open.rows[0]) return open.rows[0];
      const pets = await client.query<{ id: number; name: string; kind: PetKind }>('SELECT id, name, kind FROM pets WHERE id = ANY ($1) ORDER BY id', [draft.petIds]);
      const entry = await client.query<{ entry_secret: string | null }>('SELECT entry_secret FROM booking_drafts WHERE owner_id = $1', [user.id]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext('order_number'))");
      const now = new Date();
      const prefix = orderNumber(now, 0).slice(0, -3);
      const seq = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM orders WHERE number LIKE $1', [`${prefix}%`]);
      // R23-5: what was paid for each visit after its share of the promo, so refunds follow it.
      const discount = promo?.discountSen ?? 0;
      const paid = splitDiscount(draft.summary.lines.map((l) => l.quote.total), discount);
      const visits: OrderVisit[] = draft.summary.lines.map((l, i) => ({ date: l.date, start: l.start, label: l.label, quote: l.quote, paidSen: paid[i] }));
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO orders (number, owner_id, caregiver_id, status, level, overtime_units, address_id, pets, visits, total_sen, rules_version, entry_method, entry_secret, health_confirmed_at, discount_sen)
         VALUES ($1, $2, $3, 'awaiting_payment', $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13) RETURNING id`,
        [
          orderNumber(now, seq.rows[0].n + 1),
          user.id,
          draft.caregiver!.id,
          draft.level,
          draft.overtimeUnits,
          draft.addressId,
          JSON.stringify(pets.rows),
          JSON.stringify(visits),
          draft.summary.total,
          DEFAULT_RULES.version,
          draft.entry!.method,
          entry.rows[0]?.entry_secret ?? null,
          discount,
        ],
      );
      if (promo) {
        // Checked again under a lock: the last use cannot go to two payments (R23-3).
        const t = await this.promos.reserve(client, user.id, rows[0].id, promo.code, draft.summary.total);
        if (t.problem) {
          const problem = { text: `${promo.code}: ${t.problem}`, fix: 'promo' as const };
          throw new ConflictException({ code: 'PAY_BLOCKED', message: problem.text, problems: [problem] });
        }
        await client.query('UPDATE orders SET promo_id = $2 WHERE id = $1', [rows[0].id, t.promo!.id]);
      }
      // R24-5: credit held now, spent when paid, given back as credit if the order does not go ahead.
      const held = await this.referrals.hold(client, user.id, rows[0].id, creditSen);
      if (held) await client.query('UPDATE orders SET credit_sen = $2 WHERE id = $1', [rows[0].id, held]);
      await this.history.record(client, { entity: ENTITY, entityId: rows[0].id, from: null, to: 'awaiting_payment', actor: owner(user), reason: 'Owner confirmed and tapped Pay' });
      return (await client.query<OrderRow>(`${SELECT} WHERE o.id = $1`, [rows[0].id])).rows[0];
    });
    return this.charge(order, method);
  }

  /** Try again after a failed payment, on the same order (R21-4). */
  async retry(user: User, id: number, method: unknown): Promise<{ order: OrderView; paymentId: number }> {
    const order = await this.own(user, id);
    if (order.status !== 'awaiting_payment') throw new ConflictException({ code: 'ORDER_NOT_UNPAID', message: 'This order is not waiting for payment' });
    if (!PAY_METHODS.includes(method as PaymentMethod)) throw new RuleError('BAD_METHOD', 'Choose how to pay');
    const { problems } = await this.bookings.checkout(user);
    if (problems.length) throw new ConflictException({ code: 'PAY_BLOCKED', message: problems[0].text, problems });
    return this.charge(order, method as PaymentMethod);
  }

  /** O11: the order as the server sees it now; a refresh always shows the server's result (R22-2). */
  async get(user: User, id: number): Promise<OrderView> {
    await this.own(user, id);
    await this.sync(id);
    return this.view((await this.row(id))!);
  }

  /** E7-2 O13 (R31-1 … R31-6): the order with the owner's address and how much refund the bank has confirmed. */
  async detail(user: User, id: number): Promise<OrderDetail> {
    const view = await this.get(user, id);
    const o = (await this.row(id))!;
    const done = await this.db.pool.query<{ sen: number }>(
      "SELECT COALESCE(SUM(amount_sen), 0)::int AS sen FROM payments WHERE kind = 'refund' AND status = 'succeeded' AND ref LIKE $1",
      [`order-${id}-refund-%`],
    );
    const area = (await this.db.pool.query<{ area: string }>('SELECT area FROM addresses WHERE id = $1', [o.address_id])).rows[0]?.area;
    const address = await this.addresses.forVisit(o.address_id);
    const runs = await this.runs.forOrders([id]);
    return {
      ...view,
      refundDoneSen: done.rows[0].sen,
      address: address && area ? { ...address, area } : null,
      runs: view.visits.map((_, i) => runs.get(runKey(id, i)) ?? NOT_STARTED),
      review: await this.reviews.stateOf(id),
    };
  }

  /** E8-3 Live confirm (R35-4): the owner lets the arrived caregiver in; the service starts now. */
  async confirmEntry(user: User, id: number, index: number): Promise<OrderDetail> {
    const o = await this.own(user, id);
    if (o.status !== 'accepted' || !Number.isInteger(index) || index < 0 || index >= o.visits.length) {
      throw new NotFoundException({ code: 'VISIT_NOT_FOUND', message: 'Visit not found' });
    }
    if (o.entry_method !== 'live_confirm') throw new ConflictException({ code: 'NOT_LIVE_CONFIRM', message: 'The caregiver confirms entry for this visit' });
    await this.db.tx(async (client: PoolClient) => {
      const { rowCount } = await client.query(
        "UPDATE visit_runs SET status = 'in_service', entered_at = now(), entered_by = 'owner', updated_at = now() WHERE order_id = $1 AND idx = $2 AND status = 'arrived'",
        [id, index],
      );
      if (!rowCount) {
        const run = await this.runs.of(id, index, client);
        throw new ConflictException(
          run.status === 'todo'
            ? { code: 'NOT_ARRIVED', message: 'The caregiver has not arrived yet' }
            : { code: 'ALREADY_ENTERED', message: 'Entry is already confirmed' },
        );
      }
      await this.history.record(client, { entity: 'visit', entityId: id, from: 'arrived', to: 'in_service', actor: owner(user), reason: `Owner confirmed entry for visit ${index + 1}` });
      await this.messages.send(client, {
        userId: o.caregiver_id,
        role: 'caregiver',
        category: 'order',
        title: 'The owner let you in',
        body: `Order ${o.number}: the owner confirmed you are in. The service has started.`,
        link: { type: 'request', id },
      });
    });
    return this.detail(user, id);
  }

  private async charge(order: OrderRow, method: PaymentMethod): Promise<{ order: OrderView; paymentId: number }> {
    if (order.charge_id) {
      const last = await this.payments.get(order.charge_id);
      if (last.status === 'pending' || last.status === 'checking' || last.status === 'succeeded') return { order: await this.view(order), paymentId: last.id };
    }
    const attempt = order.attempts + 1;
    const payment = await this.payments.createCharge({ ref: `order-${order.id}-${attempt}`, amountSen: paySen(order), method });
    await this.db.pool.query('UPDATE orders SET charge_id = $2, attempts = $3, updated_at = now() WHERE id = $1', [order.id, payment.id, attempt]);
    return { order: await this.view((await this.row(order.id))!), paymentId: payment.id };
  }

  /**
   * Follows the gateway's result (rule G7). Paid → waiting for the caregiver with the accept deadline, draft cleared (R22-1).
   * Paid with the first visit under 3 h away → order fails, full refund (R22-4). Paid after the order was cancelled → full refund.
   */
  private async sync(id: number): Promise<void> {
    const order = await this.row(id);
    if (!order?.charge_id) return;
    let charge = await this.payments.get(order.charge_id);
    if (charge.status === 'checking') charge = await this.payments.query(charge.id); // callback late or lost: ask the gateway
    if (charge.status !== 'succeeded') return;
    if (order.status === 'cancelled' || order.status === 'failed') {
      await this.refund(order, charge.id, charge.amountSen);
      return;
    }
    const now = new Date();
    const first = [...order.visits].sort((a, b) => visitTime(a).getTime() - visitTime(b).getTime())[0];
    const win = acceptWindow(now, visitTime(first));
    const to: OrderStatus = win.kind === 'fail' ? 'failed' : 'pending_accept';
    const changed = await this.db.tx(async (client: PoolClient) => {
      const { rowCount } = await client.query(
        "UPDATE orders SET status = $2, paid_at = $3, accept_deadline = $4, accept_kind = $5, end_reason = $6, updated_at = now() WHERE id = $1 AND status = 'awaiting_payment'",
        [id, to, now, win.deadline, win.kind === 'fail' ? null : win.kind, to === 'failed' ? 'too_late' : null],
      );
      if (!rowCount) return false;
      const reason = to === 'failed' ? `Payment ${charge.id} came in under ${DEFAULT_RULES.accept.failBelowHours} h before the first visit` : `Payment ${charge.id} succeeded`;
      await this.history.record(client, { entity: ENTITY, entityId: id, from: 'awaiting_payment', to, actor: SYSTEM, reason });
      if (to === 'failed') {
        await this.promos.giveBack(client, [id]);
        await this.referrals.giveBack(client, [id]);
      }
      if (to === 'pending_accept') {
        await this.promos.markUsed(client, id);
        await this.referrals.spend(client, id);
        await client.query('DELETE FROM booking_drafts WHERE owner_id = $1', [order.owner_id]);
        const { deadline } = (await client.query<OrderRow>(`${SELECT} WHERE o.id = $1`, [id])).rows[0];
        await this.messages.send(client, {
          userId: order.owner_id,
          role: 'owner',
          category: 'order',
          title: `Payment received: ${formatRM(paySen(order))}`,
          body: `Order ${order.number} is paid. Waiting for ${await this.caregiverName(order.caregiver_id)} to accept by ${deadlineText(deadline!, now)}. Paid is not accepted yet.`,
          link: { type: 'order', id },
        });
      }
      return true;
    });
    if (changed && to === 'failed') await this.refund((await this.row(id))!, charge.id, charge.amountSen);
    if (changed && to === 'pending_accept') await this.alertCaregiver(id, now);
  }

  /** R25-6: the chosen caregiver hears about the request at once (push + WhatsApp/SMS), and again 10 min before the deadline. */
  private async alertCaregiver(id: number, now: Date): Promise<void> {
    const o = (await this.row(id))!;
    try {
      const { rows } = await this.db.pool.query<{ area: string }>('SELECT area FROM addresses WHERE id = $1', [o.address_id]);
      const minutesLeft = Math.max(1, Math.floor((klInstant(o.deadline!).getTime() - now.getTime()) / 60_000));
      const first = firstVisitOf(o.visits);
      await this.alerts.newRequest(o.caregiver_id, { urgent: o.accept_kind === 'urgent', minutesLeft, firstVisit: visitWhen(first), visits: o.visits.length, area: rows[0].area }, now, id);
    } catch (e) {
      // The order is paid either way; the request still shows on S01/S06.
      this.log.error(`Could not alert the caregiver for order ${o.number}: ${(e as Error).message}`);
    }
  }

  /** Full refund of a payment the order cannot use; the owner is told once (R22-4, R22-5). */
  private async refund(order: OrderRow, chargeId: number, amountSen: number): Promise<void> {
    const ref = `order-${order.id}-refund-${chargeId}`;
    // The callback and the page can both get here at once: the lock makes sure the owner is told only once.
    await this.db.tx(async (client: PoolClient) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('order_refund'), $1)", [order.id]);
      const { rows } = await client.query('SELECT 1 FROM payments WHERE ref = $1', [ref]);
      if (rows.length) return;
      await this.payments.createRefund({ ref, chargeId, amountSen });
      const money = formatRM(amountSen);
      if (order.end_reason === 'withdrawn') {
        // R28-5
        await this.messages.send(client, {
          userId: order.owner_id,
          role: 'owner',
          category: 'refund',
          title: `Refund: ${money}`,
          body: `Order ${order.number}: you withdrew. ${money} is refunded in full.`,
          link: { type: 'order', id: order.id },
        });
        return;
      }
      if (order.end_reason === 'timeout') {
        // R27-2
        await this.messages.send(client, {
          userId: order.owner_id,
          role: 'owner',
          category: 'refund',
          title: `Refund: ${money}`,
          body: `Order ${order.number}: ${await this.caregiverName(order.caregiver_id)} did not answer in time. ${money} is refunded in full. You can book again with another caregiver.`,
          link: { type: 'order', id: order.id },
        });
        return;
      }
      const why =
        order.end_reason === 'rejected'
          ? `${await this.caregiverName(order.caregiver_id)} could not take it. You can book again with another caregiver`
          : order.status === 'failed'
            ? `the first visit was less than ${DEFAULT_RULES.accept.failBelowHours} hours away when the payment came in`
            : 'the booking was changed before the payment came in';
      await this.messages.send(client, {
        userId: order.owner_id,
        role: 'owner',
        category: 'refund',
        title: `Refund: ${formatRM(amountSen)}`,
        body: `Order ${order.number} could not go ahead because ${why}. ${formatRM(amountSen)} is refunded in full to how you paid.`,
        link: { type: 'order', id: order.id },
      });
    });
  }

  /**
   * S07 Accept (R26-1 … R26-3): the whole order or nothing. Every visit is checked against the schedule with the
   * caregiver's profile locked; the deadline is read from the database clock, so at the same moment the deadline wins.
   */
  async accept(user: User, id: number, now = new Date()): Promise<OrderView> {
    const order = await this.db.tx(async (client: PoolClient) => {
      const o = await this.openRequest(client, user, id);
      const schedule = await this.schedules.lockedFor(client, user.id, now);
      const clashes = o.visits.filter((v) => !isFree(v.date, v.start, v.quote.totalMinutes, schedule)).map(({ date, start }) => ({ date, start }));
      if (clashes.length) throw new ConflictException({ code: 'SCHEDULE_CLASH', message: clashText(clashes), clashes });
      const pets = o.pets.map((p) => p.name).join(', ');
      for (const v of o.visits) {
        await client.query("INSERT INTO booked_visits (caregiver_id, visit_date, start_min, minutes, label, source, order_id) VALUES ($1, $2, $3, $4, $5, 'order', $6)", [
          user.id,
          v.date,
          v.start,
          v.quote.totalMinutes,
          `${o.number} · ${pets}`.slice(0, 80),
          o.id,
        ]);
      }
      await client.query("UPDATE orders SET status = 'accepted', accepted_at = now(), updated_at = now() WHERE id = $1", [o.id]);
      await this.history.record(client, { entity: ENTITY, entityId: o.id, from: 'pending_accept', to: 'accepted', actor: caregiver(user), reason: 'Caregiver accepted the whole order' });
      const name = await this.caregiverName(user.id);
      await this.messages.send(client, {
        userId: o.owner_id,
        role: 'owner',
        category: 'order',
        title: `${name} accepted your booking`,
        body: `Order ${o.number} is booked. First visit: ${visitWhen(firstVisitOf(o.visits))}.`,
        link: { type: 'order', id: o.id },
      });
      return o;
    });
    return this.view((await this.row(order.id))!);
  }

  /** S07 Reject (R26-5): the order fails at once with a full refund; promo use and credit go back. The owner never sees the reason. */
  async reject(user: User, id: number, reason: unknown): Promise<OrderView> {
    if (!REJECT_REASONS.some((r) => r.value === reason)) throw new RuleError('BAD_REASON', 'Choose a reason');
    const order = await this.db.tx(async (client: PoolClient) => {
      const o = await this.openRequest(client, user, id);
      await client.query("UPDATE orders SET status = 'failed', end_reason = 'rejected', reject_reason = $2, updated_at = now() WHERE id = $1", [o.id, reason as RejectReason]);
      await this.history.record(client, { entity: ENTITY, entityId: o.id, from: 'pending_accept', to: 'failed', actor: caregiver(user), reason: `Caregiver said no: ${reason as string}` });
      await this.promos.giveBack(client, [o.id]);
      await this.referrals.giveBack(client, [o.id]);
      return o;
    });
    const failed = (await this.row(order.id))!;
    const charge = await this.payments.get(failed.charge_id!);
    await this.refund(failed, charge.id, charge.amountSen);
    return this.view((await this.row(order.id))!);
  }

  /**
   * E6-4 owner withdraws (R28-1 … R28-6): only while the order waits for the caregiver. The order row is locked,
   * so withdraw and accept run one after the other and only one of them can win.
   */
  async withdraw(user: User, id: number): Promise<OrderView> {
    const done = await this.db.tx(async (client: PoolClient) => {
      const { rows } = await client.query<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = $1 AND owner_id = $2 FOR UPDATE', [id, user.id]);
      if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      const o = (await client.query<OrderRow>(`${SELECT} WHERE o.id = $1`, [id])).rows[0];
      if (rows[0].status === 'accepted') {
        throw new ConflictException({ code: 'ALREADY_ACCEPTED', message: `${await this.caregiverName(o.caregiver_id)} already accepted. The booking is confirmed.` });
      }
      if (rows[0].status !== 'pending_accept') throw new ConflictException({ code: 'NOT_WAITING', message: 'This booking is no longer waiting, so it cannot be withdrawn' });
      await client.query("UPDATE orders SET status = 'cancelled', end_reason = 'withdrawn', updated_at = now() WHERE id = $1", [id]);
      await this.history.record(client, { entity: ENTITY, entityId: id, from: 'pending_accept', to: 'cancelled', actor: owner(user), reason: 'Owner withdrew before the caregiver accepted' });
      await this.promos.giveBack(client, [id]);
      await this.referrals.giveBack(client, [id]);
      await this.messages.send(client, {
        userId: o.caregiver_id,
        role: 'caregiver',
        category: 'order',
        title: `Request ${o.number} withdrawn`,
        body: `Request ${o.number} withdrawn. The owner withdrew it.`,
        link: { type: 'request', id },
      });
      return o;
    });
    const withdrawn = (await this.row(done.id))!;
    const charge = await this.payments.get(withdrawn.charge_id!);
    await this.refund(withdrawn, charge.id, charge.amountSen);
    return this.view((await this.row(id))!);
  }

  /** This caregiver's request, locked, and still open by the database clock (R26-2). */
  private async openRequest(client: PoolClient, user: User, id: number): Promise<OrderRow> {
    const lock = await client.query<{ open: boolean; end_reason: OrderEnd | null }>(
      "SELECT (status = 'pending_accept' AND accept_deadline > now()) AS open, end_reason FROM orders WHERE id = $1 AND caregiver_id = $2 FOR UPDATE",
      [id, user.id],
    );
    if (!lock.rows[0]) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    // R28-6: the owner got there first.
    if (lock.rows[0].end_reason === 'withdrawn') throw new ConflictException({ code: 'REQUEST_WITHDRAWN', message: 'The owner withdrew this request' });
    if (!lock.rows[0].open) throw new ConflictException({ code: 'REQUEST_CLOSED', message: 'This request is no longer open' });
    return (await client.query<OrderRow>(`${SELECT} WHERE o.id = $1`, [id])).rows[0];
  }

  /** E7-1 My orders (R30-2 … R30-5): paid orders only, newest first, 20 at a time. */
  async list(user: User, filter: unknown, before: unknown): Promise<OrderPage> {
    const f: OrderFilter = isOrderFilter(filter) ? filter : 'all';
    const statuses = { all: ['pending_accept', 'accepted', 'failed', 'cancelled'], waiting: ['pending_accept'], booked: ['accepted'], ended: ['failed', 'cancelled'] }[f];
    const cursor = Number(before);
    const size = ORDER_LIST_RULES.pageSize;
    const { rows } = await this.db.pool.query<{
      id: number; number: string; status: OrderStatus; end_reason: OrderEnd | null; visits: OrderVisit[]; pay_sen: number; refund_sen: number; deadline: string | null;
    }>(
      `SELECT o.id, o.number, o.status, o.end_reason, o.visits, (o.total_sen - o.discount_sen - o.credit_sen) AS pay_sen,
         (SELECT COALESCE(SUM(p.amount_sen), 0)::int FROM payments p WHERE p.kind = 'refund' AND p.status <> 'failed' AND p.ref LIKE 'order-' || o.id || '-refund-%') AS refund_sen,
         CASE WHEN o.status = 'pending_accept' THEN ${ts('o.accept_deadline')} END AS deadline
       FROM orders o
       WHERE o.owner_id = $1 AND o.paid_at IS NOT NULL AND o.status = ANY ($2) AND ($3::bigint IS NULL OR o.id < $3)
       ORDER BY o.id DESC LIMIT $4`,
      [user.id, statuses, Number.isInteger(cursor) && cursor > 0 ? cursor : null, size + 1],
    );
    const page = rows.slice(0, size).map((r) => ({
      id: Number(r.id),
      number: r.number,
      status: r.status,
      endReason: r.end_reason,
      visits: r.visits.length,
      firstVisit: (({ date, start }) => ({ date, start }))(firstVisitOf(r.visits)),
      paySen: r.pay_sen,
      refundSen: r.refund_sen,
      acceptDeadline: r.deadline,
    }));
    return { rows: page, next: rows.length > size ? page[page.length - 1].id : null };
  }

  /** E9-1 O17 (R39-2, R39-4): one visit's sent report, for the order's owner only. */
  async report(user: User, id: number, index: number): Promise<VisitReport> {
    const o = await this.own(user, id);
    const v = o.status === 'accepted' && Number.isInteger(index) ? o.visits[index] : undefined;
    if (!v) throw new NotFoundException({ code: 'VISIT_NOT_FOUND', message: 'Visit not found' });
    const run = await this.runs.of(id, index);
    if ((run.status !== 'report_sent' && run.status !== 'confirmed' && run.status !== 'disputed') || !run.reportedAt) throw new ConflictException({ code: 'REPORT_NOT_READY', message: 'The caregiver has not sent the report yet' });
    return {
      orderId: id,
      number: o.number,
      index,
      date: v.date,
      start: v.start,
      caregiver: await this.caregiverName(o.caregiver_id),
      reportedAt: run.reportedAt,
      ...(await this.runs.service(id, index, o.pets)),
      status: run.status,
      confirmedAt: run.confirmedAt,
      confirmedBy: run.confirmedBy,
    };
  }

  /** R39-1: the message link carries the run id. */
  async reportByRun(user: User, runId: number): Promise<VisitReport> {
    const at = await this.runs.visitOf(runId);
    if (!at) throw new NotFoundException({ code: 'VISIT_NOT_FOUND', message: 'Visit not found' });
    return this.report(user, at.orderId, at.idx);
  }

  /** R39-4: a report photo, for the order's owner once the report is sent. */
  async reportPhoto(user: User, id: number, index: number, photoId: number): Promise<{ data: Buffer; mime: string }> {
    await this.report(user, id, index);
    const key = await this.runs.photoKey(id, index, photoId);
    if (!key) throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Photo not found' });
    return { data: await this.files.read(key), mime: IMAGE_MIME[key.split('.').pop() as 'jpg' | 'png'] };
  }

  private async own(user: User, id: number): Promise<OrderRow> {
    const order = await this.row(id);
    if (!order || order.owner_id !== user.id) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return order;
  }

  private async row(id: number): Promise<OrderRow | undefined> {
    const { rows } = await this.db.pool.query<OrderRow>(`${SELECT} WHERE o.id = $1`, [id]);
    return rows[0];
  }

  private async caregiverName(id: number): Promise<string> {
    const { rows } = await this.db.pool.query<{ display_name: string }>('SELECT display_name FROM caregiver_profiles WHERE user_id = $1', [id]);
    return displayNameOf(rows[0]?.display_name ?? '') || 'the caregiver';
  }

  private async view(o: OrderRow): Promise<OrderView> {
    const payment = o.charge_id ? await this.payments.get(o.charge_id) : null;
    const refunds = await this.db.pool.query<{ sen: number }>(
      "SELECT COALESCE(SUM(amount_sen), 0)::int AS sen FROM payments WHERE kind = 'refund' AND status <> 'failed' AND ref LIKE $1",
      [`order-${o.id}-refund-%`],
    );
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      caregiver: { id: o.caregiver_id, displayName: await this.caregiverName(o.caregiver_id) },
      pets: o.pets,
      level: o.level,
      visits: o.visits.map((v) => ({ ...v, paidSen: v.paidSen ?? v.quote.total })),
      totalSen: o.total_sen,
      promoCode: o.promo_code,
      discountSen: o.discount_sen,
      creditSen: o.credit_sen,
      paySen: paySen(o),
      entryMethod: o.entry_method,
      createdAt: o.created,
      paidAt: o.paid,
      acceptDeadline: o.deadline,
      acceptKind: o.accept_kind,
      endReason: o.end_reason,
      refundSen: refunds.rows[0].sen,
      payment: payment && { id: payment.id, status: payment.status, method: payment.method, failureReason: payment.failureReason },
    };
  }
}

const SELECT = `SELECT o.*, ${ts('o.created_at')} AS created, ${ts('o.paid_at')} AS paid, ${ts('o.accept_deadline')} AS deadline,
  (SELECT code FROM promo_codes p WHERE p.id = o.promo_id) AS promo_code FROM orders o`;
/** What the owner pays in money: full price less the promo and the credit. */
const paySen = (o: Pick<OrderRow, 'total_sen' | 'discount_sen' | 'credit_sen'>) => o.total_sen - o.discount_sen - o.credit_sen;
const owner = (user: User): Actor => ({ type: 'owner', id: String(user.id) });
const caregiver = (user: User): Actor => ({ type: 'caregiver', id: String(user.id) });
const displayNameOf = (full: string) => {
  const words = full.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.` : (words[0] ?? '');
};

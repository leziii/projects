import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PAYMENT_METHODS,
  RuleError,
  isFinalPayment,
  type Actor,
  type Payment,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStatus,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, isDuplicate, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { PAYMENT_GATEWAY, type GatewayEvent, type PaymentGateway } from './gateway';

/** What happened to a webhook: used once, a repeat, too late (payment already final), or for no known payment. */
export type WebhookResult = 'applied' | 'duplicate' | 'ignored' | 'unmatched';

const SYSTEM: Actor = { type: 'system' };
const GATEWAY: Actor = { type: 'gateway' };

const MAX_SEN = 10_000_000; // RM100,000 per payment
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface PaymentRow {
  id: number;
  ref: string;
  kind: PaymentKind;
  parent_id: number | null;
  amount_sen: number;
  method: PaymentMethod | null;
  payee: string | null;
  status: Payment['status'];
  gateway: string;
  gateway_ref: string | null;
  failure_reason: string | null;
  webhooks: number;
  created: string;
  updated: string;
}

const SELECT = `SELECT p.*, ${ts('p.created_at')} AS created, ${ts('p.updated_at')} AS updated,
  (SELECT COUNT(*)::int FROM gateway_events e WHERE e.gateway_ref = p.gateway_ref) AS webhooks FROM payments p`;

/** Called after a payment reaches a final status (succeeded / failed), outside the transaction. */
export type SettledListener = (paymentId: number) => Promise<void>;

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  private readonly listeners: SettledListener[] = [];

  constructor(
    private readonly db: DbService,
    private readonly history: HistoryService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** Lets the business that owns a payment (orders, E5-5) follow its result as soon as it is known. */
  onSettled(listener: SettledListener): void {
    this.listeners.push(listener);
  }

  private async settled(id: number): Promise<void> {
    for (const l of this.listeners) await l(id).catch((e: Error) => this.log.error(`After payment ${id}: ${e.message}`));
  }

  async list(): Promise<Payment[]> {
    const { rows } = await this.db.pool.query<PaymentRow>(`${SELECT} ORDER BY p.id DESC LIMIT 50`);
    return rows.map(toPayment);
  }

  async get(id: number): Promise<Payment> {
    const { rows } = await this.db.pool.query<PaymentRow>(`${SELECT} WHERE p.id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: `Payment ${id} not found` });
    return toPayment(rows[0]);
  }

  /** Owner pays. Same ref twice → same payment (never charged twice, rule G6). */
  async createCharge(input: { ref?: unknown; amountSen?: unknown; method?: unknown }): Promise<Payment> {
    const ref = checkRef(input.ref);
    const amountSen = checkAmount(input.amountSen);
    if (typeof input.method !== 'string' || !(input.method in PAYMENT_METHODS)) {
      throw new RuleError('BAD_METHOD', `method must be one of ${Object.keys(PAYMENT_METHODS).join(', ')}`);
    }
    const method = input.method as PaymentMethod;
    return this.once(ref, { kind: 'charge', amountSen, method }, async () => {
      const id = await this.db.tx((conn) => this.insert({ ref, kind: 'charge', amountSen, method }, conn));
      return this.open(id, () => this.gateway.createCharge({ ref, amountSen, method }));
    });
  }

  /** Refund part or all of a paid charge. Refunds never add up to more than was paid. */
  async createRefund(input: { ref?: unknown; chargeId?: unknown; amountSen?: unknown }): Promise<Payment> {
    const ref = checkRef(input.ref);
    const amountSen = checkAmount(input.amountSen);
    if (!Number.isInteger(input.chargeId)) throw new RuleError('BAD_CHARGE', 'chargeId must be a payment id');
    const chargeId = input.chargeId as number;
    return this.once(ref, { kind: 'refund', amountSen, parentId: chargeId }, async () => {
      const { id, chargeGatewayRef } = await this.db.tx(async (client) => {
        const { rows } = await client.query<PaymentRow>('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [chargeId]);
        const charge = rows[0];
        if (!charge || charge.kind !== 'charge') throw new RuleError('BAD_CHARGE', `Charge ${chargeId} not found`);
        if (charge.status !== 'succeeded' || !charge.gateway_ref) throw new RuleError('CHARGE_NOT_PAID', 'Only a paid charge can be refunded');
        const sums = await client.query<{ total: number }>(
          "SELECT COALESCE(SUM(amount_sen), 0)::int AS total FROM payments WHERE parent_id = $1 AND kind = 'refund' AND status <> 'failed'",
          [chargeId],
        );
        if (sums.rows[0].total + amountSen > charge.amount_sen) {
          throw new RuleError('REFUND_TOO_MUCH', 'Refunds cannot add up to more than the amount paid');
        }
        const id = await this.insert({ ref, kind: 'refund', amountSen, parentId: chargeId }, client);
        return { id, chargeGatewayRef: charge.gateway_ref };
      });
      return this.open(id, () => this.gateway.createRefund({ ref, chargeGatewayRef, amountSen }));
    });
  }

  /** Pay a caregiver. Same ref twice → one payout only. */
  async createPayout(input: { ref?: unknown; amountSen?: unknown; payee?: unknown }): Promise<Payment> {
    const ref = checkRef(input.ref);
    const amountSen = checkAmount(input.amountSen);
    if (typeof input.payee !== 'string' || !REF_PATTERN.test(input.payee)) throw new RuleError('BAD_PAYEE', 'payee must be an account id');
    const payee = input.payee;
    return this.once(ref, { kind: 'payout', amountSen, payee }, async () => {
      const id = await this.db.tx((conn) => this.insert({ ref, kind: 'payout', amountSen, payee }, conn));
      return this.open(id, () => this.gateway.createPayout({ ref, amountSen, payee }));
    });
  }

  /** The result is not known yet (e.g. the payer came back but no callback arrived): show "Checking". */
  async markChecking(id: number, actor: Actor, reason: string): Promise<Payment> {
    await this.get(id);
    await this.db.tx((conn) => this.transition(conn, id, 'checking', actor, reason));
    return this.get(id);
  }

  /** Asks the gateway for the result; used when the callback is late or lost (rule: payment unknown). */
  async query(id: number): Promise<Payment> {
    const payment = await this.get(id);
    if (isFinalPayment(payment.status) || !payment.gatewayRef) return payment;
    const status = await this.gateway.query(payment.gatewayRef);
    if (status !== 'pending') {
      const changed = await this.db.tx((conn) =>
        this.transition(conn, id, status, GATEWAY, 'Result found by gateway query', status === 'failed' ? 'Failed (found by query)' : null),
      );
      if (changed && isFinalPayment(status)) await this.settled(id);
    }
    return this.get(id);
  }

  /**
   * Gateway callback. Each event is used at most once and a final payment never changes,
   * so repeats and late events cannot pay or refund twice.
   */
  async receiveWebhook(
    gatewayName: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ result: WebhookResult; paymentId: number | null }> {
    if (gatewayName !== this.gateway.name) throw new NotFoundException({ code: 'GATEWAY_UNKNOWN', message: `No gateway "${gatewayName}"` });
    if (!rawBody) throw new RuleError('WEBHOOK_EMPTY', 'Webhook body missing');
    let event: GatewayEvent;
    try {
      event = this.gateway.parseWebhook(rawBody, headers);
    } catch {
      throw new RuleError('WEBHOOK_SIGNATURE', 'Webhook signature is not valid');
    }

    const out = await this.db.tx(async (conn) => {
      // A repeat of the same event inserts nothing (a second one sent at the same moment waits, then inserts nothing).
      const inserted = await conn.query(
        `INSERT INTO gateway_events (gateway, event_id, gateway_ref, type, result, payload) VALUES ($1, $2, $3, $4, 'received', $5)
         ON CONFLICT (gateway, event_id) DO NOTHING`,
        [gatewayName, event.eventId, event.gatewayRef, event.type, rawBody.toString('utf8')],
      );
      if (inserted.rowCount === 0) return { result: 'duplicate' as const, paymentId: null };
      const { rows } = await conn.query<PaymentRow>('SELECT id FROM payments WHERE gateway_ref = $1', [event.gatewayRef]);
      const payment = rows[0];
      let result: WebhookResult = 'unmatched';
      if (payment) {
        const failed = event.type === 'payment.failed';
        const changed = await this.transition(
          conn,
          payment.id,
          failed ? 'failed' : 'succeeded',
          GATEWAY,
          `Gateway webhook ${event.eventId}`,
          failed ? (event.reason ?? 'Failed') : null,
        );
        result = changed ? 'applied' : 'ignored';
      }
      await conn.query('UPDATE gateway_events SET result = $1 WHERE gateway = $2 AND event_id = $3', [result, gatewayName, event.eventId]);
      return { result, paymentId: payment?.id ?? null };
    });
    if (out.result === 'applied') await this.settled(out.paymentId!);
    return out;
  }

  /** Creates the payment once per ref; a repeat (even at the same moment) returns the first one. */
  private async once(ref: string, want: Want, create: () => Promise<Payment>): Promise<Payment> {
    const existing = await this.findSame(ref, want);
    if (existing) return existing;
    try {
      return await create();
    } catch (err) {
      const again = isDuplicate(err) ? await this.findSame(ref, want) : null;
      if (again) return again;
      throw err;
    }
  }

  private async findSame(ref: string, want: Want): Promise<Payment | null> {
    const { rows } = await this.db.pool.query<PaymentRow>(`${SELECT} WHERE p.ref = $1`, [ref]);
    const row = rows[0];
    if (!row) return null;
    const same =
      row.kind === want.kind &&
      row.amount_sen === want.amountSen &&
      (want.method === undefined || row.method === want.method) &&
      (want.payee === undefined || row.payee === want.payee) &&
      (want.parentId === undefined || row.parent_id === want.parentId);
    if (!same) throw new RuleError('REF_CONFLICT', `Reference ${ref} was already used for a different payment`);
    return toPayment(row);
  }

  private async insert(
    p: { ref: string; kind: PaymentKind; amountSen: number; method?: PaymentMethod; payee?: string; parentId?: number },
    client: PoolClient,
  ): Promise<number> {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO payments (ref, kind, parent_id, amount_sen, method, payee, status, gateway)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING id`,
      [p.ref, p.kind, p.parentId ?? null, p.amountSen, p.method ?? null, p.payee ?? null, this.gateway.name],
    );
    const id = rows[0].id;
    await this.history.record(client, { entity: 'payment', entityId: id, from: null, to: 'pending', actor: SYSTEM, reason: `${p.kind} created (${p.ref})` });
    return id;
  }

  /**
   * The only way a payment's status changes. A final payment never changes (returns false);
   * every real change writes one history row in the same transaction.
   */
  private async transition(
    client: PoolClient,
    id: number,
    to: PaymentStatus,
    actor: Actor,
    reason: string,
    failureReason: string | null = null,
  ): Promise<boolean> {
    const { rows } = await client.query<{ status: PaymentStatus }>('SELECT status FROM payments WHERE id = $1 FOR UPDATE', [id]);
    const from = rows[0]?.status;
    if (!from || from === to || isFinalPayment(from)) return false;
    await client.query('UPDATE payments SET status = $1, failure_reason = $2, updated_at = now() WHERE id = $3', [to, failureReason, id]);
    await this.history.record(client, { entity: 'payment', entityId: id, from, to, actor, reason });
    return true;
  }

  /** Registers the payment with the gateway. If the gateway cannot be reached, the payment fails with a reason. */
  private async open(id: number, call: () => Promise<string>): Promise<Payment> {
    try {
      const gatewayRef = await call();
      await this.db.pool.query('UPDATE payments SET gateway_ref = $1, updated_at = now() WHERE id = $2', [gatewayRef, id]);
    } catch (err) {
      const reason = `Gateway error: ${(err as Error).message}`.slice(0, 255);
      await this.db.tx((conn) => this.transition(conn, id, 'failed', SYSTEM, reason, reason));
    }
    return this.get(id);
  }
}

type Want = { kind: PaymentKind; amountSen: number; method?: PaymentMethod; payee?: string; parentId?: number };

function checkRef(ref: unknown): string {
  if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) throw new RuleError('BAD_REF', 'ref must be 1–64 letters, digits, - or _');
  return ref;
}

function checkAmount(amount: unknown): number {
  if (!Number.isInteger(amount) || (amount as number) <= 0 || (amount as number) > MAX_SEN) {
    throw new RuleError('BAD_AMOUNT', 'amountSen must be a whole number of sen, from 1 to 10,000,000');
  }
  return amount as number;
}

function toPayment(r: PaymentRow): Payment {
  return {
    id: r.id,
    ref: r.ref,
    kind: r.kind,
    parentId: r.parent_id,
    amountSen: r.amount_sen,
    method: r.method,
    payee: r.payee,
    status: r.status,
    gateway: r.gateway,
    gatewayRef: r.gateway_ref,
    failureReason: r.failure_reason,
    webhooks: r.webhooks,
    createdAt: r.created,
    updatedAt: r.updated,
  };
}

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { MockOutcome } from '@pawpal/shared';
import type { GatewayEvent, GatewayStatus, PaymentGateway } from './gateway';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

export interface MockWebhook {
  rawBody: Buffer;
  headers: Record<string, string>;
}

interface MockTxn {
  status: GatewayStatus;
  lastWebhook?: MockWebhook;
}

/**
 * Pretend gateway for development. Payments stay pending until someone picks an outcome;
 * it then sends a signed webhook exactly like a real gateway would.
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  private readonly txns = new Map<string, MockTxn>();

  constructor(private readonly secret: string) {}

  createCharge(): Promise<string> {
    return Promise.resolve(this.open('ch'));
  }

  createRefund(): Promise<string> {
    return Promise.resolve(this.open('rf'));
  }

  createPayout(): Promise<string> {
    return Promise.resolve(this.open('po'));
  }

  query(gatewayRef: string): Promise<GatewayStatus> {
    return Promise.resolve(this.txns.get(gatewayRef)?.status ?? 'pending');
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent {
    const given = Buffer.from(String(headers[MOCK_SIGNATURE_HEADER] ?? ''), 'utf8');
    const expected = Buffer.from(this.sign(rawBody), 'utf8');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('Bad webhook signature');
    return JSON.parse(rawBody.toString('utf8')) as GatewayEvent;
  }

  /** Has this mock gateway seen the payment? (Mock state is lost on server restart.) */
  knows(gatewayRef: string): boolean {
    return this.txns.has(gatewayRef);
  }

  /** After a server restart the mock has forgotten its payments; an open one is taken back as pending. */
  adopt(gatewayRef: string): void {
    if (!this.txns.has(gatewayRef)) this.txns.set(gatewayRef, { status: 'pending' });
  }

  /**
   * Decides a pending payment. success / failure return the webhook to deliver.
   * unknown: the gateway decides "succeeded" but the webhook is lost, so only a query finds out.
   */
  settle(gatewayRef: string, outcome: MockOutcome): MockWebhook | null {
    const txn = this.txns.get(gatewayRef);
    if (!txn) return null;
    txn.status = outcome === 'failure' ? 'failed' : 'succeeded';
    if (outcome === 'unknown') return null;
    const event: GatewayEvent = {
      eventId: `evt_${randomUUID()}`,
      gatewayRef,
      type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
      ...(outcome === 'failure' ? { reason: 'Declined by bank (mock)' } : {}),
    };
    const rawBody = Buffer.from(JSON.stringify(event), 'utf8');
    txn.lastWebhook = { rawBody, headers: { [MOCK_SIGNATURE_HEADER]: this.sign(rawBody) } };
    return txn.lastWebhook;
  }

  /** The last webhook again, as gateways do when they retry. */
  lastWebhook(gatewayRef: string): MockWebhook | null {
    return this.txns.get(gatewayRef)?.lastWebhook ?? null;
  }

  sign(rawBody: Buffer): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  private open(prefix: string): string {
    const ref = `mock_${prefix}_${randomUUID()}`;
    this.txns.set(ref, { status: 'pending' });
    return ref;
  }
}

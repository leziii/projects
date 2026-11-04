import type { PaymentMethod } from '@pawpal/shared';

/** A verified callback from the gateway. The only source of a final payment result (rule G7). */
export interface GatewayEvent {
  eventId: string;
  gatewayRef: string;
  type: 'payment.succeeded' | 'payment.failed';
  reason?: string;
}

export type GatewayStatus = 'pending' | 'succeeded' | 'failed';

/** What every gateway adapter (mock now, real one in E15-1) must provide. */
export interface PaymentGateway {
  readonly name: string;
  createCharge(input: { ref: string; amountSen: number; method: PaymentMethod }): Promise<string>;
  createRefund(input: { ref: string; chargeGatewayRef: string; amountSen: number }): Promise<string>;
  createPayout(input: { ref: string; amountSen: number; payee: string }): Promise<string>;
  /** Asks the gateway for the current result when the callback is late or lost. */
  query(gatewayRef: string): Promise<GatewayStatus>;
  /** Verifies the signature and reads the event; throws on a bad signature. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

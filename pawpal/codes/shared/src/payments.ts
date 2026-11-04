/**
 * Payment types shared by server and apps (E1-3).
 * The real gateway is not chosen yet; development uses the mock gateway.
 */

export type PaymentKind = 'charge' | 'refund' | 'payout';
/** checking = result unknown, server is asking the gateway (shown as "Checking"). */
export type PaymentStatus = 'pending' | 'checking' | 'succeeded' | 'failed';
export type PaymentMethod = 'tng' | 'duitnow' | 'fpx' | 'card';
/** What the mock gateway should do with a pending payment. */
export type MockOutcome = 'success' | 'failure' | 'unknown';

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  tng: "Touch 'n Go",
  duitnow: 'DuitNow',
  fpx: 'FPX online banking',
  card: 'Card',
};

export interface Payment {
  id: number;
  ref: string;
  kind: PaymentKind;
  parentId: number | null;
  amountSen: number;
  method: PaymentMethod | null;
  payee: string | null;
  status: PaymentStatus;
  gateway: string;
  gatewayRef: string | null;
  failureReason: string | null;
  webhooks: number;
  createdAt: string;
  updatedAt: string;
}

/** A final payment never changes again. */
export function isFinalPayment(status: PaymentStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}

/** "12.5" → 1250 sen. Returns null for empty, negative or more than 2 decimals. */
export function rmToSen(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

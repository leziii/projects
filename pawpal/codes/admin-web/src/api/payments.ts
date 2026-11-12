import { clearAdminToken, getAdminToken } from '../session';
import { formatRM, PAYMENT_METHODS, type MockOutcome, type Payment, type PaymentStatus, type StuckRefund } from '@pawpal/shared';

export type WebhookResult = 'applied' | 'duplicate' | 'ignored' | 'unmatched' | 'none';

export interface SimResult {
  payment: Payment;
  webhook: WebhookResult;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Called when the server says the admin login is missing or expired (set by the router). */
let onLoggedOut: () => void = () => undefined;
export const whenLoggedOut = (fn: () => void) => {
  onLoggedOut = fn;
};

/** Calls the server with the admin token; a 4xx/5xx becomes an ApiError with the server's code and message. */
export async function api<T>(path: string, body?: object, fetcher: typeof fetch = fetch): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetcher(`/api${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (res.status === 401 && path !== '/admin/auth/login') {
    clearAdminToken();
    onLoggedOut();
  }
  if (!res.ok) throw new ApiError(data.code ?? `HTTP_${res.status}`, data.message ?? res.statusText);
  return data as T;
}

/** A fresh reference for each test payment, so a retry of the same click never pays twice. */
export function newRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const listPayments = (f?: typeof fetch) => api<Payment[]>('/payments', undefined, f);
export const createCharge = (amountSen: number, method: string, f?: typeof fetch) =>
  api<Payment>('/payments/charges', { ref: newRef('admin-ch'), amountSen, method }, f);
export const createRefund = (chargeId: number, amountSen: number, f?: typeof fetch) =>
  api<Payment>('/payments/refunds', { ref: newRef('admin-rf'), chargeId, amountSen }, f);
export const createPayout = (amountSen: number, payee: string, f?: typeof fetch) =>
  api<Payment>('/payments/payouts', { ref: newRef('admin-po'), amountSen, payee }, f);
export const simulate = (id: number, outcome: MockOutcome, f?: typeof fetch) =>
  api<SimResult>(`/mock-gateway/payments/${id}/outcome`, { outcome }, f);
export const resendWebhook = (id: number, f?: typeof fetch) => api<SimResult>(`/mock-gateway/payments/${id}/resend`, {}, f);
/** E10-3 (R44-4): refunds that failed every automatic try, and sending one again. */
export const listStuckRefunds = (f?: typeof fetch) => api<StuckRefund[]>('/admin/refunds/stuck', undefined, f);
export const retryRefund = (orderId: number, key: string, f?: typeof fetch) => api<StuckRefund[]>('/admin/refunds/retry', { orderId, key }, f);
export const queryPayment = (id: number, f?: typeof fetch) => api<Payment>(`/payments/${id}/query`, {}, f);

const STATUS: Record<PaymentStatus, { label: string; tag: 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', tag: 'info' },
  checking: { label: 'Checking', tag: 'warning' },
  succeeded: { label: 'Succeeded', tag: 'success' },
  failed: { label: 'Failed', tag: 'danger' },
};

export const statusLabel = (s: PaymentStatus) => STATUS[s].label;
export const statusTag = (s: PaymentStatus) => STATUS[s].tag;

/** What the admin is told after a simulated webhook. */
export function webhookMessage(r: SimResult): string {
  const status = statusLabel(r.payment.status);
  switch (r.webhook) {
    case 'applied':
      return `Webhook applied: payment #${r.payment.id} is now ${status}`;
    case 'duplicate':
      return `Duplicate webhook ignored: payment #${r.payment.id} stays ${status}`;
    case 'ignored':
      return `Late webhook ignored: payment #${r.payment.id} was already ${status}`;
    case 'unmatched':
      return 'Webhook for an unknown payment ignored';
    case 'none':
      return `No webhook (result unknown): payment #${r.payment.id} is ${status}`;
  }
}

/** "Touch 'n Go" for charges, "To caregiver-1" for payouts, "Refund of #12" for refunds. */
export function paymentDetail(p: Payment): string {
  if (p.kind === 'charge') return p.method ? PAYMENT_METHODS[p.method] : '';
  if (p.kind === 'refund') return `Refund of #${p.parentId}`;
  return `To ${p.payee}`;
}

export const amountLabel = (p: Payment) => formatRM(p.amountSen);

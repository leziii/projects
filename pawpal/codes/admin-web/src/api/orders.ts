import { BOOKING_STATE_LABEL, MONEY_STATUS_LABEL, type AdminOrderAddress, type AdminOrderDetail, type AdminOrderPage, type BookingState, type MoneyStatus } from '@pawpal/shared';
import { api } from './payments';

export interface OrderFilters {
  booking: BookingState | '';
  money: MoneyStatus | '';
  from: string;
  to: string;
  q: string;
  page: number;
}

/** "?booking=done&page=2": empty filters are left out. */
export function orderQuery(f: OrderFilters): string {
  const p = new URLSearchParams();
  for (const k of ['booking', 'money', 'from', 'to', 'q'] as const) if (f[k].trim()) p.set(k, f[k].trim());
  if (f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** E14-2 A07 (R58-1, R58-2). */
export const listOrders = (f: OrderFilters, fetcher?: typeof fetch) => api<AdminOrderPage>(`/admin/orders${orderQuery(f)}`, undefined, fetcher);
/** A08 (R58-3). */
export const getOrder = (id: number, fetcher?: typeof fetch) => api<AdminOrderDetail>(`/admin/orders/${id}`, undefined, fetcher);
/** R58-4: recorded on the order each time. */
export const showAddress = (id: number, fetcher?: typeof fetch) => api<AdminOrderAddress>(`/admin/orders/${id}/address`, {}, fetcher);

export const BOOKING_TAG: Record<BookingState, 'info' | 'primary' | 'success' | 'warning' | 'danger'> = { waiting: 'info', accepted: 'primary', done: 'success', cancelled: 'warning', failed: 'danger' };
export const MONEY_STATUS_TAG: Record<MoneyStatus, 'info' | 'primary' | 'success' | 'warning' | 'danger'> = {
  unpaid: 'info',
  paid: 'primary',
  refund_processing: 'warning',
  refunded: 'success',
  paying_out: 'warning',
  paid_out: 'success',
  payout_failed: 'danger',
};
export const bookingText = (b: BookingState) => BOOKING_STATE_LABEL[b];
export const moneyStatusText = (m: MoneyStatus) => MONEY_STATUS_LABEL[m];

import type { AppliedPromo, BookingDraft, CaregiverOption, DraftInput, EntryInfo, MockOutcome, OrderDetail, OrderFilter, OrderPage, OrderView, PayProblem, PaymentMethod } from '@pawpal/shared';
import { api } from './client';

export const getDraft = () => api<BookingDraft>('/bookings/draft');
export const saveDraft = (input: DraftInput) => api<BookingDraft>('/bookings/draft', input);
export const clearDraft = () => api<BookingDraft>('/bookings/draft/clear', {});
export const listCaregivers = () => api<{ options: CaregiverOption[]; note: string }>('/bookings/draft/caregivers');
export const chooseCaregiver = (caregiverId: number) => api<BookingDraft>('/bookings/draft/caregiver', { caregiverId });
export const saveEntry = (entry: EntryInfo) => api<BookingDraft>('/bookings/draft/entry', entry);

type Paying = { order: OrderView; paymentId: number };
export interface Checkout {
  draft: BookingDraft;
  problems: PayProblem[];
  promo: AppliedPromo | null;
  /** Credit used now (E5-7) and what the owner pays after promo and credit. */
  creditSen: number;
  payTotal: number;
}
export const getCheckout = () => api<Checkout>('/bookings/draft/checkout');
export const applyPromo = (code: string) => api<Checkout>('/bookings/draft/promo', { code });
export const removePromo = () => api<Checkout>('/bookings/draft/promo/remove', {});
export const payNow = (method: PaymentMethod) => api<Paying>('/bookings/draft/pay', { healthConfirmed: true, method });
/** E7-1 My orders: 20 at a time; before = the `next` of the page before. */
export const getOrders = (filter: OrderFilter, before?: number) => api<OrderPage>(`/orders?filter=${filter}${before ? `&before=${before}` : ''}`);
/** E7-2 O13 */
export const getOrderDetail = (id: number) => api<OrderDetail>(`/orders/${id}/detail`);
/** O14 (E8-3, R35-4): the owner lets the arrived caregiver in. */
export const confirmEntry = (id: number, i: number) => api<OrderDetail>(`/orders/${id}/visits/${i}/confirm-entry`, {});
export const getOrder = (id: number) => api<OrderView>(`/orders/${id}`);
/** E6-5 "Book again": the old order becomes the draft; replace = the owner agreed to replace a booking in progress. */
export const rebookOrder = (id: number, replace: boolean) => api<BookingDraft>(`/orders/${id}/rebook`, { replace });
/** E6-4: withdraw a paid order before the caregiver accepts. */
export const withdrawOrder = (id: number) => api<OrderView>(`/orders/${id}/withdraw`, {});
/** The test payment page plays the gateway (R21-5): success, fail or still checking. */
export const testOutcome = (paymentId: number, outcome: MockOutcome) => api<unknown>(`/mock-gateway/payments/${paymentId}/outcome`, { outcome });

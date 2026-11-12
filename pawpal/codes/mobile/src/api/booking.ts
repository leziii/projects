import type { AppliedPromo, CancelPreview, CancelResult, BookingDraft, CaregiverOption, DraftInput, EntryInfo, MockOutcome, OrderDetail, OrderFilter, OrderPage, OrderView, PayProblem, PaymentMethod, VisitCase, VisitReport, OrderReview, OrderRefunds, ExtraFee } from '@pawpal/shared';
import { ApiError, api, apiBase, getToken } from './client';

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
/** O19 (E11-3, R47-1 … R47-5) */
export const getExtraFees = (id: number) => api<ExtraFee[]>(`/orders/${id}/extra-fees`);
export const payExtraFee = (id: number, feeId: number, method: PaymentMethod) => api<{ fee: ExtraFee; paymentId: number }>(`/orders/${id}/extra-fees/${feeId}/pay`, { method });
export const declineExtraFee = (id: number, feeId: number) => api<ExtraFee>(`/orders/${id}/extra-fees/${feeId}/decline`, {});
/** O17 (E9-1): a visit's sent report, by order and visit or by the message link's run id. */
export const getReport = (id: number, i: number) => api<VisitReport>(`/orders/${id}/visits/${i}/report`);
export const getReportByRun = (runId: number) => api<VisitReport>(`/reports/${runId}`);
/** O17 (E9-2, R40-1): "Confirm, all good". */
export const confirmReport = (id: number, i: number) => api<VisitReport>(`/orders/${id}/visits/${i}/confirm`, {});
/** O18 (R40-3, R40-6): the owner's case on one visit. */
export const getCase = (id: number, i: number) => api<VisitCase>(`/orders/${id}/visits/${i}/case`);

export async function raiseProblem(id: number, i: number, input: { kind: string; description: string }, photos: Blob[]): Promise<VisitCase> {
  const form = new FormData();
  form.append('kind', input.kind);
  form.append('description', input.description);
  photos.forEach((p, n) => form.append('photos', p, `photo${n + 1}.jpg`));
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/orders/${id}/visits/${i}/case`, { method: 'POST', body: form, headers: { authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('OFFLINE', 'Could not send. Check your connection and try again', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!res.ok) throw new ApiError(body.code ?? `HTTP_${res.status}`, res.status === 413 ? 'A photo is too big (max 10 MB)' : (body.message ?? 'Could not send'), res.status, body);
  return body as VisitCase;
}

export async function casePhotoUrl(id: number, i: number, photoId: number): Promise<string> {
  const res = await fetch(`${apiBase()}/api/orders/${id}/visits/${i}/case/photos/${photoId}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}

/** R39-4: report photos are private, so they are loaded with the login token. */
export async function reportPhotoUrl(id: number, i: number, photoId: number): Promise<string> {
  const res = await fetch(`${apiBase()}/api/orders/${id}/visits/${i}/photos/${photoId}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}
/** E10-1 O15 (R42-1 … R42-4) */
export const getCancelPreview = (id: number) => api<CancelPreview>(`/orders/${id}/cancel`);
export const cancelVisits = (id: number, visits: number[], percents: number[]) => api<CancelResult>(`/orders/${id}/cancel`, { visits, percents });

/** E10-3 O16 (R44-1 … R44-3) */
export const getOrderRefunds = (id: number) => api<OrderRefunds>(`/orders/${id}/refunds`);

/** E9-3 O21 (R41-2) */
export const rateOrder = (id: number, stars: number, comment: string) => api<OrderReview>(`/orders/${id}/review`, { stars, comment });

export const getOrder = (id: number) => api<OrderView>(`/orders/${id}`);
/** E6-5 "Book again": the old order becomes the draft; replace = the owner agreed to replace a booking in progress. */
export const rebookOrder = (id: number, replace: boolean) => api<BookingDraft>(`/orders/${id}/rebook`, { replace });
/** E6-4: withdraw a paid order before the caregiver accepts. */
export const withdrawOrder = (id: number) => api<OrderView>(`/orders/${id}/withdraw`, {});
/** The test payment page plays the gateway (R21-5): success, fail or still checking. */
export const testOutcome = (paymentId: number, outcome: MockOutcome) => api<unknown>(`/mock-gateway/payments/${paymentId}/outcome`, { outcome });

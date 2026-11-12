/**
 * E7-1 "My orders" (O12, R30-1 … R30-6): paid orders only, newest first, 20 at a time, four filters.
 */
import type { ExtraFee } from './extra-fees';
import type { BookingVisit } from './booking';
import { deadlineText, type OrderEnd, type OrderStatus, type OrderView } from './orders';
import { formatRM, type ServiceLevel, type VisitQuote } from './rules';
import { timeText } from './schedule';
import { visitWhen, type VisitAddress } from './requests';
import type { VisitRun } from './tasks';
import type { OrderReview } from './reviews';

export type OrderFilter = 'all' | 'waiting' | 'booked' | 'ended';

export const ORDER_FILTERS: { value: OrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'booked', label: 'Booked' },
  { value: 'ended', label: 'Ended' },
];

export const ORDER_LIST_RULES = { pageSize: 20 } as const;

/** One order as the list needs it. */
export interface OrderListRow {
  id: number;
  number: string;
  status: OrderStatus;
  endReason: OrderEnd | null;
  visits: number;
  firstVisit: BookingVisit;
  paySen: number;
  refundSen: number;
  /** KL time "YYYY-MM-DD HH:MM:SS.mmm"; null once ended. */
  acceptDeadline: string | null;
}

export interface OrderPage {
  rows: OrderListRow[];
  /** Pass back as `before` for the next 20; null when there are no more. */
  next: number | null;
}

export const isOrderFilter = (v: unknown): v is OrderFilter => ORDER_FILTERS.some((f) => f.value === v);

/** The status tag on a card. */
export function orderTag(o: Pick<OrderListRow, 'status' | 'endReason'>): string {
  if (o.status === 'pending_accept') return 'Waiting';
  if (o.status === 'accepted') return 'Booked';
  if (o.status === 'cancelled') return o.endReason === 'withdrawn' ? 'Withdrawn' : 'Cancelled';
  if (o.status === 'failed') return o.endReason === 'too_late' ? 'Failed' : 'Not accepted';
  return 'Waiting for payment';
}

/** R30-4: the one line under the tag. */
export function orderLine(o: OrderListRow, now: Date): string {
  if (o.status === 'pending_accept') return o.acceptDeadline ? `Accept by ${deadlineText(o.acceptDeadline, now)}` : 'Waiting for the caregiver';
  if (o.status === 'accepted') return `First visit ${visitWhen(o.firstVisit)}`;
  return o.refundSen ? `${formatRM(o.refundSen)} refunded in full` : 'Full refund on its way';
}

/** E7-2 O13 (R31-1 … R31-6): the order with its address and how far the refund has got. */
export interface OrderDetail extends OrderView {
  /** Refunds the bank has confirmed; refundSen less this is still on its way (R31-4). */
  refundDoneSen: number;
  /** The owner's own address for this order (R31-6). */
  address: (VisitAddress & { area: string }) | null;
  /** How far each visit has got, in the order of `visits` (R35-1). */
  runs: VisitRun[];
  /** E9-3 (R41-1, R41-3): whether the owner can rate the caregiver now. */
  review: OrderReview;
  /** E11-3 (R47-1): waiting or overtime requests waiting for the owner. */
  extraFees: ExtraFee[];
}

/** R31-3, R35-1: a visit's status for the owner — from the order, then from its own progress once booked. */
export function visitStatus(o: Pick<OrderView, 'status'>, run?: Pick<VisitRun, 'status'>): string {
  if (o.status === 'pending_accept') return 'Waiting for caregiver';
  // E10-1: a cancelled visit says so, even once the whole order is cancelled.
  if (run?.status === 'cancelled') return 'Cancelled';
  if (o.status === 'accepted') return { arrived: 'Caregiver arrived', in_service: 'In service', report_sent: 'Report ready', confirmed: 'Confirmed', disputed: 'Under review', cancelled: 'Cancelled' }[run?.status as string] ?? 'Booked';
  if (o.status === 'awaiting_payment') return 'Not paid yet';
  return 'Not going ahead';
}

/** R31-4: never "Refunded" before the bank confirms. Null when there is no refund. */
export function refundLine(o: Pick<OrderDetail, 'refundSen' | 'refundDoneSen'>): string | null {
  if (!o.refundSen) return null;
  if (o.refundDoneSen >= o.refundSen) return `Refunded ${formatRM(o.refundSen)}`;
  if (!o.refundDoneSen) return `Refund on its way ${formatRM(o.refundSen)}`;
  return `Refunded ${formatRM(o.refundDoneSen)} · on its way ${formatRM(o.refundSen - o.refundDoneSen)}`;
}

/** E7-3 O14 (R32-2): "9:00 – 9:45 am" (both ends shown in full when the visit crosses noon). */
export function plannedTime(v: { start: number; quote: Pick<VisitQuote, 'totalMinutes'> }): string {
  const from = timeText(v.start);
  const to = timeText(v.start + v.quote.totalMinutes);
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)} – ${to}` : `${from} – ${to}`;
}

const SERVICE_KIND = { cat: 'cats', dog: 'dogs', mixed: 'dogs + cats' } as const;

/** "Basic care · cats" */
export const serviceText = (level: ServiceLevel, q: Pick<VisitQuote, 'serviceKind'>) => `${level === 'upgrade' ? 'Upgrade care' : 'Basic care'} · ${SERVICE_KIND[q.serviceKind]}`;

/** R32-2: the price lines of one visit; "paid" is after the promo and credit share. */
export function visitPriceLines(v: { quote: VisitQuote; paidSen: number }): { label: string; sen: number }[] {
  const lines = [{ label: 'Base price', sen: v.quote.basePrice }];
  if (v.quote.extraPetFee) lines.push({ label: 'Extra pet', sen: v.quote.extraPetFee });
  if (v.quote.overtimeFee) lines.push({ label: 'Extra time', sen: v.quote.overtimeFee });
  return lines;
}

/** R32-3: rows that fill in once the visit happens (E8). */
export const AFTER_VISIT = 'After the visit';

/**
 * E10-3 O16 (round 44): the owner tracks each refund of an order.
 * Money only in the totals; credit back is shown on its own. The owner never sees "failed" (R44-3).
 */
import { formatRM } from './rules';

/** R44-4: a failed refund is tried again this many times before the admin is asked to look. */
export const REFUND_RETRIES = 3;
/** R44-4: minutes to wait after a failure before trying again. */
export const REFUND_RETRY_MINUTES = 3;

/** on_its_way = sent, bank not done yet · refunded = bank confirmed · processing = could not go through yet, being retried. */
export type RefundState = 'on_its_way' | 'refunded' | 'processing';

export interface RefundLine {
  /** Stable id of this refund within the order: "full-12" (whole charge), "v0" (visit 1 cancelled), "w5" / "o5" (unused extra fee 5). */
  key: string;
  reason: string;
  amountSen: number;
  state: RefundState;
  /** When the bank confirmed it (KL time, "YYYY-MM-DD HH:MM:SS"), only when refunded. */
  doneAt: string | null;
}

export interface OrderRefunds {
  orderId: number;
  number: string;
  dueSen: number;
  refundedSen: number;
  onItsWaySen: number;
  /** R44-2: credit that came back as credit, never as money. */
  creditBackSen: number;
  lines: RefundLine[];
}

/** Admin (R44-4): a refund that still failed after every automatic retry. */
export interface StuckRefund {
  orderId: number;
  number: string;
  key: string;
  reason: string;
  amountSen: number;
  /** Tries so far, the first one included. */
  tries: number;
  lastFailure: string | null;
  failedAt: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-08 13:20:00" → "8 Nov". */
export function dayMonthText(at: string): string {
  const [, m, d] = at.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** R44-3: what the owner sees for one refund. */
export function refundStateText(l: Pick<RefundLine, 'state' | 'doneAt'>): string {
  if (l.state === 'refunded') return l.doneAt ? `Refunded ${dayMonthText(l.doneAt)}` : 'Refunded';
  return l.state === 'on_its_way' ? 'On its way' : 'Being processed';
}

/** R44-3: why the money comes back. */
export function refundReason(key: string, endReason: string | null): string {
  // E11-4 (R48-3): unused waiting prepay (w12) and unused overtime (o12), by extra fee id.
  if (/^w\d+$/.test(key)) return 'Waiting: unused prepay';
  if (/^o\d+$/.test(key)) return 'Overtime: unused time';
  const visit = /^v(\d+)$/.exec(key);
  if (visit) return `Visit ${Number(visit[1]) + 1} cancelled`;
  if (endReason === 'withdrawn') return 'Withdrawn';
  if (endReason === 'rejected' || endReason === 'timeout') return 'Not accepted';
  return 'Could not go ahead';
}

/** R44-2: "Due RM40 · Refunded RM20 · On its way RM20". */
export function refundSummaryText(r: Pick<OrderRefunds, 'dueSen' | 'refundedSen' | 'onItsWaySen'>): string {
  return `Due ${formatRM(r.dueSen)} · Refunded ${formatRM(r.refundedSen)} · On its way ${formatRM(r.onItsWaySen)}`;
}

/** R44-2: "RM10 came back as credit." or null. */
export function creditBackText(sen: number): string | null {
  return sen > 0 ? `${formatRM(sen)} came back as credit.` : null;
}

/** The order's refunds from its lines; credit is added by the caller. */
export function refundTotals(lines: RefundLine[]): Pick<OrderRefunds, 'dueSen' | 'refundedSen' | 'onItsWaySen'> {
  const dueSen = lines.reduce((s, l) => s + l.amountSen, 0);
  const refundedSen = lines.filter((l) => l.state === 'refunded').reduce((s, l) => s + l.amountSen, 0);
  return { dueSen, refundedSen, onItsWaySen: dueSen - refundedSen };
}

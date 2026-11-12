/**
 * E10-1 O15 (round 42): the owner cancels chosen visits of a booked order that have not started.
 * Each visit's % (≥24 h 100 · 1–24 h 80 · <1 h 0, from submit time) applies to what was paid for it after promo and credit;
 * the credit part comes back as credit, the rest goes back to how the owner paid.
 */
import { visitTime } from './booking';
import type { OrderVisit } from './orders';
import { splitDiscount } from './promos';
import { visitWhen } from './requests';
import { cancelRefund, formatRM } from './rules';
import type { VisitRun } from './tasks';

export interface CancelLine {
  index: number;
  when: string;
  /** What was paid for this visit after promo, credit included. */
  paidSen: number;
  /** Null when the visit cannot be cancelled. */
  percent: number | null;
  refundSen: number;
  /** Part of refundSen that comes back as credit. */
  creditSen: number;
  /** Why it cannot be cancelled; null when it can. */
  blocked: string | null;
}

export interface CancelPreview {
  orderId: number;
  number: string;
  lines: CancelLine[];
}

/** R43-4: 'started' = money on its way; 'processing' = could not start yet, retried automatically; 'none' = nothing to send. */
export type CancelRefundState = 'started' | 'processing' | 'none';

export interface CancelResult {
  /** The visits cancelled now, in order. */
  cancelled: { index: number; percent: number; refundSen: number; creditSen: number; refund: CancelRefundState }[];
  /** R43-1, R43-2: ticked visits that could not be cancelled, with why. */
  failed: { index: number; reason: string }[];
  refundSen: number;
  creditSen: number;
  /** Every visit is now cancelled. */
  orderCancelled: boolean;
}

/** Credit used for each visit, in proportion to what was paid for it. */
export function creditShares(paid: number[], creditSen: number): number[] {
  const left = splitDiscount(paid, creditSen);
  return paid.map((p, i) => p - left[i]);
}

const BLOCKED: Partial<Record<VisitRun['status'], string>> = {
  arrived: 'Caregiver already arrived',
  in_service: 'Caregiver already arrived',
  report_sent: 'Already done',
  confirmed: 'Already done',
  disputed: 'Already done',
  cancelled: 'Cancelled',
};

/** R42-1, R42-3: every visit with what cancelling it now would refund. */
export function cancelLines(visits: Pick<OrderVisit, 'date' | 'start' | 'paidSen'>[], creditSen: number, runs: Pick<VisitRun, 'status'>[], now: Date): CancelLine[] {
  const credit = creditShares(
    visits.map((v) => v.paidSen),
    creditSen,
  );
  return visits.map((v, i) => {
    const base = { index: i, when: visitWhen(v), paidSen: v.paidSen };
    const blocked = BLOCKED[runs[i]?.status ?? 'todo'] ?? (visitTime(v).getTime() <= now.getTime() ? 'Time has started' : null);
    if (blocked) return { ...base, percent: null, refundSen: 0, creditSen: 0, blocked };
    const { percent, refund } = cancelRefund(visitTime(v), now, v.paidSen);
    const creditBack = Math.min(refund, Math.round((credit[i] * percent) / 100));
    return { ...base, percent, refundSen: refund, creditSen: creditBack, blocked: null };
  });
}

/** O15 next to each visit: "Full refund RM70" / "80% back = RM56" / "No refund (under 1 h)". */
export function cancelLineText(l: CancelLine): string {
  if (l.blocked) return l.blocked;
  if (l.percent === 100) return `Full refund ${formatRM(l.refundSen)}`;
  if (l.percent) return `${l.percent}% back = ${formatRM(l.refundSen)}`;
  return 'No refund (under 1 h)';
}

/** R42-7: the popup before cancelling. */
export function cancelConfirmText(count: number, refundSen: number): string {
  const what = `${count} visit${count === 1 ? '' : 's'}`;
  const money = refundSen ? `${formatRM(refundSen)} will be refunded.` : 'Nothing will be refunded.';
  return `Cancel ${what}? ${money} This can't be undone.`;
}

/** O15 under the total: how the refund comes back. */
export function refundSplitText(refundSen: number, creditSen: number): string {
  if (!refundSen) return 'No refund';
  if (!creditSen) return `${formatRM(refundSen)} back to how you paid`;
  if (creditSen >= refundSen) return `${formatRM(refundSen)} back as credit`;
  return `${formatRM(refundSen - creditSen)} back to how you paid · ${formatRM(creditSen)} back as credit`;
}

/** R42-1, R42-2: O13 / O14 show the cancel button only for a booked order's visit that has not started. */
export const canCancelVisit = (orderStatus: string, run: Pick<VisitRun, 'status'> | undefined, v: Pick<OrderVisit, 'date' | 'start'>, now: Date) =>
  orderStatus === 'accepted' && (run?.status ?? 'todo') === 'todo' && visitTime(v).getTime() > now.getTime();

/** O13 / O14 on a cancelled visit: "Cancelled · 80% back = RM56" / "Cancelled · no refund". */
export function cancelledText(c: NonNullable<VisitRun['cancel']>): string {
  if (!c.refundSen) return 'Cancelled · no refund';
  return c.percent === 100 ? `Cancelled · full refund ${formatRM(c.refundSen)}` : `Cancelled · ${c.percent}% back = ${formatRM(c.refundSen)}`;
}

const WHY: Record<string, string> = {
  'Caregiver already arrived': 'the caregiver has already arrived',
  'Time has started': 'its time has started',
  Cancelled: 'it was already cancelled',
  'Already done': 'it has already happened',
};

/** R43-2: "Not cancelled: the caregiver has already arrived". */
export const notCancelledText = (blocked: string) => `Not cancelled: ${WHY[blocked] ?? blocked.toLowerCase()}`;

/** R43-2, R43-4: "Cancelled · RM56 back" / "Cancelled · RM56 refund being processed" / "Cancelled · no refund". */
export function cancelledResultText(c: CancelResult['cancelled'][number]): string {
  if (!c.refundSen) return 'Cancelled · no refund';
  if (c.refund === 'processing') return `Cancelled · ${formatRM(c.refundSen)} refund being processed`;
  return `Cancelled · ${formatRM(c.refundSen)} back`;
}

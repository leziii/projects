/**
 * Orders (E5-4, O10): what the owner confirms and pays for. Prices are locked when the order is made (R21-4).
 */
import type { BookingDraft, BookingVisit, EntryMethod } from './booking';
import type { PaymentMethod, PaymentStatus } from './payments';
import { DEFAULT_RULES, formatRM, type AcceptKind, type PetKind, type RuleSet, type ServiceLevel, type VisitQuote } from './rules';
import { timeLeftText } from './requests';
import { addDays, dayText, klDate, timeText } from './schedule';

/**
 * awaiting_payment → pending_accept (paid, waiting for the caregiver, E6); cancelled when the booking is edited;
 * failed when the payment lands with the first visit under 3 h away (R22-4, full refund).
 */
export type OrderStatus = 'awaiting_payment' | 'pending_accept' | 'accepted' | 'cancelled' | 'failed';
/** Why a paid order failed: paid under 3 h before (R22-4), the caregiver said no (R26-5), or no answer in time (E6-3). */
/** 'cancelled': the owner cancelled every visit (E10-1, R42-6). */
export type OrderEnd = 'too_late' | 'rejected' | 'timeout' | 'withdrawn' | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Waiting for payment',
  pending_accept: 'Paid, waiting for the caregiver to accept',
  accepted: 'Booked',
  cancelled: 'Cancelled',
  failed: 'Failed, refunded in full',
};

/** O11 asks the server every 3 s and stops after 2 min (R22-2). */
export const RESULT_POLL = { everyMs: 3000, stopAfterMs: 120_000 } as const;

export const HEALTH_DECLARATION = "I confirm my pets' health details are true and they have no new illness or injury.";
export const PAID_NOT_ACCEPTED = 'Paid is not accepted. The caregiver must accept the whole order in time.';
/** Methods offered on O10 (R21-5). */
export const PAY_METHODS: readonly PaymentMethod[] = ['tng', 'duitnow', 'card'];

/** "≥24 h before: 100% back · 1 h to under 24 h: 80% · under 1 h: no refund" (rule 2.4). */
export function cancelPolicyText(r: RuleSet = DEFAULT_RULES): string[] {
  const c = r.cancel;
  return [`${c.fullRefundHours} h or more before a visit: 100% back`, `${c.partialRefundHours} h to under ${c.fullRefundHours} h: ${c.partialRefundPercent}% back`, `Under ${c.partialRefundHours} h: no refund`];
}

/** "P20261031001": P, the day in Kuala Lumpur, and that day's number. */
export function orderNumber(now: Date, seq: number): string {
  return `P${klDate(now).replace(/-/g, '')}${String(seq).padStart(3, '0')}`;
}

/** A thing that stops payment, and where to fix it. */
export interface PayProblem {
  text: string;
  fix: 'setup' | 'caregiver' | 'entry' | 'pets' | 'promo';
}

/**
 * R21-3: everything must be in order before paying. The server adds "caregiver no longer free" itself.
 * Pets still being checked block payment (R9-6).
 */
export function payProblems(d: BookingDraft): PayProblem[] {
  const out: PayProblem[] = d.summary.blocks.map((text) => ({ text, fix: 'setup' as const }));
  if (d.summary.waitsForCheck.length) out.push({ text: `${d.summary.waitsForCheck.join(', ')}: still being checked. You can pay once approved`, fix: 'pets' });
  if (!d.caregiver) out.push({ text: d.caregiverNote ?? 'Choose a caregiver', fix: 'caregiver' });
  if (!d.entry) out.push({ text: 'Say how the caregiver gets in', fix: 'entry' });
  return out;
}

export interface OrderVisit extends BookingVisit {
  label: string;
  quote: VisitQuote;
  /** What the owner paid for this visit after the promo share (R23-5); refunds follow it. */
  paidSen: number;
}

/** What O10 and the result page show. Entry instructions are never part of it (R21-1). */
export interface OrderView {
  id: number;
  number: string;
  status: OrderStatus;
  caregiver: { id: number; displayName: string };
  pets: { id: number; name: string; kind: PetKind }[];
  level: ServiceLevel;
  visits: OrderVisit[];
  /** Full price; the caregiver's 85% is taken from this (R7-3). */
  totalSen: number;
  promoCode: string | null;
  discountSen: number;
  /** Credit used (E5-7). */
  creditSen: number;
  /** What the owner pays in money: total less the promo and the credit. */
  paySen: number;
  entryMethod: EntryMethod;
  createdAt: string;
  paidAt: string | null;
  /** When the caregiver must accept by (R22-1); null until paid. */
  acceptDeadline: string | null;
  acceptKind: AcceptKind | null;
  /** Why it failed, when it did. */
  endReason: OrderEnd | null;
  /** Refunded so far, in sen. */
  refundSen: number;
  /** The latest charge for this order. */
  payment: { id: number; status: PaymentStatus; method: PaymentMethod | null; failureReason: string | null } | null;
}

/** "1:20 pm today", "1:20 pm tomorrow" or "1:20 pm, Sat 1 Nov"; times are Kuala Lumpur time as the server writes them. */
export function deadlineText(at: string, now: Date): string {
  const date = at.slice(0, 10);
  const time = timeText(Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16)));
  const today = klDate(now);
  if (date === today) return `${time} today`;
  if (date === addDays(today, 1)) return `${time} tomorrow`;
  return `${time}, ${dayText(date)}`;
}

export interface PayResult {
  title: string;
  body: string;
  tone: 'ok' | 'bad' | 'wait';
  retry: boolean;
  /** Still asking the server for the result. */
  polling: boolean;
}

type ResultInput = Pick<OrderView, 'status' | 'payment' | 'paySen' | 'refundSen' | 'acceptDeadline'> & Partial<Pick<OrderView, 'endReason'>> & { caregiver: { displayName: string } };

/** O11 (R22-1 … R22-4). stopped = the page has stopped asking after 2 min. */
export function payResult(o: ResultInput, now: Date, stopped = false): PayResult {
  const refund = o.refundSen ? ` ${formatRM(o.refundSen)} is refunded in full.` : '';
  if (o.status === 'pending_accept') {
    const title = `Paid ${formatRM(o.paySen)}`;
    if (!o.acceptDeadline) return { title, body: `Waiting for ${o.caregiver.displayName} to accept. ${PAID_NOT_ACCEPTED}`, tone: 'ok', retry: false, polling: false };
    // R27-4: live countdown; once it runs out the server fails and refunds the order within 30 s, so keep asking.
    const left = timeLeftText(o.acceptDeadline, now);
    if (!left) return { title, body: `${o.caregiver.displayName}'s time to accept is up. Checking…`, tone: 'wait', retry: false, polling: true };
    const until = deadlineText(o.acceptDeadline, now);
    return { title, body: `${o.caregiver.displayName} has ${left.replace(/ left$/, '')} left to accept (until ${until}). ${PAID_NOT_ACCEPTED}`, tone: 'ok', retry: false, polling: false };
  }
  if (o.status === 'accepted') {
    return { title: 'Booked', body: `${o.caregiver.displayName} accepted your booking. You will find the visits in your orders.`, tone: 'ok', retry: false, polling: false };
  }
  if (o.status === 'failed' && o.endReason === 'timeout') {
    return { title: 'Not accepted', body: `${o.caregiver.displayName} did not answer in time.${refund || ' A full refund is on its way.'} You can book again with another caregiver.`, tone: 'bad', retry: false, polling: false };
  }
  if (o.status === 'failed' && o.endReason === 'rejected') {
    return { title: 'Not accepted', body: `${o.caregiver.displayName} could not take this booking.${refund || ' A full refund is on its way.'} You can book again with another caregiver.`, tone: 'bad', retry: false, polling: false };
  }
  if (o.status === 'failed') {
    const h = DEFAULT_RULES.accept.failBelowHours;
    return { title: 'Order failed', body: `The payment came in when your first visit was less than ${h} hours away, so there is no time to accept.${refund || ' A full refund is on its way.'}`, tone: 'bad', retry: false, polling: false };
  }
  if (o.status === 'cancelled' && o.endReason === 'withdrawn') {
    // R28-5
    return { title: 'Booking withdrawn', body: `You withdrew this booking.${refund || ' A full refund is on its way.'}`, tone: 'bad', retry: false, polling: false };
  }
  if (o.status === 'cancelled' && o.endReason === 'cancelled') return { title: 'Order cancelled', body: `You cancelled every visit.${o.refundSen ? ` ${formatRM(o.refundSen)} is refunded.` : ''}`, tone: 'bad', retry: false, polling: false };
  if (o.status === 'cancelled') return { title: 'Order cancelled', body: `This order was replaced when the booking changed.${refund}`, tone: 'bad', retry: false, polling: false };
  if (o.payment?.status === 'failed') return { title: 'Payment failed', body: `${o.payment.failureReason ?? 'The bank said no'}. Nothing was charged. You can try again.`, tone: 'bad', retry: true, polling: false };
  if (stopped) return { title: 'Still checking', body: 'Still checking. We will message you when we know. Pull down to check again.', tone: 'wait', retry: false, polling: false };
  return { title: 'Checking your payment', body: 'We are confirming the result with the bank. This page updates by itself.', tone: 'wait', retry: false, polling: true };
}

/** R28-2: the popup before the owner withdraws a booking that is waiting for the caregiver. */
export const withdrawConfirmText = (paySen: number) => `Withdraw this booking? ${formatRM(paySen)} will be refunded in full.`;

/** E6-5 (R29-1): the endings that offer "Book again". */
export const canRebook = (o: Pick<OrderView, 'status' | 'endReason'>) =>
  (o.status === 'failed' && (o.endReason === 'timeout' || o.endReason === 'rejected' || o.endReason === 'too_late')) || (o.status === 'cancelled' && o.endReason === 'withdrawn');

/** E6-5 (R29-2, R29-4): the note on O06 after "Book again"; it goes once a caregiver is chosen. */
export function rebookNote(number: string, removed: number, left: number): string {
  const past = !removed ? '' : !left ? ' All the visits were in the past, so pick new dates.' : removed === 1 ? ' 1 visit was in the past and was removed.' : ` ${removed} visits were in the past and were removed.`;
  return `Copied from order ${number}.${past} Choose a caregiver again.`;
}

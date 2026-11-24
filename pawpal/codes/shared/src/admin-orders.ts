/**
 * E14-2 A07 / A08 (round 58): the admin's order list and one order in full.
 * Booking and money are two separate states with separate filters (R58-2).
 */
import { RuleError } from './rules';

/** waiting = not paid yet or waiting for the caregiver · accepted = visits still to come · done = every visit final. */
export type BookingState = 'waiting' | 'accepted' | 'done' | 'cancelled' | 'failed';
export const BOOKING_STATES: BookingState[] = ['waiting', 'accepted', 'done', 'cancelled', 'failed'];
export const BOOKING_STATE_LABEL: Record<BookingState, string> = { waiting: 'Waiting', accepted: 'Accepted', done: 'Done', cancelled: 'Cancelled', failed: 'Failed' };

/**
 * One money state per order, the first that applies:
 * not paid → payout failed → refund processing → paid out → paying out → refunded → paid.
 */
export type MoneyStatus = 'unpaid' | 'paid' | 'refund_processing' | 'refunded' | 'paying_out' | 'paid_out' | 'payout_failed';
export const MONEY_STATUSES: MoneyStatus[] = ['unpaid', 'paid', 'refund_processing', 'refunded', 'paying_out', 'paid_out', 'payout_failed'];
export const MONEY_STATUS_LABEL: Record<MoneyStatus, string> = {
  unpaid: 'Not paid',
  paid: 'Paid',
  refund_processing: 'Refund processing',
  refunded: 'Refunded',
  paying_out: 'Paying out',
  paid_out: 'Paid out',
  payout_failed: 'Payout failed',
};

export const ADMIN_ORDER_RULES = { pageSize: 20, searchMax: 40 } as const;

export interface AdminOrderQuery {
  booking: BookingState | null;
  money: MoneyStatus | null;
  /** KL dates "YYYY-MM-DD" the order was made, both included. */
  from: string | null;
  to: string | null;
  /** Order number or phone digits. */
  q: string | null;
  /** From 1. */
  page: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** R58-2: reads the list's filters; an unknown value is refused, an empty one is no filter. */
export function checkOrderQuery(input: Record<string, unknown>): AdminOrderQuery {
  const text = (k: string) => (typeof input[k] === 'string' && (input[k] as string).trim() ? (input[k] as string).trim() : null);
  const booking = text('booking');
  if (booking && !BOOKING_STATES.includes(booking as BookingState)) throw new RuleError('BAD_FILTER', 'Unknown booking status');
  const money = text('money');
  if (money && !MONEY_STATUSES.includes(money as MoneyStatus)) throw new RuleError('BAD_FILTER', 'Unknown money status');
  const from = text('from');
  const to = text('to');
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) throw new RuleError('BAD_FILTER', 'Dates must be YYYY-MM-DD');
  const q = text('q');
  if (q && q.length > ADMIN_ORDER_RULES.searchMax) throw new RuleError('BAD_FILTER', `Search is at most ${ADMIN_ORDER_RULES.searchMax} characters`);
  const page = Number(input.page ?? 1);
  return { booking: booking as BookingState | null, money: money as MoneyStatus | null, from, to, q, page: Number.isInteger(page) && page >= 1 ? page : 1 };
}

/** What a search box text means: phone digits (at least 4, a leading 0 dropped as phones are kept as +60…), or part of an order number. */
export function searchOf(q: string): { digits: string | null; number: string } {
  const digits = q.replace(/[\s+-]/g, '');
  return { digits: /^\d{4,}$/.test(digits) ? digits.replace(/^0/, '') : null, number: q.toUpperCase() };
}

/** R58-1: "+60123456789" → "+60 12-*** 6789". */
export function maskPhone(phone: string): string {
  const m = /^\+60(1\d)(\d{3,4})(\d{4})$/.exec(phone);
  return m ? `+60 ${m[1]}-*** ${m[3]}` : phone.replace(/\d(?=\d{4})/g, '*');
}

/** R58-1: "3 visits", "3 · 1 cancelled". */
export function visitSummary(visits: number, cancelled: number): string {
  return cancelled ? `${visits} · ${cancelled} cancelled` : `${visits} visit${visits === 1 ? '' : 's'}`;
}

/** A07 row. */
export interface AdminOrderRow {
  id: number;
  number: string;
  createdAt: string;
  owner: string;
  caregiver: string;
  visits: number;
  cancelled: number;
  booking: BookingState;
  money: MoneyStatus;
}

export interface AdminOrderPage {
  rows: AdminOrderRow[];
  total: number;
  page: number;
}

/** A08: one visit. */
export interface AdminOrderVisit {
  index: number;
  date: string;
  start: number;
  /** Who does it: the order's caregiver, or "Moved to P… (Nur Aina)". */
  caregiver: string;
  /** TASK_STATUS_LABEL of the visit. */
  status: string;
  priceSen: number;
  /** "Refunded RM40", "Refund processing RM20", or null. */
  refund: string | null;
  reportSent: boolean;
  /** Links (R58-3). */
  exception: boolean;
  dispute: boolean;
  /** Money item ids of this visit's refunds. */
  money: string[];
}

export interface AdminOrderLog {
  at: string;
  who: string;
  what: string;
}

/** A08. */
export interface AdminOrderDetail extends AdminOrderRow {
  area: string;
  paidSen: number;
  refundedSen: number;
  refundProcessingSen: number;
  /** Money item of the order's payout, if settled with one. */
  payout: string | null;
  substituteOf: string | null;
  visitList: AdminOrderVisit[];
  log: AdminOrderLog[];
}

/** R58-4: shown only on request, and each view is recorded. */
export interface AdminOrderAddress {
  street: string;
  unit: string;
  postcode: string;
  contactName: string;
  contactPhone: string;
  entryMethod: string;
  entryNotes: string;
}

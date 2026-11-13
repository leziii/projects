/**
 * E11-3 O19 (round 47): the owner approves and pays the caregiver's waiting or overtime request.
 */
import type { PaymentMethod, PaymentStatus } from './payments';
import { formatRM } from './rules';
import { timeText } from './schedule';
import { OVERTIME_RULES, overtimeText } from './overtime';
import { WAITING_RULES } from './waiting';

export type ExtraFeeKind = 'overtime' | 'waiting';
/** requested → paid · declined (overtime) · lapsed (overtime, booked end passed) · withdrawn (caregiver) · not_needed (waiting ended free). */
export type ExtraFeeStatus = 'requested' | 'paid' | 'declined' | 'lapsed' | 'withdrawn' | 'not_needed';

export interface ExtraFee {
  id: number;
  orderId: number;
  number: string;
  index: number;
  kind: ExtraFeeKind;
  units: number;
  amountSen: number;
  status: ExtraFeeStatus;
  requestedAt: string;
  paidAt: string | null;
  caregiver: string;
  /** The visit, so O19 can show the waiting clock and the overtime end. */
  visit: { date: string; start: number; minutes: number; arrivedAt: string | null; enteredAt: string | null };
  entryMethod: 'pre_authorised' | 'live_confirm';
  /** The latest try at paying it. */
  payment: { id: number; status: PaymentStatus; method: PaymentMethod | null } | null;
  /** E11-4 (R48-1 … R48-3): what was used once waiting stopped or the report was sent, and the money sent back. */
  used: ExtraFeeUsed | null;
}

export interface ExtraFeeUsed {
  minutes: number;
  sen: number;
  refundSen: number;
  /** on_its_way = sent back, bank not done · refunded = bank confirmed · null = nothing to send back. */
  refund: 'on_its_way' | 'refunded' | null;
}

/** R48-2: overtime used, in started 15-min units, never more than was paid. Minutes are after the service end. */
export const overtimeUsedUnits = (minutesOver: number, paidUnits: number) =>
  Math.min(paidUnits, Math.max(0, Math.ceil(minutesOver / OVERTIME_RULES.unitMin)));

/** "2026-11-08 13:20:00" → minutes after midnight (KL). */
export const minuteOfDay = (at: string) => Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));

/** R48-4: what the caregiver earned from paid overtime once the report is sent. */
export const overtimeEarnedText = (usedMin: number, usedSen: number) => (usedSen ? `Overtime used ${usedMin} min · ${formatRM(usedSen)}` : 'Overtime not used · RM0');

/** R48-3: "Used 25 min · RM10 · RM15 refunded" / "… RM15 on its way" / "Used 60 min · RM25". */
export function extraFeeUsedText(u: ExtraFeeUsed): string {
  const head = `Used ${u.minutes} min · ${formatRM(u.sen)}`;
  if (!u.refundSen) return head;
  return `${head} · ${formatRM(u.refundSen)} ${u.refund === 'refunded' ? 'refunded' : 'on its way back'}`;
}

/** When the service ends: the planned end, or later when entry was late (minutes after midnight, KL). */
export function serviceEndMin(v: { start: number; minutes: number; enteredAt: string | null }): number {
  const entered = v.enteredAt ? minuteOfDay(v.enteredAt) : v.start;
  return Math.max(v.start, entered) + v.minutes;
}

/** R47-2: "you may stay until 6:11 pm" once overtime is paid. */
export const overtimeUntilText = (v: { start: number; minutes: number; enteredAt: string | null }, units: number) =>
  timeText(serviceEndMin(v) + units * OVERTIME_RULES.unitMin);

/** O19 title: "Overtime: 30 min · RM20" / "Waiting: prepay RM25". */
export const extraFeeTitle = (f: Pick<ExtraFee, 'kind' | 'units'>) => (f.kind === 'overtime' ? `Overtime: ${overtimeText(f.units)}` : `Waiting: prepay ${formatRM(WAITING_RULES.maxSen)}`);

const STATUS_TEXT: Record<ExtraFeeStatus, string> = {
  requested: 'Waiting for you',
  paid: 'Paid',
  declined: 'Declined',
  lapsed: 'Lapsed: not paid before the visit ended',
  withdrawn: 'Withdrawn by the caregiver',
  not_needed: 'Nothing to pay',
};
export const extraFeeStatusText = (f: Pick<ExtraFee, 'status' | 'payment'>) =>
  f.status === 'requested' && f.payment && (f.payment.status === 'pending' || f.payment.status === 'checking') ? 'Payment being checked' : STATUS_TEXT[f.status];

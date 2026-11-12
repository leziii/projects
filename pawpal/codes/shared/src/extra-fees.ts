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
}

/** When the service ends: the planned end, or later when entry was late (minutes after midnight, KL). */
export function serviceEndMin(v: { start: number; minutes: number; enteredAt: string | null }): number {
  const entered = v.enteredAt ? Number(v.enteredAt.slice(11, 13)) * 60 + Number(v.enteredAt.slice(14, 16)) : v.start;
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

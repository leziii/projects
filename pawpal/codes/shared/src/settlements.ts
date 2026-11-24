/**
 * E13-1 (round 53): whole-order settlement. An order pays its caregiver once every visit is final, nothing is open and
 * every refund has landed; one payout per order, never twice.
 */
import type { Fault } from './exceptions';
import { caregiverShare, formatRM, percentOf, type RuleSet, DEFAULT_RULES } from './rules';
import { dayText } from './schedule';
import type { TaskStatus } from './tasks';

export const SETTLEMENT_RULES = { everyMinutes: 10 } as const;

/** R53-1, R53-4: where an order's money for the caregiver is. pending / frozen are worked out, the rest are stored. */
export type SettlementState = 'pending' | 'frozen' | 'paying' | 'paid' | 'failed' | 'nothing';
export const SETTLEMENT_STATE_LABEL: Record<SettlementState, string> = {
  pending: 'Pending',
  frozen: 'Frozen (problem open)',
  paying: 'Paying',
  paid: 'Paid',
  failed: 'Payout failed',
  nothing: 'Nothing to pay',
};

export type SettlementLineKind = 'service' | 'cancel_kept' | 'no_handover' | 'decision' | 'caregiver_fault' | 'moved' | 'overtime' | 'waiting';

/** One line of what the caregiver earns on an order (E13-3 shows these). */
export interface SettlementLine {
  /** Visit index, from 0. */
  index: number;
  kind: SettlementLineKind;
  label: string;
  /** The money this line is about (full visit price, kept part, fee used). */
  grossSen: number;
  caregiverSen: number;
}

/** What settlement needs to know about one visit. */
export interface SettleVisit {
  /** Full visit price before promo and credit (R53-2: the platform pays any discount). */
  priceSen: number;
  status: TaskStatus;
  /** Refund % of a cancelled visit (0, 80, 100). */
  cancelPercent: number | null;
  decision: { fault: Fault; refundPercent: number } | null;
}

export interface SettleFee {
  index: number;
  kind: 'overtime' | 'waiting';
  /** What was used of the paid fee (the rest went back to the owner). */
  usedSen: number;
}

/** R53-1: these visit states are final. */
export const FINAL_VISIT: readonly TaskStatus[] = ['confirmed', 'cancelled', 'closed', 'moved'];

const keptOf = (price: number, refundPercent: number) => price - percentOf(price, refundPercent);

/** R53-2, R53-3: each line the caregiver is paid for, and the total. Every visit must be final. */
export function settleOrder(visits: SettleVisit[], fees: SettleFee[], r: RuleSet = DEFAULT_RULES): { lines: SettlementLine[]; grossSen: number; caregiverSen: number } {
  const lines: SettlementLine[] = [];
  visits.forEach((v, index) => {
    const n = `Visit ${index + 1}`;
    const add = (kind: SettlementLineKind, label: string, grossSen: number, caregiverSen: number) => lines.push({ index, kind, label, grossSen, caregiverSen });
    switch (v.status) {
      case 'confirmed':
        add('service', `${n} service`, v.priceSen, caregiverShare('service', v.priceSen, r));
        break;
      case 'cancelled': {
        const kept = keptOf(v.priceSen, v.cancelPercent ?? 100);
        add('cancel_kept', `${n} cancelled · kept part`, kept, caregiverShare('service', kept, r));
        break;
      }
      case 'closed': {
        const d = v.decision;
        const kept = keptOf(v.priceSen, d?.refundPercent ?? 100);
        if (d?.fault === 'owner') add('no_handover', `${n} no handover · 50/50`, kept, caregiverShare('no_handover', kept, r));
        else if (!d || d.fault === 'caregiver' || d.fault === 'no_substitute') add('caregiver_fault', `${n} closed · nothing to pay`, kept, 0);
        else add('decision', `${n} decided · kept part`, kept, caregiverShare('service', kept, r));
        break;
      }
      case 'moved':
        add('moved', `${n} moved to another caregiver`, 0, 0);
        break;
      default:
        throw new Error(`Visit ${index + 1} is not final`);
    }
  });
  for (const f of [...fees].sort((a, b) => a.index - b.index)) {
    if (f.usedSen <= 0) continue;
    const label = `Visit ${f.index + 1} ${f.kind === 'waiting' ? 'waiting fee' : 'overtime'}`;
    lines.push({ index: f.index, kind: f.kind, label, grossSen: f.usedSen, caregiverSen: caregiverShare(f.kind, f.usedSen, r) });
  }
  return { lines, grossSen: lines.reduce((s, l) => s + l.grossSen, 0), caregiverSen: lines.reduce((s, l) => s + l.caregiverSen, 0) };
}

/** R53-1: why an order cannot settle yet, or null when it can. A dispute or open problem freezes it. */
export function settleBlocker(input: { statuses: TaskStatus[]; openProblem: boolean; openFee: boolean; refundsDone: boolean }): { state: 'pending' | 'frozen'; reason: string } | null {
  if (input.openProblem || input.statuses.includes('disputed')) return { state: 'frozen', reason: 'A problem or dispute is still open' };
  const notFinal = input.statuses.findIndex((s) => !FINAL_VISIT.includes(s));
  if (notFinal >= 0) return { state: 'pending', reason: `Visit ${notFinal + 1} is not final yet` };
  if (input.openFee) return { state: 'pending', reason: 'An extra fee is still waiting for the owner' };
  if (!input.refundsDone) return { state: 'pending', reason: 'A refund has not landed yet' };
  return null;
}

/** Test tools result. */
export interface SettleResult {
  number: string;
  state: SettlementState;
  amountSen: number;
  lines: SettlementLine[];
  /** E5-7: the friend's first settled order gave both the invite credit. */
  rewarded: boolean;
}

/** R54-2, R55-3: what an order not settled yet is expected to pay; visits still on count as done. */
export function expectedSettlement(visits: SettleVisit[], fees: SettleFee[], r: RuleSet = DEFAULT_RULES): ReturnType<typeof settleOrder> {
  const asDone = visits.map((v) => (FINAL_VISIT.includes(v.status) ? v : { ...v, status: 'confirmed' as const }));
  return settleOrder(asDone, fees, r);
}
export const expectedIncome = (visits: SettleVisit[], fees: SettleFee[], r: RuleSet = DEFAULT_RULES): number => expectedSettlement(visits, fees, r).caregiverSen;

/** R55-3: "RM40 × 85% = RM34", "RM10 (100%)", "no income". */
export function lineMath(l: Pick<SettlementLine, 'kind' | 'grossSen' | 'caregiverSen'>, r: Pick<RuleSet, 'split'> = DEFAULT_RULES): string {
  if (l.caregiverSen === 0) return 'no income';
  if (l.kind === 'waiting') return `${formatRM(l.grossSen)} (${r.split.caregiverWaitingPercent}%)`;
  const pct = l.kind === 'no_handover' ? r.split.noHandoverCaregiverPercent : r.split.caregiverServicePercent;
  return `${formatRM(l.grossSen)} × ${pct}% = ${formatRM(l.caregiverSen)}`;
}

/** S16 one line, with the visit's problem still open marked (R55-3). */
export interface DetailLine extends SettlementLine {
  problemOpen: boolean;
}

/** S16 (round 55): one order's settlement as the caregiver sees it. */
export interface OrderSettlement {
  orderId: number;
  number: string;
  state: SettlementState;
  /** Why it is pending, e.g. "Visit 2 is not final yet". */
  reason: string | null;
  /** Settled amount, or expected before settlement. */
  amountSen: number;
  lines: DetailLine[];
  refunds: { key: string; reason: string; amountSen: number; done: boolean }[];
  problems: { index: number; by: 'caregiver' | 'owner'; kind: string; status: string }[];
  payout: { amountSen: number; state: 'paying' | 'paid' | 'failed'; at: string } | null;
  /** E14-3: the split of the order's rule version, for lineMath. */
  split: RuleSet['split'];
}

/** R55-2: the status line at the top of S16. `at` is the KL date the payout landed. */
export function settlementStatusText(s: Pick<OrderSettlement, 'state' | 'reason' | 'payout'>): string {
  switch (s.state) {
    case 'pending':
      return s.reason ? `Pending: ${s.reason}` : 'Pending';
    case 'frozen':
      return 'Frozen: a problem is open';
    case 'paid':
      return s.payout ? `Paid ${dayText(s.payout.at.slice(0, 10))}` : 'Paid';
    case 'failed':
      return 'Payout failed · we are fixing it';
    default:
      return SETTLEMENT_STATE_LABEL[s.state];
  }
}

export const PAYOUT_PENDING_NOTE = 'Paid as one payout once the order is settled.';

/** S15 tag of one order. A failed payout is shown as being fixed (R54-2). */
export const INCOME_TAG: Record<SettlementState, string> = {
  pending: 'Pending',
  frozen: 'Frozen',
  paying: 'Paying',
  paid: 'Paid',
  failed: 'Paying · we are fixing it',
  nothing: 'Nothing to pay',
};

/** S15: one recent order. */
export interface IncomeOrder {
  orderId: number;
  number: string;
  visits: number;
  /** Expected (pending, frozen) or settled amount. */
  amountSen: number;
  state: SettlementState;
}

/** S15 (round 54): four totals kept apart, and the latest orders. */
export interface CaregiverIncome {
  pendingSen: number;
  frozenSen: number;
  /** Includes failed payouts being fixed. */
  payingSen: number;
  paidMonthSen: number;
  /** Some payout failed and is being fixed (R54-2). */
  fixing: boolean;
  orders: IncomeOrder[];
}

export const INCOME_RULES = { recentOrders: 20 } as const;
export const INCOME_NOTE = 'Expected income is not a balance you can withdraw. Paying is not yet paid.';

/** "3 visits" */
export const visitCountText = (n: number) => `${n} visit${n === 1 ? '' : 's'}`;

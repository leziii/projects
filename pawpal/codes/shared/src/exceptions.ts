/**
 * E12-3 A09 / A10 (round 51): the admin's queue of visit problems raised before the report (caregiver reports and owner
 * cases), both sides' evidence, and a decision with fault, refund and a required reason. Substitutes come with E12-4.
 */
import type { ProblemContact } from './problems';
import { RuleError, formatRM } from './rules';
import type { SubstituteOffer, SubstituteStatus } from './substitutes';
import type { TaskStatus } from './tasks';

export const DECISION_RULES = { reasonMin: 5, reasonMax: 500 } as const;

/** R51-3; "no_substitute" is set by the system when the owner declines a substitute or does not answer (R52-5). */
export type Fault = 'owner' | 'caregiver' | 'none' | 'mismatch' | 'no_substitute';
/** What the admin can choose on A10. */
export const FAULTS: readonly Fault[] = ['owner', 'caregiver', 'none', 'mismatch'];
export const FAULT_LABEL: Record<Fault, string> = {
  owner: 'Owner at fault (no handover)',
  caregiver: 'Caregiver at fault',
  none: 'Nobody at fault',
  mismatch: "Pets don't match / can't do the service",
  no_substitute: 'No substitute',
};

/** R51-3: the refund filled in for each fault. */
export const defaultRefundPercent = (f: Fault): number => (f === 'owner' ? 0 : f === 'mismatch' ? 50 : 100);
/** R51-3: the admin may lower the default but not raise it; for a mismatch any percent. */
export const maxRefundPercent = (f: Fault): number => (f === 'mismatch' ? 100 : defaultRefundPercent(f));
/** Round to the nearest sen. */
export const decisionRefundSen = (paidSen: number, percent: number): number => Math.round((paidSen * percent) / 100);

export const isFault = (v: unknown): v is Fault => typeof v === 'string' && (FAULTS as readonly string[]).includes(v);

export interface DecisionInput {
  fault: Fault;
  refundPercent: number;
  reason: string;
}

/** R51-3: what still stops the decision being saved; '' when it can go. */
export function decisionProblem(input: { fault?: unknown; refundPercent?: unknown; reason?: unknown }): string {
  if (!isFault(input.fault)) return 'Choose who is at fault';
  const pct = input.refundPercent;
  if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 0) return 'Refund must be a whole percent';
  if (pct > maxRefundPercent(input.fault)) return `Refund can be at most ${maxRefundPercent(input.fault)}% for this decision`;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < DECISION_RULES.reasonMin) return 'Write the reason for this decision';
  if (reason.length > DECISION_RULES.reasonMax) return `Keep the reason under ${DECISION_RULES.reasonMax} characters`;
  return '';
}

/** Checks and cleans the decision. Throws RuleError DECISION_INVALID. */
export function checkDecision(input: { fault?: unknown; refundPercent?: unknown; reason?: unknown }): DecisionInput {
  const problem = decisionProblem(input);
  if (problem) throw new RuleError('DECISION_INVALID', problem);
  return { fault: input.fault as Fault, refundPercent: input.refundPercent as number, reason: (input.reason as string).trim() };
}

/** R51-5: the decision as both sides see it on O18 and S13. */
export function decisionText(d: { fault: Fault; refundSen: number; reason: string }): string {
  const money = d.refundSen ? `${formatRM(d.refundSen)} refunded to the owner` : 'no refund';
  const split = d.fault === 'owner' ? ' · visit fee split 50/50 with the caregiver' : '';
  return `${FAULT_LABEL[d.fault]} · ${money}${split}. Reason: ${d.reason}`;
}

/** A10: the admin's saved decision. */
export interface VisitDecision {
  fault: Fault;
  refundPercent: number;
  refundSen: number;
  /** Part of the refund that goes back as credit. */
  creditSen: number;
  reason: string;
  admin: string;
  at: string;
}

/** A09: one visit with a problem raised before its report. */
export interface AdminExceptionRow {
  orderId: number;
  number: string;
  index: number;
  date: string;
  start: number;
  /** Who raised it. */
  from: 'caregiver' | 'owner' | 'both';
  /** Labels of what was raised, caregiver first. */
  kinds: string[];
  status: 'open' | 'offered' | 'decided';
  fault: Fault | null;
  /** E12-4: the latest substitute offer on this visit. */
  substitute: SubstituteStatus | null;
  createdAt: string;
}

/** A10: both sides' evidence and the visit facts (R51-2). */
export interface ExceptionDetail {
  orderId: number;
  number: string;
  index: number;
  date: string;
  start: number;
  caregiver: string;
  paidSen: number;
  run: {
    status: TaskStatus;
    arrivedAt: string | null;
    enteredAt: string | null;
    waitingAt: string | null;
    reportedAt: string | null;
    /** "far" when a location check was over 500 m from home. */
    locationFlag: string | null;
  };
  caregiverReport: { id: number; kind: string; description: string; photos: number[]; contacts: ProblemContact[]; createdAt: string } | null;
  ownerCase: { id: number; kind: string; description: string; photos: number[]; notes: { body: string; at: string }[]; createdAt: string } | null;
  decision: VisitDecision | null;
  /** E12-4 (R52-2): every visit of the order, to choose the ones a substitute takes. */
  visits: { index: number; date: string; start: number; status: TaskStatus }[];
  /** E12-4: the latest substitute offer for this order, if any. */
  substitute: SubstituteOffer | null;
}

/**
 * E12-4 A10 / O20 (round 52): the admin offers a substitute caregiver for some visits; nobody changes until the owner
 * approves. Approve → the visits go on with the new caregiver; decline or no answer → those visits are refunded in full.
 */
import { visitTime } from './booking';
import { RuleError } from './rules';
import { dayText, timeText } from './schedule';
import type { TaskStatus } from './tasks';

export const SUBSTITUTE_RULES = { answerHours: 12, reasonMin: 5, reasonMax: 300 } as const;

export type SubstituteStatus = 'waiting' | 'approved' | 'declined' | 'expired';
export const SUBSTITUTE_STATUS_LABEL: Record<SubstituteStatus, string> = {
  waiting: 'Waiting for the owner',
  approved: 'Approved',
  declined: 'Declined · refunded',
  expired: 'No answer · refunded',
};

/** One visit in the offer: its time now and the time the substitute would come (same day). */
export interface SubstituteVisit {
  index: number;
  date: string;
  start: number;
  newStart: number;
}

/** A10 / O20 */
export interface SubstituteOffer {
  id: number;
  orderId: number;
  number: string;
  status: SubstituteStatus;
  caregiver: { id: number; displayName: string; initials: string; hasPhoto: boolean; idVerified: boolean; experienceYears: number };
  /** The caregiver being replaced. */
  from: string;
  /** What went wrong, e.g. "Can't get in". */
  problem: string;
  reason: string;
  visits: SubstituteVisit[];
  /** Answer by this KL time, or it counts as a decline (R52-5). */
  answerBy: string;
  createdAt: string;
  /** The new order once approved. */
  newOrder: { id: number; number: string } | null;
}

/** A10: one caregiver who could take the visits. */
export interface SubstituteCandidate {
  id: number;
  displayName: string;
  experienceYears: number;
  idVerified: boolean;
  areas: string[];
}

/** R52-2: only visits that have not started can move. */
export const canMove = (status: TaskStatus) => status === 'todo';

/** R52-5: 12 h from now, or the first affected visit's start, whichever is first. */
export function answerBy(now: Date, visits: Pick<SubstituteVisit, 'date' | 'newStart' | 'start'>[]): Date {
  const first = Math.min(...visits.map((v) => visitTime({ date: v.date, start: Math.min(v.start, v.newStart) }).getTime()));
  return new Date(Math.min(now.getTime() + SUBSTITUTE_RULES.answerHours * 3_600_000, first));
}

/** Checks the admin's offer. Throws RuleError SUBSTITUTE_INVALID. */
export function checkSubstitute(input: { caregiverId?: unknown; visits?: unknown; reason?: unknown }, allowedStarts: readonly number[]): {
  caregiverId: number;
  visits: { index: number; start: number }[];
  reason: string;
} {
  const bad = (m: string) => new RuleError('SUBSTITUTE_INVALID', m);
  if (!Number.isInteger(input.caregiverId)) throw bad('Choose a caregiver');
  const raw = Array.isArray(input.visits) ? (input.visits as { index?: unknown; start?: unknown }[]) : [];
  if (!raw.length) throw bad('Choose at least one visit');
  const visits = raw.map((v) => ({ index: v.index as number, start: v.start as number }));
  if (visits.some((v) => !Number.isInteger(v.index) || !allowedStarts.includes(v.start))) throw bad('Choose a start time for each visit');
  if (new Set(visits.map((v) => v.index)).size !== visits.length) throw bad('Each visit once');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < SUBSTITUTE_RULES.reasonMin) throw bad('Write the reason for the owner');
  if (reason.length > SUBSTITUTE_RULES.reasonMax) throw bad(`Keep the reason under ${SUBSTITUTE_RULES.reasonMax} characters`);
  return { caregiverId: input.caregiverId as number, visits: visits.sort((a, b) => a.index - b.index), reason };
}

/** O20: "Sat 21 Nov · 10:00 am → 11:00 am" or "Sat 21 Nov · 10:00 am (same time)". */
export function substituteVisitText(v: Pick<SubstituteVisit, 'date' | 'start' | 'newStart'>): string {
  const day = `${dayText(v.date)} · ${timeText(v.start)}`;
  return v.newStart === v.start ? `${day} (same time)` : `${day} → ${timeText(v.newStart)}`;
}

/** The decision both sides see on the problem when the owner approves (R52-4). */
export const substituteApprovedText = (name: string, count: number) =>
  `Substitute approved: ${name} takes ${count === 1 ? 'this visit' : `${count} visits`}. Price unchanged.`;

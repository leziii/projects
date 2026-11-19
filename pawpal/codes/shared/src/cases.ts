/**
 * E9-2 O17 / O18 (round 40): the owner confirms a visit's report, or raises a problem that becomes a case.
 * E12-2 (round 50): the owner can raise one from acceptance and follows a timeline; decisions come with E12-3 / E12-5.
 */
import { RuleError } from './rules';
import { dayText, timeText } from './schedule';
import type { TaskStatus } from './tasks';

export const CASE_RULES = { descriptionMax: 500, maxPhotos: 3, noteMax: 300, maxNotes: 20 } as const;

/** R40-3, R50-1 */
export type CaseKind = 'report' | 'late' | 'no_entry' | 'no_show' | 'other';
export const CASE_KINDS: readonly CaseKind[] = ['report', 'late', 'no_entry', 'no_show', 'other'];
export const CASE_KIND_LABEL: Record<CaseKind, string> = { report: 'Report problem', late: 'Late', no_entry: "Couldn't get in", no_show: "Caregiver didn't come", other: 'Other' };

/** R40-6, R50-2: Sent → Under review → Decided (decisions come with E12-3). */
export type CaseStatus = 'sent' | 'reviewing' | 'decided';
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = { sent: 'Sent', reviewing: 'Under review', decided: 'Decided' };

/**
 * R50-1: which types the owner can choose now; empty when no problem can be raised.
 * From acceptance until the report: Late, Couldn't get in, Caregiver didn't come, Other.
 * While the report waits: Report problem, Late, Couldn't get in, Other (as in E9-2).
 */
export function caseKindsFor(orderStatus: string, visit: TaskStatus): CaseKind[] {
  if (orderStatus !== 'accepted') return [];
  if (visit === 'report_sent') return ['report', 'late', 'no_entry', 'other'];
  if (visit === 'todo' || visit === 'arrived' || visit === 'in_service') return ['late', 'no_entry', 'no_show', 'other'];
  return [];
}

export interface CaseInput {
  kind: CaseKind;
  description: string;
}

export const isCaseKind = (v: unknown): v is CaseKind => typeof v === 'string' && (CASE_KINDS as readonly string[]).includes(v);

/** R40-3: what still stops the case being sent; '' when it can go. */
export function caseProblem(input: { kind?: unknown; description?: unknown }): string {
  if (!isCaseKind(input.kind)) return 'Choose what went wrong';
  const text = typeof input.description === 'string' ? input.description.trim() : '';
  if (!text) return 'Describe the problem';
  if (text.length > CASE_RULES.descriptionMax) return `Keep it under ${CASE_RULES.descriptionMax} characters`;
  return '';
}

/** Checks and cleans the case. Throws RuleError CASE_INVALID. */
export function checkCase(input: { kind?: unknown; description?: unknown }): CaseInput {
  const problem = caseProblem(input);
  if (problem) throw new RuleError('CASE_INVALID', problem);
  return { kind: input.kind as CaseKind, description: (input.description as string).trim() };
}

/** R50-4: a note the owner added while the case is open. */
export interface CaseNote {
  id: number;
  body: string;
  /** KL time */
  at: string;
}

/** O18: the owner's case on one visit. */
export interface VisitCase {
  id: number;
  orderId: number;
  number: string;
  index: number;
  kind: CaseKind;
  description: string;
  photos: number[];
  status: CaseStatus;
  createdAt: string;
  reviewingAt: string | null;
  /** R50-3: set when the admin decides (E12-3); null until then. */
  decidedAt: string | null;
  decision: string | null;
  notes: CaseNote[];
  /** R50-2: the caregiver's own report on the same visit, if any. */
  caregiverReport: { kind: string; at: string } | null;
}

/** R50-4: photos and notes can be added until the decision. */
export const caseOpen = (c: Pick<VisitCase, 'status'>) => c.status !== 'decided';

/** R50-2: the O18 timeline, oldest first; a step not reached yet has no time. */
export function caseTimeline(c: Pick<VisitCase, 'createdAt' | 'reviewingAt' | 'decidedAt'>): { key: CaseStatus; label: string; at: string | null }[] {
  return [
    { key: 'sent', label: 'Sent', at: c.createdAt },
    { key: 'reviewing', label: 'Under review', at: c.reviewingAt },
    { key: 'decided', label: 'Decided', at: c.decidedAt },
  ];
}

/** R50-4: a note's text, trimmed; throws RuleError NOTE_INVALID. */
export function checkCaseNote(body: unknown): string {
  const t = typeof body === 'string' ? body.trim() : '';
  if (!t) throw new RuleError('NOTE_INVALID', 'Write a note');
  if (t.length > CASE_RULES.noteMax) throw new RuleError('NOTE_INVALID', `Keep it under ${CASE_RULES.noteMax} characters`);
  return t;
}

/** Admin case list (R40-4). */
export interface AdminCaseRow {
  id: number;
  orderId: number;
  number: string;
  visit: number;
  kind: CaseKind;
  description: string;
  photos: number;
  status: CaseStatus;
  createdAt: string;
  /** R40-4: the whole order's payout is held while a case is open. */
  payoutHeld: boolean;
}

/** "9:51 am, Thu 5 Nov" from a KL time string. */
export const klAtText = (kl: string) => `${timeText(Number(kl.slice(11, 13)) * 60 + Number(kl.slice(14, 16)))}, ${dayText(kl.slice(0, 10))}`;

/** O17: "Confirmed 10:30 am, Thu 5 Nov by you" / "… automatically after 12 h" */
export function confirmedText(confirmedAt: string, by: 'owner' | 'auto', viewer: 'owner' | 'caregiver'): string {
  const who = by === 'auto' ? 'automatically after 12 h' : viewer === 'owner' ? 'by you' : 'by the owner';
  return `Confirmed ${klAtText(confirmedAt)} ${who}`;
}

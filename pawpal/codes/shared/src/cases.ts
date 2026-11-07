/**
 * E9-2 O17 / O18 (round 40): the owner confirms a visit's report, or raises a problem that becomes a case.
 * Admin handling and decisions come with E12-5.
 */
import { RuleError } from './rules';
import { dayText, timeText } from './schedule';

export const CASE_RULES = { descriptionMax: 500, maxPhotos: 3 } as const;

/** R40-3 */
export type CaseKind = 'report' | 'late' | 'no_entry' | 'other';
export const CASE_KINDS: readonly CaseKind[] = ['report', 'late', 'no_entry', 'other'];
export const CASE_KIND_LABEL: Record<CaseKind, string> = { report: 'Report problem', late: 'Late', no_entry: "Couldn't get in", other: 'Other' };

/** R40-6: "Sent", then "Under review" once admin starts on it; decisions come with E12. */
export type CaseStatus = 'sent' | 'reviewing';
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = { sent: 'Sent', reviewing: 'Under review' };

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

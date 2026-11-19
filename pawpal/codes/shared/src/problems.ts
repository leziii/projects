/**
 * E12-1 S13 (round 49): the caregiver reports a problem on a visit, with photos and a log of tries to reach the owner.
 * The caregiver never sets fault or takes money; the admin decides (E12-3).
 */
import { RuleError } from './rules';
import type { TaskStatus } from './tasks';

export const PROBLEM_RULES = { descriptionMax: 500, maxPhotos: 6, noteMax: 100, maxContacts: 20 } as const;

/** R49-2 */
export type ProblemKind = 'late' | 'no_entry' | 'pets_mismatch' | 'cannot_serve' | 'dispute_evidence';
export const PROBLEM_KINDS: readonly ProblemKind[] = ['late', 'no_entry', 'pets_mismatch', 'cannot_serve', 'dispute_evidence'];
export const PROBLEM_KIND_LABEL: Record<ProblemKind, string> = {
  late: 'Late',
  no_entry: "Can't get in",
  pets_mismatch: "Pets don't match booking",
  cannot_serve: "Can't do the service",
  dispute_evidence: 'Evidence for a dispute',
};

/** R49-3 */
export type ContactMethod = 'called' | 'messaged' | 'knocked';
export const CONTACT_METHODS: readonly ContactMethod[] = ['called', 'messaged', 'knocked'];
export const CONTACT_METHOD_LABEL: Record<ContactMethod, string> = { called: 'Called', messaged: 'Messaged', knocked: 'Knocked' };

/** R49-4: Sent → Under review → Decided (decisions come with E12-3). */
export type ProblemStatus = 'sent' | 'reviewing' | 'decided';
export const PROBLEM_STATUS_LABEL: Record<ProblemStatus, string> = { sent: 'Sent', reviewing: 'Under review', decided: 'Decided' };

export interface ProblemContact {
  id: number;
  method: ContactMethod;
  note: string;
  /** KL time "YYYY-MM-DD HH:MM:SS". */
  at: string;
}

/** S13: the caregiver's report on one visit. */
export interface ProblemReport {
  id: number;
  orderId: number;
  number: string;
  index: number;
  kind: ProblemKind;
  description: string;
  photos: number[];
  contacts: ProblemContact[];
  status: ProblemStatus;
  /** E12-3: the admin's decision; null until then. */
  decision: string | null;
  createdAt: string;
}

/** Admin Cases page: caregiver reports. */
export interface AdminProblemRow {
  id: number;
  orderId: number;
  number: string;
  visit: number;
  caregiver: string;
  kind: ProblemKind;
  description: string;
  photos: number;
  contacts: number;
  status: ProblemStatus;
  createdAt: string;
}

/** R49-1, R49-2: which types fit the visit now; empty when the caregiver cannot report. */
export function problemKindsFor(status: TaskStatus): ProblemKind[] {
  if (status === 'disputed') return ['dispute_evidence'];
  if (status === 'todo' || status === 'arrived' || status === 'in_service') return PROBLEM_KINDS.filter((k) => k !== 'dispute_evidence');
  return [];
}

export const isProblemKind = (v: unknown): v is ProblemKind => typeof v === 'string' && (PROBLEM_KINDS as readonly string[]).includes(v);
export const isContactMethod = (v: unknown): v is ContactMethod => typeof v === 'string' && (CONTACT_METHODS as readonly string[]).includes(v);

/** R49-2: what still stops the report going; '' when it can go. */
export function problemProblem(input: { kind?: unknown; description?: unknown }, status: TaskStatus): string {
  const kinds = problemKindsFor(status);
  if (!kinds.length) return 'Problems can be reported from acceptance until the report is sent';
  if (!isProblemKind(input.kind) || !kinds.includes(input.kind)) return 'Choose what went wrong';
  const text = typeof input.description === 'string' ? input.description.trim() : '';
  if (!text) return 'Describe the problem';
  if (text.length > PROBLEM_RULES.descriptionMax) return `Keep it under ${PROBLEM_RULES.descriptionMax} characters`;
  return '';
}

/** R49-3: checks one contact try. Throws RuleError CONTACT_INVALID. */
export function checkContact(input: { method?: unknown; note?: unknown }): { method: ContactMethod; note: string } {
  if (!isContactMethod(input.method)) throw new RuleError('CONTACT_INVALID', 'Choose how you tried to reach the owner');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > PROBLEM_RULES.noteMax) throw new RuleError('CONTACT_INVALID', `Keep the note under ${PROBLEM_RULES.noteMax} characters`);
  return { method: input.method, note };
}

/** "18:02 · Called · no answer" style line: "6:02 pm · Called owner, no answer". */
export function contactText(c: Pick<ProblemContact, 'method' | 'note' | 'at'>, timeOf: (kl: string) => string): string {
  return `${timeOf(c.at)} · ${CONTACT_METHOD_LABEL[c.method]}${c.note ? `: ${c.note}` : ''}`;
}

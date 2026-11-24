/**
 * E14-3 A15 (round 59): rules change only as a new version from a later date.
 * An order keeps the version it was paid under (R59-4); capacity, accept windows and booking hours stay in code (R59-2).
 */
import { DEFAULT_RULES, RuleError, formatRM, type RuleSet } from './rules';

export type RuleGroup = 'price' | 'minMinutes' | 'waiting' | 'cancel' | 'split';
export type RuleUnit = 'sen' | 'min' | 'h' | '%';

export interface RuleField {
  /** "price.cat" */
  key: string;
  group: RuleGroup;
  label: string;
  unit: RuleUnit;
  min: number;
  max: number;
}

export const RULE_GROUP_LABEL: Record<RuleGroup, string> = {
  price: 'Prices',
  minMinutes: 'Minimum times',
  waiting: 'Waiting fee',
  cancel: 'Cancel refunds',
  split: 'Caregiver split',
};

const f = (group: RuleGroup, name: string, label: string, unit: RuleUnit, min: number, max: number): RuleField => ({ key: `${group}.${name}`, group, label, unit, min, max });

/** R59-1: the only values an admin can change. */
export const RULE_FIELDS: RuleField[] = [
  f('price', 'cat', 'Cat', 'sen', 100, 100_000),
  f('price', 'dogBasic', 'Dog basic', 'sen', 100, 100_000),
  f('price', 'dogUpgrade', 'Dog upgrade', 'sen', 100, 100_000),
  f('price', 'mixedPerCat', 'Mixed: per cat', 'sen', 0, 100_000),
  f('price', 'extraPet', 'Extra pet', 'sen', 0, 100_000),
  f('price', 'overtimePer15', 'Overtime per 15 min', 'sen', 0, 100_000),
  f('minMinutes', 'cat', 'Cat', 'min', 10, 240),
  f('minMinutes', 'dogBasic', 'Dog basic', 'min', 10, 240),
  f('minMinutes', 'dogUpgrade', 'Dog upgrade', 'min', 10, 240),
  f('minMinutes', 'mixedBasic', 'Mixed basic', 'min', 10, 240),
  f('minMinutes', 'mixedUpgrade', 'Mixed upgrade', 'min', 10, 240),
  f('waiting', 'freeMinutes', 'Free minutes', 'min', 0, 60),
  f('waiting', 'blockMinutes', 'Charged per', 'min', 1, 60),
  f('waiting', 'feePerBlock', 'Fee per block', 'sen', 0, 10_000),
  f('waiting', 'maxMinutes', 'Longest wait', 'min', 10, 120),
  f('cancel', 'fullRefundHours', 'Full refund from', 'h', 1, 168),
  f('cancel', 'partialRefundHours', 'Part refund from', 'h', 0, 167),
  f('cancel', 'partialRefundPercent', 'Part refund', '%', 0, 100),
  f('split', 'caregiverServicePercent', 'Service and overtime to caregiver', '%', 0, 100),
  f('split', 'caregiverWaitingPercent', 'Waiting fee to caregiver', '%', 0, 100),
  f('split', 'noHandoverCaregiverPercent', 'No handover to caregiver', '%', 0, 100),
];

export const RULE_VERSION_RULES = { reasonMin: 5, reasonMax: 255, maxDaysAhead: 90 } as const;

/** "price.cat" → 4000 */
export type RuleValues = Record<string, number>;

const read = (r: RuleSet, key: string): number => {
  const [g, n] = key.split('.');
  return (r as unknown as Record<string, Record<string, number>>)[g][n];
};

export function ruleValues(r: RuleSet): RuleValues {
  return Object.fromEntries(RULE_FIELDS.map((x) => [x.key, read(r, x.key)]));
}

/** The base with the editable values replaced; everything else stays as in code (R59-2). */
export function withValues(values: RuleValues, version: string, base: RuleSet = DEFAULT_RULES): RuleSet {
  const out = JSON.parse(JSON.stringify(base)) as RuleSet;
  out.version = version;
  for (const x of RULE_FIELDS) {
    if (values[x.key] === undefined) continue;
    const [g, n] = x.key.split('.');
    (out as unknown as Record<string, Record<string, number>>)[g][n] = values[x.key];
  }
  return out;
}

/** "RM40", "30 min", "24 h", "85%". */
export function ruleValueText(unit: RuleUnit, n: number): string {
  if (unit === 'sen') return formatRM(n);
  if (unit === 'min') return `${n} min`;
  if (unit === 'h') return `${n} h`;
  return `${n}%`;
}

export interface RuleChange {
  key: string;
  label: string;
  from: string;
  to: string;
}

const fullLabel = (x: RuleField) => `${RULE_GROUP_LABEL[x.group]} · ${x.label}`;

/** R59-6: what changes from one version to the next, "Prices · Cat: RM40 → RM45". */
export function ruleDiff(a: RuleSet, b: RuleSet): RuleChange[] {
  return RULE_FIELDS.filter((x) => read(a, x.key) !== read(b, x.key)).map((x) => ({
    key: x.key,
    label: fullLabel(x),
    from: ruleValueText(x.unit, read(a, x.key)),
    to: ruleValueText(x.unit, read(b, x.key)),
  }));
}

export const ruleChangeText = (c: RuleChange) => `${c.label}: ${c.from} → ${c.to}`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

export interface RuleEdit {
  values: RuleValues;
  effectiveFrom: string;
  reason: string;
}

/** R59-3, R59-6: a new version's values, start date and reason, checked against the version now in effect. */
export function checkRuleEdit(input: Record<string, unknown>, current: RuleSet, today: string): RuleEdit {
  const raw = (input.values ?? {}) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new RuleError('BAD_VALUES', 'values must be an object');
  const unknownKey = Object.keys(raw).find((k) => !RULE_FIELDS.some((x) => x.key === k));
  if (unknownKey) throw new RuleError('FIXED_RULE', `${unknownKey} cannot be changed here`);
  const values = ruleValues(current);
  for (const x of RULE_FIELDS) {
    if (raw[x.key] === undefined) continue;
    const n = raw[x.key];
    if (typeof n !== 'number' || !Number.isInteger(n)) throw new RuleError('BAD_VALUE', `${fullLabel(x)} must be a whole number`);
    if (n < x.min || n > x.max) throw new RuleError('BAD_VALUE', `${fullLabel(x)} must be between ${ruleValueText(x.unit, x.min)} and ${ruleValueText(x.unit, x.max)}`);
    values[x.key] = n;
  }
  const v = (k: string) => values[k];
  if (v('price.dogUpgrade') < v('price.dogBasic')) throw new RuleError('BAD_ORDER', 'Dog upgrade cannot cost less than dog basic');
  if (v('minMinutes.dogUpgrade') < v('minMinutes.dogBasic')) throw new RuleError('BAD_ORDER', 'Dog upgrade cannot be shorter than dog basic');
  if (v('minMinutes.mixedUpgrade') < v('minMinutes.mixedBasic')) throw new RuleError('BAD_ORDER', 'Mixed upgrade cannot be shorter than mixed basic');
  if (v('cancel.partialRefundHours') >= v('cancel.fullRefundHours')) throw new RuleError('BAD_ORDER', 'Part refund must start later than full refund');
  if (v('waiting.freeMinutes') >= v('waiting.maxMinutes')) throw new RuleError('BAD_ORDER', 'Free minutes must be less than the longest wait');
  if (!ruleDiff(current, withValues(values, current.version, current)).length) throw new RuleError('NO_CHANGE', 'Change at least one value');

  const effectiveFrom = typeof input.effectiveFrom === 'string' ? input.effectiveFrom.trim() : '';
  if (!DATE.test(effectiveFrom) || Number.isNaN(dayNo(effectiveFrom))) throw new RuleError('BAD_DATE', 'Start date must be YYYY-MM-DD');
  const ahead = dayNo(effectiveFrom) - dayNo(today);
  if (ahead < 1) throw new RuleError('TOO_SOON', 'A new version can start tomorrow at the earliest');
  if (ahead > RULE_VERSION_RULES.maxDaysAhead) throw new RuleError('TOO_FAR', `A new version can start at most ${RULE_VERSION_RULES.maxDaysAhead} days ahead`);

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < RULE_VERSION_RULES.reasonMin) throw new RuleError('REASON_REQUIRED', `Write a reason (at least ${RULE_VERSION_RULES.reasonMin} characters)`);
  if (reason.length > RULE_VERSION_RULES.reasonMax) throw new RuleError('REASON_TOO_LONG', `Reason must be at most ${RULE_VERSION_RULES.reasonMax} characters`);
  return { values, effectiveFrom, reason };
}

/** in_effect = used for new orders now · waiting = starts later · past = replaced by a later start · withdrawn = never used. */
export type RuleVersionState = 'in_effect' | 'waiting' | 'past' | 'withdrawn';
export const RULE_VERSION_STATE_LABEL: Record<RuleVersionState, string> = { in_effect: 'In effect', waiting: 'Starts later', past: 'Past', withdrawn: 'Withdrawn' };

export interface RuleVersionRow {
  version: string;
  effectiveFrom: string;
  withdrawn: boolean;
}

/** R59-3, R59-5: each version's state on a KL day. Of versions with the same start, the newest wins. */
export function ruleVersionStates<T extends RuleVersionRow>(rows: T[], today: string): Map<string, RuleVersionState> {
  const live = rows.filter((r) => !r.withdrawn);
  const started = live.filter((r) => r.effectiveFrom <= today);
  const current = started[started.length - 1];
  const out = new Map<string, RuleVersionState>();
  for (const r of rows) out.set(r.version, r.withdrawn ? 'withdrawn' : r === current ? 'in_effect' : r.effectiveFrom > today ? 'waiting' : 'past');
  return out;
}

/** One line of the A15 history. */
export interface RuleVersion {
  version: string;
  effectiveFrom: string;
  state: RuleVersionState;
  reason: string;
  admin: string;
  createdAt: string;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  /** What it changed from the version before it. */
  changes: RuleChange[];
  rules: RuleSet;
}

/** A15. */
export interface RulesAdmin {
  current: RuleVersion;
  /** R59-5: at most one. */
  waiting: RuleVersion | null;
  /** Newest first. */
  history: RuleVersion[];
}

export const RULES_NOTE = 'A change makes a new version from a later date. Orders already paid keep the rules they were paid under.';

/** The date picker's first choice: tomorrow in KL. */
export const tomorrowOf = (today: string) => new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

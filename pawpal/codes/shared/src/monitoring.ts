import { MONEY_RULES } from './money';
import { RuleError, formatRM } from './rules';

/** E15-3 (round 61): error tracking, money alerts and the booking funnel. */
export const MONITOR_RULES = {
  /** R61-3: a payment, refund or payout still processing this long is alerted. */
  processingAlertMinutes: MONEY_RULES.checkAfterMinutes,
  /** R61-3: the same item is alerted at most once in this many minutes. */
  alertGapMinutes: 60,
  /** How often the server looks for money to alert. */
  workerEverySeconds: 60,
  /** R61-4: the Funnel page shows these periods. */
  funnelDays: [7, 30] as const,
  /** A visitor id sent by the app: letters, digits and dashes. */
  visitorMax: 64,
} as const;

// ---------- R61-1: never send personal data to Sentry ----------

const REMOVED = '[removed]';
/** Field names whose values are never sent, whatever they hold. */
const PRIVATE_KEY = /phone|whatsapp|address|street|postcode|unit|ic_?number|^ic$|nric|mykad|lat$|lng$|latitude|longitude|password|token|cookie|authorization/i;
/** Malaysian IC numbers (900101-14-5678 or 900101145678). */
const IC = /\b\d{6}-?\d{2}-?\d{4}\b/g;
/** Malaysian and international phone numbers (+60 12-345 6789, 0123456789). */
const PHONE = /(?<!\w)(?:\+?60|0)[\s-]?1\d(?:[\s-]?\d){7,8}\b|(?<!\w)\+\d(?:[\s-]?\d){8,14}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g;

/** Takes IC numbers, phone numbers and email addresses out of a text. */
export function scrubText(s: string): string {
  return s.replace(IC, REMOVED).replace(EMAIL, REMOVED).replace(PHONE, REMOVED);
}

/** A copy of an error report with private fields and numbers taken out (R61-1). Used by every Sentry beforeSend. */
export function scrubEvent<T>(event: T): T {
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return scrubText(v);
    if (!v || typeof v !== 'object' || depth > 12) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = PRIVATE_KEY.test(k) ? REMOVED : walk(x, depth + 1);
    return out;
  };
  return walk(event, 0) as T;
}

/** What "Send a test error" reports back (R61-5). */
export interface TestErrorResult {
  /** True when SENTRY_DSN is set and the error was sent. */
  sentry: boolean;
  eventId: string | null;
  message: string;
}

export const TEST_ERROR_MESSAGE = 'PawPal test error (Test tools)';

export const sentryOffText = (sentry: boolean) =>
  sentry ? 'Sent to Sentry.' : 'Sentry is off (no SENTRY_DSN), so the error was only written to the server log.';

// ---------- R61-3: money alerts ----------

export type MoneyAlertKind = 'payment' | 'refund' | 'fee_refund' | 'payout';
export const MONEY_ALERT_KIND_LABEL: Record<MoneyAlertKind, string> = { payment: 'Payment', refund: 'Refund', fee_refund: 'Fee refund', payout: 'Payout' };

/** One payment, refund or payout that needs support. `key` names the item; `tries` tells a new failure from the same one. */
export interface MoneyAlertItem {
  key: string;
  kind: MoneyAlertKind;
  state: 'failed' | 'processing';
  /** Order number, e.g. P20261124012, or the payment reference. */
  number: string;
  what: string;
  amountSen: number;
  reason: string | null;
  tries: number;
  /** Minutes since the last try changed. */
  minutes: number;
}

export interface SentAlert {
  key: string;
  /** `state:tries`, so one failure is alerted once. */
  occurrence: string;
  at: Date;
}

export const alertOccurrence = (i: Pick<MoneyAlertItem, 'state' | 'tries'>) => `${i.state}:${i.tries}`;

/** Needs an alert: failed, or processing for 30 minutes or more. */
export const needsMoneyAlert = (i: Pick<MoneyAlertItem, 'state' | 'minutes'>) => i.state === 'failed' || i.minutes >= MONITOR_RULES.processingAlertMinutes;

/**
 * R61-3: the items to alert now. Each failure is alerted once, and the same item at most once an hour
 * (a failure inside the hour waits and is sent when the hour has passed, if it is still open).
 */
export function dueMoneyAlerts(items: MoneyAlertItem[], sent: SentAlert[], now: Date): MoneyAlertItem[] {
  const gapMs = MONITOR_RULES.alertGapMinutes * 60_000;
  return items.filter((i) => {
    if (!needsMoneyAlert(i)) return false;
    const mine = sent.filter((s) => s.key === i.key);
    if (mine.some((s) => s.occurrence === alertOccurrence(i))) return false;
    return !mine.some((s) => now.getTime() - s.at.getTime() < gapMs);
  });
}

/** The WhatsApp text to support. No phone numbers or addresses, only what is needed to find the item. */
export function moneyAlertText(i: MoneyAlertItem): string {
  const what = `${MONEY_ALERT_KIND_LABEL[i.kind]} ${formatRM(i.amountSen)} · ${i.what} · ${i.number}`;
  const state = i.state === 'failed' ? `failed${i.reason ? `: ${scrubText(i.reason)}` : ''}` : `still processing after ${i.minutes} min`;
  return `PawPal money alert: ${what} ${state}. Open Money in admin to fix it.`;
}

/** What "Send a test money alert" reports back (R61-5). */
export interface TestAlertResult {
  sentTo: string | null;
  text: string;
}

export const TEST_ALERT_ITEM: MoneyAlertItem = {
  key: 'test',
  kind: 'payout',
  state: 'failed',
  number: 'TEST',
  what: 'Test alert from Test tools',
  amountSen: 100,
  reason: 'This is only a test',
  tries: 1,
  minutes: 0,
};

// ---------- R61-4: booking funnel ----------

export const FUNNEL_STEPS = ['home', 'setup', 'caregiver', 'pay', 'paid'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export const FUNNEL_STEP_LABEL: Record<FunnelStep, string> = {
  home: 'Opened home',
  setup: 'Started a booking',
  caregiver: 'Chose a caregiver',
  pay: 'Reached the pay page',
  paid: 'Paid',
};
/** Steps the app reports; "paid" is counted by the server from paid orders. */
export const APP_FUNNEL_STEPS = FUNNEL_STEPS.filter((s) => s !== 'paid');

export function checkFunnelEvent(input: { step?: unknown; visitor?: unknown }): { step: FunnelStep; visitor: string } {
  const step = input?.step;
  if (typeof step !== 'string' || !(APP_FUNNEL_STEPS as readonly string[]).includes(step)) {
    throw new RuleError('BAD_STEP', `step must be one of ${APP_FUNNEL_STEPS.join(', ')}`);
  }
  const visitor = input?.visitor;
  if (typeof visitor !== 'string' || !new RegExp(`^[A-Za-z0-9-]{8,${MONITOR_RULES.visitorMax}}$`).test(visitor)) {
    throw new RuleError('BAD_VISITOR', 'visitor must be 8 to 64 letters, digits or dashes');
  }
  return { step: step as FunnelStep, visitor };
}

export function checkFunnelDays(v: unknown): 7 | 30 {
  const n = Number(v ?? 7);
  if (!(MONITOR_RULES.funnelDays as readonly number[]).includes(n)) throw new RuleError('BAD_DAYS', 'days must be 7 or 30');
  return n as 7 | 30;
}

export interface FunnelStepCount {
  step: FunnelStep;
  label: string;
  count: number;
  /** Percent of the step before, null for the first step or when the step before is 0. */
  ofPrevious: number | null;
}

export interface FunnelDay {
  day: string;
  counts: Record<FunnelStep, number>;
}

export interface FunnelReport {
  days: 7 | 30;
  from: string;
  to: string;
  steps: FunnelStepCount[];
  byDay: FunnelDay[];
}

/** Null when the step before had nobody, or fewer people (orders made before counting started, or without the app). */
const sharePercent = (n: number, of: number): number | null => (of > 0 && n <= of ? Math.round((n / of) * 100) : null);

/** Totals per step, each with its share of the step before. */
export function funnelSteps(byDay: FunnelDay[]): FunnelStepCount[] {
  return FUNNEL_STEPS.map((step, i) => {
    const count = byDay.reduce((n, d) => n + d.counts[step], 0);
    const prev = i ? byDay.reduce((n, d) => n + d.counts[FUNNEL_STEPS[i - 1]], 0) : 0;
    return { step, label: FUNNEL_STEP_LABEL[step], count, ofPrevious: i ? sharePercent(count, prev) : null };
  });
}

/** Every day from `from` to `to` (YYYY-MM-DD), with 0 where nothing was counted. */
export function funnelDays(from: string, to: string, rows: { day: string; step: FunnelStep; n: number }[]): FunnelDay[] {
  const out: FunnelDay[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 864e5)) {
    const day = d.toISOString().slice(0, 10);
    const counts = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0])) as Record<FunnelStep, number>;
    for (const r of rows) if (r.day === day) counts[r.step] += r.n;
    out.push({ day, counts });
  }
  return out;
}

export const FUNNEL_NOTE = 'People counted once per step per day. Paid counts orders paid that day. Caregivers opening home are counted too. – means the step before has nobody or fewer people (for example orders paid before counting started).';

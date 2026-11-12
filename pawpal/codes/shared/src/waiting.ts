/**
 * E11-1 S10, S14 (round 45): the caregiver asks to wait when the owner is not ready.
 * Waiting runs from the later of the booked start and the arrival until entry; it is never service time.
 */
import { visitTime } from './booking';
import { formatRM } from './rules';
import { klInstant } from './requests';
import { timeText } from './schedule';

/** R45-3, R45-4 */
export const WAITING_RULES = { freeMin: 10, stepMin: 10, stepSen: 500, maxMin: 60, maxSen: 2500 } as const;

/** R45-3: first 10 min free, then RM5 per started 10 min, at most RM25 (11 min → RM5, 75 min → RM25). */
export function waitingFeeSen(minutes: number): number {
  const r = WAITING_RULES;
  if (minutes <= r.freeMin) return 0;
  return Math.min(Math.ceil((minutes - r.freeMin) / r.stepMin) * r.stepSen, r.maxSen);
}

/** R45-2: the clock starts at the later of the booked start and the arrival, so a late caregiver never costs the owner. */
export function waitingStart(v: { date: string; start: number }, arrivedAt: string): Date {
  return new Date(Math.max(visitTime(v).getTime(), klInstant(arrivedAt).getTime()));
}

export interface WaitingState {
  /** Before the booked start: waiting has not begun. */
  started: boolean;
  /** Whole minutes so far, at most 60. */
  minutes: number;
  feeSen: number;
  limitReached: boolean;
  /** Entry confirmed: the clock has stopped. */
  stopped: boolean;
  /** When the clock starts or started. */
  startAt: Date;
}

/** R45-2, R45-3: where the waiting stands now (or when entry stopped it). */
export function waitingState(v: { date: string; start: number; arrivedAt: string | null; enteredAt: string | null }, now: Date): WaitingState {
  const startAt = waitingStart(v, v.arrivedAt ?? `${v.date} 00:00:00`);
  const end = v.enteredAt ? klInstant(v.enteredAt) : now;
  const raw = Math.max(0, Math.floor((end.getTime() - startAt.getTime()) / 60_000));
  const minutes = Math.min(raw, WAITING_RULES.maxMin);
  return { started: end.getTime() >= startAt.getTime(), minutes, feeSen: waitingFeeSen(minutes), limitReached: raw >= WAITING_RULES.maxMin, stopped: !!v.enteredAt, startAt };
}

const klClock = (d: Date) => {
  const kl = new Date(d.getTime() + 8 * 3600_000);
  return timeText(kl.getUTCHours() * 60 + kl.getUTCMinutes());
};

/** S14 headline: "Waiting 14 min · RM5 so far", "Waiting limit reached · 60 min · RM25", "Waited 14 min · RM5". */
export function waitingText(s: WaitingState): string {
  const fee = s.feeSen ? formatRM(s.feeSen) : 'free';
  if (s.stopped) return `Waited ${s.minutes} min · ${fee}`;
  if (!s.started) return `Waiting starts at ${klClock(s.startAt)}, the booked start`;
  if (s.limitReached) return `Waiting limit reached · ${WAITING_RULES.maxMin} min · ${formatRM(WAITING_RULES.maxSen)}`;
  return s.feeSen ? `Waiting ${s.minutes} min · ${fee} so far` : `Waiting ${s.minutes} min · free for the first ${WAITING_RULES.freeMin} min`;
}

/** The rule in one line, for S14 and the owner's message. */
export const WAITING_RULE_TEXT = `First ${WAITING_RULES.freeMin} min free, then ${formatRM(WAITING_RULES.stepSen)} per started ${WAITING_RULES.stepMin} min, up to ${WAITING_RULES.maxMin} min / ${formatRM(WAITING_RULES.maxSen)}.`;

/** R45-1: after arriving, before entry, once per visit. */
export const canRequestWaiting = (t: { status: string; waitingAt: string | null }) => t.status === 'arrived' && !t.waitingAt;

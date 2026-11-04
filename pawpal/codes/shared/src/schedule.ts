/**
 * Caregiver schedule (E4-5, S05). Settled with KF in round 16:
 * free 7 am–10 pm every day unless the caregiver adds a "Not available" block (one-off or weekly);
 * a travel buffer is kept free around every booked visit; booked visits cannot be covered or removed.
 * Dates are Kuala Lumpur dates ("YYYY-MM-DD"); times are minutes after midnight.
 */
import { DEFAULT_RULES, RuleError } from './rules';

export const BUFFER_CHOICES = [15, 30, 45, 60] as const;
/** Overtime is sold per 15 minutes, so the limit moves in the same steps. */
export const OVERTIME_CHOICES = [0, 15, 30, 45, 60] as const;
export const SCHEDULE_DEFAULTS = { travelBufferMin: 30, overtimeMaxMin: 30 } as const;

export const DAY_START = DEFAULT_RULES.booking.firstHour * 60;
export const DAY_END = DEFAULT_RULES.booking.lastHour * 60;
/** Block times move in half hours. */
export const BLOCK_STEP = 30;
export const SCHEDULE_DAYS = DEFAULT_RULES.booking.maxDaysAhead;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface ScheduleSettings {
  travelBufferMin: number;
  overtimeMaxMin: number;
}

export type BlockKind = 'once' | 'weekly';

export interface BlockInput {
  kind?: BlockKind;
  /** One-off: "YYYY-MM-DD". */
  date?: string | null;
  /** Weekly: 0 = Sunday … 6 = Saturday. */
  weekday?: number | null;
  start?: number;
  end?: number;
}

export interface Block {
  id: number;
  kind: BlockKind;
  date: string | null;
  weekday: number | null;
  start: number;
  end: number;
}

/** A booked visit (orders from E6; test visits until then). `minutes` includes any booked overtime. */
export interface BookedVisit {
  id: number;
  date: string;
  start: number;
  minutes: number;
  label: string;
}

export interface Schedule {
  today: string;
  settings: ScheduleSettings;
  blocks: Block[];
  visits: BookedVisit[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Today's date in Kuala Lumpur. */
export const klDate = (now: Date) => new Date(now.getTime() + KL_OFFSET_MS).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** 570 → "9:30 am" */
export function timeText(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = String(min % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** "2026-10-30" → "Fri 30 Oct" */
export function dayText(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${month}`;
}

export function checkSettings(input: Partial<ScheduleSettings>): ScheduleSettings {
  const travelBufferMin = Number(input.travelBufferMin);
  const overtimeMaxMin = Number(input.overtimeMaxMin);
  if (!(BUFFER_CHOICES as readonly number[]).includes(travelBufferMin)) throw new RuleError('BUFFER_CHOICE', `Travel buffer: ${BUFFER_CHOICES.join(', ')} minutes`);
  if (!(OVERTIME_CHOICES as readonly number[]).includes(overtimeMaxMin)) throw new RuleError('OVERTIME_CHOICE', `Overtime limit: ${OVERTIME_CHOICES.join(', ')} minutes`);
  return { travelBufferMin, overtimeMaxMin };
}

/** The time a visit takes up, with the travel buffer before and after. */
const busy = (v: BookedVisit, buffer: number) => ({ start: v.start - buffer, end: v.start + v.minutes + buffer });
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Does a block apply on this date? */
export const blockOn = (b: Pick<Block, 'kind' | 'date' | 'weekday'>, date: string) => (b.kind === 'once' ? b.date === date : b.weekday === weekdayOf(date));

/**
 * A new "Not available" block (R16-1/R16-4): half-hour steps within service hours, one-off dates from today
 * to 60 days ahead, and never over a booked visit or its buffer from today on.
 */
export function checkBlock(input: BlockInput, visits: BookedVisit[], buffer: number, today: string): Omit<Block, 'id'> {
  const start = Number(input.start);
  const end = Number(input.end);
  if (![start, end].every((t) => Number.isInteger(t) && t % BLOCK_STEP === 0 && t >= DAY_START && t <= DAY_END) || start >= end) {
    throw new RuleError('BLOCK_TIME', 'Choose a start and end between 7:00 am and 10:00 pm');
  }
  let block: Omit<Block, 'id'>;
  if (input.kind === 'once') {
    if (!isDate(input.date) || input.date < today || input.date > addDays(today, SCHEDULE_DAYS)) {
      throw new RuleError('BLOCK_DATE', `Choose a date from today to ${SCHEDULE_DAYS} days ahead`);
    }
    block = { kind: 'once', date: input.date, weekday: null, start, end };
  } else if (input.kind === 'weekly') {
    const weekday = Number(input.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new RuleError('BLOCK_WEEKDAY', 'Choose a day of the week');
    block = { kind: 'weekly', date: null, weekday, start, end };
  } else {
    throw new RuleError('BLOCK_KIND', 'Choose one-off or weekly');
  }
  const hit = visits.find((v) => v.date >= today && blockOn(block, v.date) && overlaps(block, busy(v, buffer)));
  if (hit) {
    throw new RuleError('BLOCK_OVER_VISIT', `You have a booked visit on ${dayText(hit.date)} at ${timeText(hit.start)}. Booked visits and their travel time cannot be blocked`);
  }
  return block;
}

/** A larger buffer must still fit next to blocks already set. */
export function checkBufferChange(settings: ScheduleSettings, blocks: Block[], visits: BookedVisit[], today: string): void {
  for (const v of visits.filter((x) => x.date >= today)) {
    if (blocks.some((b) => blockOn(b, v.date) && overlaps(b, busy(v, settings.travelBufferMin)))) {
      throw new RuleError('BUFFER_OVER_BLOCK', `A ${settings.travelBufferMin}-minute buffer would run into a "Not available" block on ${dayText(v.date)}`);
    }
  }
}

export type DayItemKind = 'visit' | 'buffer' | 'off';

export interface DayItem {
  kind: DayItemKind;
  start: number;
  end: number;
  label: string;
  /** Block id for "off" items (to remove), visit id for visits. */
  id: number;
  weekly?: boolean;
}

/** One day of the S05 list, in time order: booked visits with their buffers, and "Not available" blocks. */
export function dayPlan(date: string, s: Pick<Schedule, 'settings' | 'blocks' | 'visits'>): DayItem[] {
  const items: DayItem[] = [];
  const buffer = s.settings.travelBufferMin;
  for (const v of s.visits.filter((x) => x.date === date)) {
    items.push({ kind: 'buffer', start: v.start - buffer, end: v.start, label: 'Travel buffer', id: v.id });
    items.push({ kind: 'visit', start: v.start, end: v.start + v.minutes, label: v.label, id: v.id });
    items.push({ kind: 'buffer', start: v.start + v.minutes, end: v.start + v.minutes + buffer, label: 'Travel buffer', id: v.id });
  }
  for (const b of s.blocks.filter((x) => blockOn(x, date))) {
    items.push({ kind: 'off', start: b.start, end: b.end, label: b.kind === 'weekly' ? `Not available (every ${WEEKDAYS[b.weekday ?? 0]})` : 'Not available', id: b.id, weekly: b.kind === 'weekly' });
  }
  return items.sort((a, b) => a.start - b.start || (a.kind === 'visit' ? -1 : 1));
}

/**
 * Can a visit of this length start here? (Used by booking, E5-2.) Inside service hours, not in a block,
 * and clear of other visits with the buffer on both sides.
 */
export function isFree(date: string, start: number, minutes: number, s: Pick<Schedule, 'settings' | 'blocks' | 'visits'>): boolean {
  if (start < DAY_START || start > DAY_END) return false;
  const want = { start, end: start + minutes };
  if (s.blocks.some((b) => blockOn(b, date) && overlaps(b, want))) return false;
  return !s.visits.some((v) => v.date === date && overlaps(want, busy(v, s.settings.travelBufferMin)));
}

/** The next 60 days from today (R16-5). */
export const scheduleDates = (today: string) => Array.from({ length: SCHEDULE_DAYS + 1 }, (_, i) => addDays(today, i));

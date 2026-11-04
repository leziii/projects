import { BLOCK_STEP, DAY_END, DAY_START, WEEKDAYS, dayPlan, dayText, scheduleDates, timeText, type BlockInput, type DayItem, type Schedule } from '@pawpal/shared';

/** Half-hour times in service hours, for the start and end pickers. */
export const TIME_OPTIONS = Array.from({ length: (DAY_END - DAY_START) / BLOCK_STEP + 1 }, (_, i) => DAY_START + i * BLOCK_STEP).map((value) => ({ value, label: timeText(value) }));

export const WEEKDAY_OPTIONS = WEEKDAYS.map((label, value) => ({ value, label }));

/** The "Not available" form as picked. */
export interface BlockForm {
  kind: 'once' | 'weekly';
  date: string;
  weekday: number;
  start: number;
  end: number;
}

export const emptyBlockForm = (today: string): BlockForm => ({ kind: 'once', date: today, weekday: 0, start: DAY_START, end: DAY_END });

export const blockFormToInput = (f: BlockForm): BlockInput =>
  f.kind === 'once' ? { kind: 'once', date: f.date, start: f.start, end: f.end } : { kind: 'weekly', weekday: f.weekday, start: f.start, end: f.end };

export const isAllDay = (f: Pick<BlockForm, 'start' | 'end'>) => f.start === DAY_START && f.end === DAY_END;

/** One row per day for the next 60 days (R16-5); "Today" for the first. */
export interface DayRow {
  date: string;
  title: string;
  items: DayItem[];
}

export function scheduleDays(s: Schedule): DayRow[] {
  return scheduleDates(s.today).map((date) => ({ date, title: date === s.today ? `Today · ${dayText(date)}` : dayText(date), items: dayPlan(date, s) }));
}

/** "10:00 am – 10:45 am" */
export const rangeText = (i: Pick<DayItem, 'start' | 'end'>) => (i.start === DAY_START && i.end === DAY_END ? 'All day' : `${timeText(i.start)} – ${timeText(i.end)}`);

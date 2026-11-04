import { describe, expect, it } from 'vitest';
import { addDays, checkBlock, checkBufferChange, checkSettings, dayPlan, dayText, isFree, klDate, scheduleDates, timeText, weekdayOf, type Block, type BookedVisit } from './schedule';

const today = '2026-10-30'; // a Friday
const visit: BookedVisit = { id: 1, date: '2026-11-01', start: 600, minutes: 45, label: 'Test visit' }; // Sunday 10:00–10:45
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('caregiver schedule (E4-5)', () => {
  it('dates and labels in Kuala Lumpur time', () => {
    expect(klDate(new Date('2026-10-30T16:30:00Z'))).toBe('2026-10-31');
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(timeText(570)).toBe('9:30 am');
    expect(timeText(1320)).toBe('10:00 pm');
    expect(timeText(720)).toBe('12:00 pm');
    expect(dayText('2026-11-01')).toBe('Sun 1 Nov');
    expect(scheduleDates(today)).toHaveLength(61);
  });

  it('settings: buffer and overtime choices', () => {
    expect(checkSettings({ travelBufferMin: 45, overtimeMaxMin: 0 })).toEqual({ travelBufferMin: 45, overtimeMaxMin: 0 });
    expect(code(() => checkSettings({ travelBufferMin: 20, overtimeMaxMin: 30 }))).toBe('BUFFER_CHOICE');
    expect(code(() => checkSettings({ travelBufferMin: 30, overtimeMaxMin: 20 }))).toBe('OVERTIME_CHOICE');
  });

  it('blocks: half hours in service hours, dates from today to 60 days', () => {
    expect(checkBlock({ kind: 'once', date: '2026-10-31', start: 1080, end: 1260 }, [], 30, today)).toEqual({ kind: 'once', date: '2026-10-31', weekday: null, start: 1080, end: 1260 });
    expect(checkBlock({ kind: 'weekly', weekday: 0, start: 420, end: 1320 }, [], 30, today).weekday).toBe(0);
    expect(code(() => checkBlock({ kind: 'once', date: '2026-10-31', start: 1080, end: 1065 }, [], 30, today))).toBe('BLOCK_TIME');
    expect(code(() => checkBlock({ kind: 'once', date: '2026-10-31', start: 360, end: 480 }, [], 30, today))).toBe('BLOCK_TIME');
    expect(code(() => checkBlock({ kind: 'once', date: '2026-10-29', start: 600, end: 660 }, [], 30, today))).toBe('BLOCK_DATE');
    expect(code(() => checkBlock({ kind: 'once', date: addDays(today, 61), start: 600, end: 660 }, [], 30, today))).toBe('BLOCK_DATE');
    expect(code(() => checkBlock({ kind: 'weekly', weekday: 7, start: 600, end: 660 }, [], 30, today))).toBe('BLOCK_WEEKDAY');
  });

  it('a block cannot cover a booked visit or its buffer; next to the buffer is fine', () => {
    expect(code(() => checkBlock({ kind: 'once', date: '2026-11-01', start: 540, end: 600 }, [visit], 30, today))).toBe('BLOCK_OVER_VISIT');
    expect(code(() => checkBlock({ kind: 'once', date: '2026-11-01', start: 660, end: 720 }, [visit], 30, today))).toBe('BLOCK_OVER_VISIT');
    expect(code(() => checkBlock({ kind: 'weekly', weekday: 0, start: 420, end: 1320 }, [visit], 30, today))).toBe('BLOCK_OVER_VISIT');
    expect(checkBlock({ kind: 'once', date: '2026-11-01', start: 690, end: 720 }, [visit], 30, today).start).toBe(690);
    expect(checkBlock({ kind: 'once', date: '2026-11-01', start: 420, end: 570 }, [visit], 30, today).end).toBe(570);
    // Past visits do not block a weekly pattern.
    expect(checkBlock({ kind: 'weekly', weekday: 0, start: 420, end: 1320 }, [{ ...visit, date: '2026-10-25' }], 30, today).kind).toBe('weekly');
  });

  it('a bigger buffer must not run into a block', () => {
    const blocks: Block[] = [{ id: 9, kind: 'once', date: '2026-11-01', weekday: null, start: 690, end: 720 }];
    expect(() => checkBufferChange({ travelBufferMin: 45, overtimeMaxMin: 30 }, blocks, [visit], today)).not.toThrow();
    expect(code(() => checkBufferChange({ travelBufferMin: 60, overtimeMaxMin: 30 }, blocks, [visit], today))).toBe('BUFFER_OVER_BLOCK');
  });

  it('day plan and free slots', () => {
    const s = { settings: { travelBufferMin: 30, overtimeMaxMin: 30 }, blocks: [{ id: 2, kind: 'weekly' as const, date: null, weekday: 0, start: 1080, end: 1320 }], visits: [visit] };
    expect(dayPlan('2026-11-01', s).map((i) => `${i.kind} ${timeText(i.start)}–${timeText(i.end)}`)).toEqual([
      'buffer 9:30 am–10:00 am',
      'visit 10:00 am–10:45 am',
      'buffer 10:45 am–11:15 am',
      'off 6:00 pm–10:00 pm',
    ]);
    expect(dayPlan('2026-11-01', s)[3].label).toBe('Not available (every Sunday)');
    expect(dayPlan('2026-11-02', s)).toEqual([]);
    expect(isFree('2026-11-01', 675, 30, s)).toBe(true);
    expect(isFree('2026-11-01', 660, 30, s)).toBe(false);
    expect(isFree('2026-11-01', 1050, 60, s)).toBe(false);
    expect(isFree('2026-11-02', 1320, 30, s)).toBe(true);
    expect(isFree('2026-11-02', 1350, 30, s)).toBe(false);
  });
});

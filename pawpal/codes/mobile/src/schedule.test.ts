import type { Schedule } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { TIME_OPTIONS, WEEKDAY_OPTIONS, blockFormToInput, emptyBlockForm, isAllDay, rangeText, scheduleDays } from './schedule';

const s: Schedule = {
  today: '2026-10-30',
  settings: { travelBufferMin: 30, overtimeMaxMin: 30 },
  blocks: [{ id: 3, kind: 'weekly', date: null, weekday: 0, start: 420, end: 1320 }],
  visits: [{ id: 1, date: '2026-10-31', start: 600, minutes: 45, label: 'Test visit' }],
};

describe('caregiver schedule page (E4-5)', () => {
  it('pickers', () => {
    expect(TIME_OPTIONS[0]).toEqual({ value: 420, label: '7:00 am' });
    expect(TIME_OPTIONS).toHaveLength(31);
    expect(WEEKDAY_OPTIONS[0]).toEqual({ value: 0, label: 'Sunday' });
  });

  it('block form', () => {
    const f = emptyBlockForm('2026-10-30');
    expect(isAllDay(f)).toBe(true);
    expect(blockFormToInput(f)).toEqual({ kind: 'once', date: '2026-10-30', start: 420, end: 1320 });
    expect(blockFormToInput({ ...f, kind: 'weekly', weekday: 6, start: 1080 })).toEqual({ kind: 'weekly', weekday: 6, start: 1080, end: 1320 });
  });

  it('60 days, today first, with visits, buffers and blocks', () => {
    const days = scheduleDays(s);
    expect(days).toHaveLength(61);
    expect(days[0].title).toBe('Today · Fri 30 Oct');
    expect(days[1].items.map((i) => `${i.kind} ${rangeText(i)}`)).toEqual(['buffer 9:30 am – 10:00 am', 'visit 10:00 am – 10:45 am', 'buffer 10:45 am – 11:15 am']);
    expect(days[2].items.map((i) => `${i.kind} ${rangeText(i)}`)).toEqual(['off All day']);
  });
});

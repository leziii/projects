import { describe, expect, it } from 'vitest';
import { overtimeCheck, overtimeMaxUnits, overtimeText } from './overtime';
import type { Schedule } from './schedule';

describe('E11-2 overtime', () => {
  it('units of 15 min at RM10, up to the limit less what was booked (R46-2)', () => {
    expect(overtimeMaxUnits(30, 0)).toBe(2);
    expect(overtimeMaxUnits(60, 15)).toBe(3);
    expect(overtimeMaxUnits(30, 30)).toBe(0);
    expect(overtimeMaxUnits(0, 0)).toBe(0);
    expect(overtimeText(2)).toBe('30 min · RM20');
  });

  // This visit 9:00–9:45 (id 1); next visit 11:30 with a 30 min buffer; Not available 10:00–10:30 on another day.
  const s: Pick<Schedule, 'settings' | 'blocks' | 'visits'> = {
    settings: { travelBufferMin: 30, overtimeMaxMin: 60 },
    blocks: [{ id: 9, kind: 'once', date: '2026-11-11', weekday: null, start: 600, end: 630 }],
    visits: [
      { id: 1, date: '2026-11-10', start: 540, minutes: 45, label: 'This' },
      { id: 2, date: '2026-11-10', start: 690, minutes: 60, label: 'Next' },
      { id: 3, date: '2026-11-10', start: 420, minutes: 60, label: 'Earlier' },
    ],
  };

  it('checks the next visit with the travel buffer and Not available blocks (R46-3)', () => {
    expect(overtimeCheck('2026-11-10', 585, 4, s, 1)).toEqual({ units: 4, fits: true, text: 'Fits (next visit 11:30 am)' });
    // 9:45 + 75 min = 11:00, into the 30 min buffer before 11:30.
    expect(overtimeCheck('2026-11-10', 615, 4, s, 1)).toEqual({ units: 4, fits: false, text: 'Clashes with your 11:30 am visit' });
    expect(overtimeCheck('2026-11-11', 585, 2, s, null)).toEqual({ units: 2, fits: false, text: 'Clashes with your Not available time from 10:00 am' });
    expect(overtimeCheck('2026-11-11', 585, 1, s, null)).toEqual({ units: 1, fits: true, text: 'Fits (no other visit today)' });
  });
});

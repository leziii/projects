import { describe, expect, it } from 'vitest';
import { answerBy, canMove, checkSubstitute, substituteApprovedText, substituteVisitText } from './substitutes';
import { klInstant } from './requests';

describe('E12-4 substitute', () => {
  it('needs a caregiver, visits with a start time and a reason (R52-1, R52-2)', () => {
    const starts = [540, 600, 660];
    expect(() => checkSubstitute({}, starts)).toThrow('Choose a caregiver');
    expect(() => checkSubstitute({ caregiverId: 3, visits: [] }, starts)).toThrow('Choose at least one visit');
    expect(() => checkSubstitute({ caregiverId: 3, visits: [{ index: 0, start: 601 }] }, starts)).toThrow('Choose a start time');
    expect(() => checkSubstitute({ caregiverId: 3, visits: [{ index: 0, start: 600 }], reason: 'no' }, starts)).toThrow('Write the reason');
    expect(checkSubstitute({ caregiverId: 3, visits: [{ index: 1, start: 660 }, { index: 0, start: 600 }], reason: ' Siti is unwell ' }, starts)).toEqual({
      caregiverId: 3,
      visits: [{ index: 0, start: 600 }, { index: 1, start: 660 }],
      reason: 'Siti is unwell',
    });
    expect(canMove('todo')).toBe(true);
    expect(canMove('arrived')).toBe(false);
  });

  it('answer within 12 h or before the first visit starts (R52-5)', () => {
    const now = klInstant('2026-11-19 08:00:00');
    expect(answerBy(now, [{ date: '2026-11-21', start: 600, newStart: 600 }]).getTime()).toBe(klInstant('2026-11-19 20:00:00').getTime());
    expect(answerBy(now, [{ date: '2026-11-19', start: 840, newStart: 780 }]).getTime()).toBe(klInstant('2026-11-19 13:00:00').getTime());
  });

  it('words the visits and the result (R52-3, R52-4)', () => {
    expect(substituteVisitText({ date: '2026-11-21', start: 600, newStart: 600 })).toBe('Sat 21 Nov · 10:00 am (same time)');
    expect(substituteVisitText({ date: '2026-11-21', start: 600, newStart: 660 })).toBe('Sat 21 Nov · 10:00 am → 11:00 am');
    expect(substituteApprovedText('Lim M.', 2)).toBe('Substitute approved: Lim M. takes 2 visits. Price unchanged.');
  });
});

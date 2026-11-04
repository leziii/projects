import { describe, expect, it } from 'vitest';
import { REJECT_REASONS, REQUEST_END_LABEL, clashText, firstVisitOf, klInstant, petsText, timeLeftText, visitIncome, visitWhen } from './requests';

describe('E6-1 booking requests', () => {
  it('reads Kuala Lumpur times', () => {
    expect(klInstant('2026-11-02 13:45:00.000').toISOString()).toBe('2026-11-02T05:45:00.000Z');
  });

  it('time left counts down by the minute and ends at 0 (R25-5)', () => {
    const d = '2026-11-02 13:45:00.000';
    const at = (iso: string) => new Date(iso);
    expect(timeLeftText(d, at('2026-11-02T03:35:00Z'))).toBe('2 h 10 min left');
    expect(timeLeftText(d, at('2026-11-02T05:21:00Z'))).toBe('24 min left');
    expect(timeLeftText(d, at('2026-11-02T05:44:30Z'))).toBe('Under 1 min left');
    expect(timeLeftText(d, at('2026-11-02T05:45:00Z'))).toBeNull();
    expect(timeLeftText(d, at('2026-11-02T06:00:00Z'))).toBeNull();
  });

  it('says the pets in short (R25-3)', () => {
    expect(petsText([{ kind: 'dog' }])).toBe('1 dog');
    expect(petsText([{ kind: 'cat' }, { kind: 'dog' }, { kind: 'cat' }])).toBe('1 dog, 2 cats');
  });

  it('income is 85% of the full price of the visit', () => {
    expect(visitIncome({ quote: { serviceKind: 'dog', basePrice: 7000, extraPetFee: 0, overtimeFee: 0, total: 7000, minMinutes: 60, totalMinutes: 60 } })).toBe(5950);
  });

  it('finds the first visit and says when it is', () => {
    const first = firstVisitOf([
      { date: '2026-11-04', start: 480 },
      { date: '2026-11-03', start: 600 },
      { date: '2026-11-03', start: 540 },
    ]);
    expect(first).toEqual({ date: '2026-11-03', start: 540 });
    expect(visitWhen(first)).toBe('Tue 3 Nov · 9:00 am');
  });

  it('labels why a request ended', () => {
    expect(REQUEST_END_LABEL.expired).toBe('Expired');
    expect(REQUEST_END_LABEL.rejected).toBe('You said no');
    expect(REQUEST_END_LABEL.accepted).toBe('Accepted');
  });

  it('says which visits clash, and offers four reasons to say no (R26-1, R26-5)', () => {
    expect(clashText([{ date: '2026-11-03', start: 540 }])).toBe('This visit clashes with your schedule: Tue 3 Nov · 9:00 am. Free that time in your schedule, or say no.');
    expect(clashText([{ date: '2026-11-03', start: 540 }, { date: '2026-11-04', start: 600 }])).toContain('These visits clash with your schedule: Tue 3 Nov · 9:00 am, Wed 4 Nov · 10:00 am.');
    expect(REJECT_REASONS.map((r) => r.label)).toEqual(['Not free', 'Too far', 'Pets not suitable', 'Other']);
  });
});

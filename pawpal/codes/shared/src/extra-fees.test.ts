import { describe, expect, it } from 'vitest';
import { extraFeeStatusText, extraFeeTitle, extraFeeUsedText, overtimeEarnedText, overtimeUsedUnits, overtimeUntilText, serviceEndMin } from './extra-fees';

describe('E11-3 extra fees', () => {
  it('names the fee and where it stands (R47-1, R47-5)', () => {
    expect(extraFeeTitle({ kind: 'overtime', units: 2 })).toBe('Overtime: 30 min · RM20');
    expect(extraFeeTitle({ kind: 'waiting', units: 6 })).toBe('Waiting: prepay RM25');
    expect(extraFeeStatusText({ status: 'requested', payment: null })).toBe('Waiting for you');
    expect(extraFeeStatusText({ status: 'requested', payment: { id: 1, status: 'pending', method: 'tng' } })).toBe('Payment being checked');
    expect(extraFeeStatusText({ status: 'requested', payment: { id: 1, status: 'failed', method: 'tng' } })).toBe('Waiting for you');
    expect(extraFeeStatusText({ status: 'lapsed', payment: null })).toBe('Lapsed: not paid before the visit ended');
  });

  it('paid overtime runs from the service end, which moves when entry was late (R47-2)', () => {
    const v = { start: 540, minutes: 45, enteredAt: null };
    expect(serviceEndMin(v)).toBe(585);
    expect(serviceEndMin({ ...v, enteredAt: '2026-11-10 09:10:00.000' })).toBe(595);
    expect(overtimeUntilText(v, 2)).toBe('10:15 am');
  });
});

describe('E11-4 unused extra fees', () => {
  it('counts overtime in started 15-min units, never more than paid (R48-2)', () => {
    expect(overtimeUsedUnits(-5, 2)).toBe(0);
    expect(overtimeUsedUnits(0, 2)).toBe(0);
    expect(overtimeUsedUnits(10, 2)).toBe(1);
    expect(overtimeUsedUnits(16, 2)).toBe(2);
    expect(overtimeUsedUnits(50, 2)).toBe(2);
  });

  it('says what was used and sent back (R48-3)', () => {
    expect(extraFeeUsedText({ minutes: 25, sen: 1000, refundSen: 1500, refund: 'on_its_way' })).toBe('Used 25 min · RM10 · RM15 on its way back');
    expect(extraFeeUsedText({ minutes: 25, sen: 1000, refundSen: 1500, refund: 'refunded' })).toBe('Used 25 min · RM10 · RM15 refunded');
    expect(extraFeeUsedText({ minutes: 60, sen: 2500, refundSen: 0, refund: null })).toBe('Used 60 min · RM25');
    expect(overtimeEarnedText(15, 1000)).toBe('Overtime used 15 min · RM10');
    expect(overtimeEarnedText(0, 0)).toBe('Overtime not used · RM0');
  });
});

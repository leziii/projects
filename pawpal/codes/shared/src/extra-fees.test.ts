import { describe, expect, it } from 'vitest';
import { extraFeeStatusText, extraFeeTitle, overtimeUntilText, serviceEndMin } from './extra-fees';

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

import { describe, expect, it } from 'vitest';
import { isFinalPayment, PAYMENT_METHODS, rmToSen } from './payments';

describe('payments helpers', () => {
  it('knows which statuses are final', () => {
    expect(isFinalPayment('succeeded')).toBe(true);
    expect(isFinalPayment('failed')).toBe(true);
    expect(isFinalPayment('pending')).toBe(false);
    expect(isFinalPayment('checking')).toBe(false);
  });

  it('converts RM text to sen', () => {
    expect(rmToSen('40')).toBe(4000);
    expect(rmToSen('59.5')).toBe(5950);
    expect(rmToSen(' 0.01 ')).toBe(1);
    expect(rmToSen('1.005')).toBeNull();
    expect(rmToSen('-5')).toBeNull();
    expect(rmToSen('')).toBeNull();
    expect(rmToSen('abc')).toBeNull();
  });

  it('lists the Malaysian payment methods', () => {
    expect(Object.values(PAYMENT_METHODS)).toEqual(["Touch 'n Go", 'DuitNow', 'FPX online banking', 'Card']);
  });
});

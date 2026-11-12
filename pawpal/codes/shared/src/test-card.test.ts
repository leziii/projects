import { describe, expect, it } from 'vitest';
import { cardNumberText, expiryText, luhnOk, testCardProblems } from './test-card';

describe('R41-8 test card form', () => {
  const ok = { number: '4111 1111 1111 1111', name: 'Ali Tan', expiry: '12/29', cvv: '123' };
  it('formats as the owner types', () => {
    expect(cardNumberText('41111111111111112222')).toBe('4111 1111 1111 1111');
    expect(cardNumberText('4111a11')).toBe('4111 11');
    expect(expiryText('1229')).toBe('12/29');
    expect(expiryText('1')).toBe('1');
    expect(expiryText('12/2')).toBe('12/2');
  });
  it('checks number, name, expiry and CVV', () => {
    expect(luhnOk('4111111111111111')).toBe(true);
    expect(luhnOk('4111111111111112')).toBe(false);
    expect(testCardProblems(ok, '2026-11-07')).toEqual([]);
    expect(testCardProblems({ number: '', name: '', expiry: '', cvv: '' }, '2026-11-07')).toEqual(['Card number: 16 digits', 'Name on card', 'Expiry: MM/YY', 'CVV: 3 digits']);
    expect(testCardProblems({ ...ok, number: '4111 1111 1111 1112' }, '2026-11-07')).toEqual(['Card number: check the digits']);
    expect(testCardProblems({ ...ok, expiry: '13/29' }, '2026-11-07')).toEqual(['Expiry: MM/YY']);
    expect(testCardProblems({ ...ok, expiry: '10/26' }, '2026-11-07')).toEqual(['Expiry: this card has expired']);
    expect(testCardProblems({ ...ok, expiry: '11/26' }, '2026-11-07')).toEqual([]);
    expect(testCardProblems({ ...ok, cvv: '12a' }, '2026-11-07')).toEqual(['CVV: 3 digits']);
  });
});

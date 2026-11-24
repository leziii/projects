import { describe, expect, it } from 'vitest';
import { checkOrderQuery, maskPhone, searchOf, visitSummary } from './admin-orders';

describe('E14-2 admin orders', () => {
  it('reads two separate filters, dates, search and page (R58-2)', () => {
    expect(checkOrderQuery({})).toEqual({ booking: null, money: null, from: null, to: null, q: null, page: 1 });
    expect(checkOrderQuery({ booking: 'done', money: 'payout_failed', from: '2026-11-01', to: '2026-11-30', q: ' P2026 ', page: '3' })).toEqual({
      booking: 'done', money: 'payout_failed', from: '2026-11-01', to: '2026-11-30', q: 'P2026', page: 3,
    });
    expect(checkOrderQuery({ booking: '', money: '', page: '0' })).toMatchObject({ booking: null, money: null, page: 1 });
    expect(() => checkOrderQuery({ booking: 'paid' })).toThrow('Unknown booking status');
    expect(() => checkOrderQuery({ money: 'done' })).toThrow('Unknown money status');
    expect(() => checkOrderQuery({ from: '1/11/2026' })).toThrow('Dates must be YYYY-MM-DD');
    expect(() => checkOrderQuery({ q: 'x'.repeat(41) })).toThrow('at most 40');
  });

  it('search is phone digits or an order number', () => {
    expect(searchOf('012-345 6789')).toEqual({ digits: '123456789', number: '012-345 6789' });
    expect(searchOf('+60 12-345')).toEqual({ digits: '6012345', number: '+60 12-345' });
    expect(searchOf('p2026')).toEqual({ digits: null, number: 'P2026' });
    expect(searchOf('123')).toEqual({ digits: null, number: '123' });
  });

  it('masks the owner and sums the visits (R58-1)', () => {
    expect(maskPhone('+60123456789')).toBe('+60 12-*** 6789');
    expect(maskPhone('+601112345678')).toBe('+60 11-*** 5678');
    expect(visitSummary(1, 0)).toBe('1 visit');
    expect(visitSummary(3, 0)).toBe('3 visits');
    expect(visitSummary(3, 1)).toBe('3 · 1 cancelled');
  });
});

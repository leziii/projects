import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, cancelRefund, quoteVisit } from './rules';
import { RULE_FIELDS, checkRuleEdit, ruleChangeText, ruleDiff, ruleValues, ruleVersionStates, tomorrowOf, withValues } from './rule-versions';
import { cancelLines } from './cancel';
import { waitingFeeSen, waitingRulesOf, waitingText, waitingState } from './waiting';
import { lineMath, settleOrder } from './settlements';
import { visitIncome } from './requests';

const today = '2026-11-23';
const edit = (values: Record<string, unknown>, over: Record<string, unknown> = {}) => checkRuleEdit({ values, effectiveFrom: '2026-11-24', reason: 'Price review', ...over }, DEFAULT_RULES, today);

describe('E14-3 rule versions', () => {
  it('only lists the agreed fields, never capacity, accept windows or booking hours (R59-1, R59-2)', () => {
    const groups = new Set(RULE_FIELDS.map((f) => f.group));
    expect([...groups]).toEqual(['price', 'minMinutes', 'waiting', 'cancel', 'split']);
    expect(() => edit({ 'capacity.maxPets': 4 })).toThrow(/cannot be changed/);
    expect(() => edit({ 'booking.firstHour': 6 })).toThrow(/cannot be changed/);
  });

  it('keeps the fixed parts from code when values change', () => {
    const r = withValues({ ...ruleValues(DEFAULT_RULES), 'price.cat': 4500 }, 'v2');
    expect(r.version).toBe('v2');
    expect(r.price.cat).toBe(4500);
    expect(r.capacity).toEqual(DEFAULT_RULES.capacity);
    expect(DEFAULT_RULES.price.cat).toBe(4000);
  });

  it('checks values, tiers, date and reason (R59-3, R59-6)', () => {
    expect(edit({ 'price.cat': 4500 }).values['price.cat']).toBe(4500);
    expect(() => edit({ 'price.cat': 45.5 })).toThrow(/whole number/);
    expect(() => edit({ 'price.cat': 50 })).toThrow(/between RM1 and RM1000/);
    expect(() => edit({ 'split.caregiverServicePercent': 101 })).toThrow(/between 0% and 100%/);
    expect(() => edit({ 'price.dogUpgrade': 5000 })).toThrow('Dog upgrade cannot cost less than dog basic');
    expect(() => edit({ 'cancel.partialRefundHours': 24 })).toThrow('Part refund must start later than full refund');
    expect(() => edit({ 'waiting.freeMinutes': 60 })).toThrow('Free minutes must be less than the longest wait');
    expect(() => edit({ 'price.cat': 4000 })).toThrow('Change at least one value');
    expect(() => edit({ 'price.cat': 4500 }, { effectiveFrom: today })).toThrow('A new version can start tomorrow at the earliest');
    expect(() => edit({ 'price.cat': 4500 }, { effectiveFrom: '2027-03-01' })).toThrow(/at most 90 days/);
    expect(() => edit({ 'price.cat': 4500 }, { effectiveFrom: '24/11/2026' })).toThrow(/YYYY-MM-DD/);
    expect(() => edit({ 'price.cat': 4500 }, { reason: 'abc' })).toThrow(/reason/);
    expect(tomorrowOf(today)).toBe('2026-11-24');
    expect(tomorrowOf('2026-12-31')).toBe('2027-01-01');
  });

  it('shows from → to for each change (R59-6)', () => {
    const next = withValues(edit({ 'price.cat': 4500, 'split.caregiverServicePercent': 80, 'cancel.fullRefundHours': 48 }).values, 'v2');
    expect(ruleDiff(DEFAULT_RULES, next).map(ruleChangeText)).toEqual([
      'Prices · Cat: RM40 → RM45',
      'Cancel refunds · Full refund from: 24 h → 48 h',
      'Caregiver split · Service and overtime to caregiver: 85% → 80%',
    ]);
  });

  it('works out which version is in effect on a day (R59-3, R59-5)', () => {
    const rows = [
      { version: 'a', effectiveFrom: '2026-10-24', withdrawn: false },
      { version: 'b', effectiveFrom: '2026-11-20', withdrawn: false },
      { version: 'c', effectiveFrom: '2026-11-25', withdrawn: true },
      { version: 'd', effectiveFrom: '2026-11-26', withdrawn: false },
    ];
    expect(Object.fromEntries(ruleVersionStates(rows, today))).toEqual({ a: 'past', b: 'in_effect', c: 'withdrawn', d: 'waiting' });
    expect(ruleVersionStates(rows, '2026-11-26').get('d')).toBe('in_effect');
  });

  it("an order's own version drives price, cancel refund, waiting fee and split (R59-4)", () => {
    const r = withValues({ ...ruleValues(DEFAULT_RULES), 'price.cat': 5000, 'cancel.partialRefundPercent': 50, 'waiting.feePerBlock': 1000, 'split.caregiverServicePercent': 80 }, 'v2');
    expect(quoteVisit(['cat'], 'basic', 0, r).total).toBe(5000);
    const start = new Date('2026-11-24T10:00:00+08:00');
    expect(cancelRefund(start, new Date('2026-11-24T00:00:00+08:00'), 5000, r).refund).toBe(2500);
    expect(cancelLines([{ date: '2026-11-24', start: 600, paidSen: 4000 }], 0, [{ status: 'todo' }], new Date('2026-11-24T00:00:00+08:00'), r)[0].refundSen).toBe(2000);
    const w = waitingRulesOf(r);
    expect(w.maxSen).toBe(5000);
    expect(waitingFeeSen(21, w)).toBe(2000);
    expect(waitingText(waitingState({ date: '2026-11-24', start: 600, arrivedAt: '2026-11-24 10:00:00', enteredAt: '2026-11-24 11:30:00' }, start, w), w)).toBe('Waited 60 min · RM50');
    expect(settleOrder([{ priceSen: 5000, status: 'confirmed', cancelPercent: null, decision: null }], [], r).caregiverSen).toBe(4000);
    expect(lineMath({ kind: 'service', grossSen: 5000, caregiverSen: 4000 }, r)).toBe('RM50 × 80% = RM40');
    expect(visitIncome({ quote: quoteVisit(['cat'], 'basic', 0, r) }, r)).toBe(4000);
    // The code default is untouched.
    expect(visitIncome({ quote: quoteVisit(['cat'], 'basic') })).toBe(3400);
  });
});

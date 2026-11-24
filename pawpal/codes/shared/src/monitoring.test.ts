import { describe, expect, it } from 'vitest';
import { ADMIN_PAGES, ADMIN_PAGE_LABEL } from './admin';
import {
  TEST_ALERT_ITEM,
  checkFunnelDays,
  checkFunnelEvent,
  dueMoneyAlerts,
  funnelDays,
  funnelSteps,
  moneyAlertText,
  scrubEvent,
  scrubText,
  type MoneyAlertItem,
} from './monitoring';

const item = (o: Partial<MoneyAlertItem> = {}): MoneyAlertItem => ({
  key: 'order-12-payout',
  kind: 'payout',
  state: 'failed',
  number: 'P20261124012',
  what: 'Payout to Siti Aminah',
  amountSen: 8500,
  reason: 'Account closed',
  tries: 1,
  minutes: 2,
  ...o,
});

describe('E15-3 monitoring', () => {
  it('never sends phone numbers, addresses or IC numbers (R61-1)', () => {
    expect(scrubText('Call +60 12-345 6789 or 0123456789, IC 900101-14-5678, a@b.my')).toBe('Call [removed] or [removed], IC [removed], [removed]');
    expect(scrubText('/.pnpm/@vitest+runner@2.1.9/node_modules')).toBe('/.pnpm/@vitest+runner@2.1.9/node_modules');
    expect(scrubText('Order P20261124012 visit 2 at 10:30, 60123456789')).toBe('Order P20261124012 visit 2 at 10:30, [removed]');
    const e = scrubEvent({ message: 'Bad phone 0123456789', user: { id: 4, phone: '+60123456789' }, extra: { address: '12 Jalan Ampang', icNumber: '900101145678', list: ['ok', '900101-14-5678'] } });
    expect(e).toEqual({ message: 'Bad phone [removed]', user: { id: 4, phone: '[removed]' }, extra: { address: '[removed]', icNumber: '[removed]', list: ['ok', '[removed]'] } });
  });

  it('alerts each failure once and the same item at most once an hour (R61-3)', () => {
    const now = new Date('2026-11-24T10:00:00Z');
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);
    expect(dueMoneyAlerts([item()], [], now)).toHaveLength(1);
    // Already alerted.
    expect(dueMoneyAlerts([item()], [{ key: 'order-12-payout', occurrence: 'failed:1', at: ago(200) }], now)).toHaveLength(0);
    // A new failure after a retry, but inside the hour: waits.
    expect(dueMoneyAlerts([item({ tries: 2 })], [{ key: 'order-12-payout', occurrence: 'failed:1', at: ago(20) }], now)).toHaveLength(0);
    expect(dueMoneyAlerts([item({ tries: 2 })], [{ key: 'order-12-payout', occurrence: 'failed:1', at: ago(61) }], now)).toHaveLength(1);
    // Processing: only after 30 minutes.
    expect(dueMoneyAlerts([item({ state: 'processing', minutes: 29 })], [], now)).toHaveLength(0);
    expect(dueMoneyAlerts([item({ state: 'processing', minutes: 30 })], [], now)).toHaveLength(1);
  });

  it('says what failed without private data', () => {
    expect(moneyAlertText(item())).toBe('PawPal money alert: Payout RM85 · Payout to Siti Aminah · P20261124012 failed: Account closed. Open Money in admin to fix it.');
    expect(moneyAlertText(item({ kind: 'payment', state: 'processing', minutes: 45, reason: null }))).toContain('Payment RM85');
    expect(moneyAlertText(item({ state: 'processing', minutes: 45 }))).toContain('still processing after 45 min');
    expect(moneyAlertText(item({ reason: 'Bank says 0123456789 is wrong' }))).toContain('Bank says [removed] is wrong');
    expect(moneyAlertText(TEST_ALERT_ITEM)).toContain('Test alert from Test tools');
  });

  it('reads funnel events and periods (R61-4)', () => {
    expect(checkFunnelEvent({ step: 'setup', visitor: 'v-12345678' })).toEqual({ step: 'setup', visitor: 'v-12345678' });
    expect(() => checkFunnelEvent({ step: 'paid', visitor: 'v-12345678' })).toThrow('step must be one of');
    expect(() => checkFunnelEvent({ step: 'home', visitor: 'x' })).toThrow('visitor');
    expect(checkFunnelDays(undefined)).toBe(7);
    expect(checkFunnelDays('30')).toBe(30);
    expect(() => checkFunnelDays('9')).toThrow('7 or 30');
    expect(ADMIN_PAGES).toContain('funnel');
    expect(ADMIN_PAGE_LABEL.funnel).toBe('Funnel');
  });

  it('fills every day and counts each step against the one before', () => {
    const days = funnelDays('2026-11-22', '2026-11-24', [
      { day: '2026-11-22', step: 'home', n: 10 },
      { day: '2026-11-24', step: 'home', n: 10 },
      { day: '2026-11-24', step: 'setup', n: 5 },
      { day: '2026-11-24', step: 'caregiver', n: 4 },
      { day: '2026-11-24', step: 'paid', n: 1 },
    ]);
    expect(days.map((d) => d.day)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    expect(days[1].counts.home).toBe(0);
    expect(funnelSteps(days).map((s) => [s.step, s.count, s.ofPrevious])).toEqual([
      ['home', 20, null],
      ['setup', 5, 25],
      ['caregiver', 4, 80],
      ['pay', 0, 0],
      ['paid', 1, null],
    ]);
    expect(funnelSteps(funnelDays('2026-11-24', '2026-11-24', [{ day: '2026-11-24', step: 'home', n: 2 }, { day: '2026-11-24', step: 'setup', n: 5 }]))[1].ofPrevious).toBeNull();
  });
});

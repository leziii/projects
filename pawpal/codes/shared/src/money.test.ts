import { describe, expect, it } from 'vitest';
import { canCheckBank, canSendAgain, moneyState, moneyTab, nextTryRef, parseMoneyRef, tryCountText, tryStatusText, type MoneyItem } from './money';

const item = (id: string, state: MoneyItem['state'], updatedAt: string, late = false): MoneyItem => ({
  id, kind: 'refund', orderId: 1, number: 'P1', index: null, what: '', amountSen: 100, state, tries: 1, lastFailure: null, updatedAt, late,
});

describe('E13-4 money queue', () => {
  it('reads which item and try a reference is (R56-1, R56-3)', () => {
    expect(parseMoneyRef('order-12-payout')).toEqual({ orderId: 12, kind: 'payout', key: 'payout', base: 'order-12-payout', attempt: 0 });
    expect(parseMoneyRef('order-12-payout-r2')).toMatchObject({ base: 'order-12-payout', attempt: 2 });
    expect(parseMoneyRef('order-12-refund-v0-r1')).toEqual({ orderId: 12, kind: 'refund', key: 'v0', base: 'order-12-refund-v0', attempt: 1 });
    expect(parseMoneyRef('order-12-refund-34')).toMatchObject({ kind: 'refund', key: 'full-34', base: 'order-12-refund-34' });
    expect(parseMoneyRef('order-12-refund-w5')?.kind).toBe('fee_refund');
    expect(parseMoneyRef('order-12-refund-o5')?.kind).toBe('fee_refund');
    expect(parseMoneyRef('order-12-refund-x1')?.kind).toBe('refund');
    expect(parseMoneyRef('admin-po-abc')).toBeNull();
    expect(nextTryRef('order-12-payout', 1)).toBe('order-12-payout-r1');
  });

  it('only the bank decides: any success is done, else the last try (R56-4)', () => {
    expect(moneyState([{ status: 'failed' }, { status: 'succeeded' }])).toBe('done');
    expect(moneyState([{ status: 'succeeded' }, { status: 'failed' }])).toBe('done');
    expect(moneyState([{ status: 'failed' }])).toBe('failed');
    expect(moneyState([{ status: 'failed' }, { status: 'checking' }])).toBe('processing');
    expect(canSendAgain({ state: 'failed' })).toBe(true);
    expect(canSendAgain({ state: 'processing' })).toBe(false);
    expect(canSendAgain({ state: 'done' })).toBe(false);
    expect(canCheckBank({ state: 'processing', late: true })).toBe(true);
    expect(canCheckBank({ state: 'processing', late: false })).toBe(false);
    expect(canCheckBank({ state: 'failed', late: true })).toBe(false);
  });

  it('tabs show failed first, then processing, newest first (R56-1)', () => {
    const items = [item('a', 'done', '2026-11-20 10:00:00'), item('b', 'processing', '2026-11-20 09:00:00', true), item('e', 'processing', '2026-11-20 08:00:00'), item('c', 'failed', '2026-11-19 09:00:00'), item('d', 'failed', '2026-11-20 09:00:00')];
    expect(moneyTab(items, 'all').map((i) => i.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
    expect(moneyTab(items, 'failed').map((i) => i.id)).toEqual(['d', 'c']);
    expect(moneyTab(items, 'processing').map((i) => i.id)).toEqual(['b', 'e']);
    // E14-1: the dashboard's "processing over 30 min" queue.
    expect(moneyTab(items, 'late').map((i) => i.id)).toEqual(['b']);
  });

  it('words each try (R56-2)', () => {
    expect(tryCountText(1)).toBe('1 try');
    expect(tryCountText(3)).toBe('3 tries');
    expect(tryStatusText({ status: 'failed', failureReason: 'Account closed' })).toBe('Failed: Account closed');
    expect(tryStatusText({ status: 'failed', failureReason: null })).toBe('Failed: no reason given');
    expect(tryStatusText({ status: 'succeeded', failureReason: null })).toBe('Done');
    expect(tryStatusText({ status: 'pending', failureReason: null })).toBe('Processing');
    expect(tryStatusText({ status: 'checking', failureReason: null })).toBe('Checking with bank');
  });
});

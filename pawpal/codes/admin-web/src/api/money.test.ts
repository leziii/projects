import { describe, expect, it } from 'vitest';
import { checkBank, getMoney, listMoney, moneyStateText, moneyWhereText, sendAgain } from './money';

describe('E13-4 money queue', () => {
  it('lists, opens, sends again and checks with the bank; there is no call to mark paid (R56-1 … R56-4)', async () => {
    const urls: string[] = [];
    const fake = (async (u: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? 'GET'} ${u}`);
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;
    await listMoney(fake);
    await getMoney('order-7-payout', fake);
    await sendAgain('order-7-payout', fake);
    await checkBank('order-7-refund-v0', fake);
    expect(urls).toEqual(['GET /api/admin/money', 'GET /api/admin/money/order-7-payout', 'POST /api/admin/money/order-7-payout/send-again', 'POST /api/admin/money/order-7-refund-v0/check']);
  });

  it('words state and place', () => {
    expect(moneyStateText({ state: 'failed', late: false })).toBe('Failed');
    expect(moneyStateText({ state: 'processing', late: true })).toBe('Processing · over 30 min');
    expect(moneyWhereText({ number: 'P1', index: null })).toBe('P1');
    expect(moneyWhereText({ number: 'P1', index: 1 })).toBe('P1 · visit 2');
  });
});

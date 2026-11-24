import { describe, expect, it } from 'vitest';
import { getOrder, listOrders, orderQuery, showAddress } from './orders';

const none = { booking: '', money: '', from: '', to: '', q: '', page: 1 } as const;

describe('E14-2 orders', () => {
  it('puts only the filters in use in the address (R58-2)', () => {
    expect(orderQuery(none)).toBe('');
    expect(orderQuery({ ...none, booking: 'done', money: 'payout_failed', q: ' P2026 ', page: 2 })).toBe('?booking=done&money=payout_failed&q=P2026&page=2');
    expect(orderQuery({ ...none, from: '2026-11-01', to: '2026-11-30' })).toBe('?from=2026-11-01&to=2026-11-30');
  });

  it('calls the list, the detail and the address', async () => {
    const urls: string[] = [];
    const fake = (async (u: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? 'GET'} ${u}`);
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    await listOrders({ ...none, money: 'refunded' }, fake);
    await getOrder(7, fake);
    await showAddress(7, fake);
    expect(urls).toEqual(['GET /api/admin/orders?money=refunded', 'GET /api/admin/orders/7', 'POST /api/admin/orders/7/address']);
  });
});

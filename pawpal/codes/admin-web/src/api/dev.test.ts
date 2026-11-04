import { describe, expect, it } from 'vitest';
import { START_OPTIONS, addTestVisit, expireRequest, visitSoon, markOrderSettled, STATUS_OPTIONS, alertSummary, sendRequestAlert, sendTestMessage, setCaregiverStatus } from './dev';

describe('admin test tools', () => {
  it('posts the caregiver status with a reason', async () => {
    let body = '';
    const fake = (async (_u: string, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ id: 1, caregiverStatus: 'approved' }), { status: 201 });
    }) as unknown as typeof fetch;
    expect(await setCaregiverStatus('012-345 6789', 'approved', 'Checked IC', fake)).toMatchObject({ caregiverStatus: 'approved' });
    expect(JSON.parse(body)).toEqual({ phone: '012-345 6789', status: 'approved', reason: 'Checked IC' });
  });

  it('sends a test message; the payment id only with a payment link', async () => {
    const bodies: unknown[] = [];
    const fake = (async (_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 9 }), { status: 201 });
    }) as unknown as typeof fetch;
    const m = { phone: '0123456789', role: 'caregiver' as const, category: 'order' as const, title: 'T', body: 'B', linkType: '' as const, linkId: 5 };
    await sendTestMessage(m, fake);
    await sendTestMessage({ ...m, linkType: 'payment' }, fake);
    expect(bodies).toEqual([
      { phone: '0123456789', role: 'caregiver', category: 'order', title: 'T', body: 'B', linkType: '' },
      { phone: '0123456789', role: 'caregiver', category: 'order', title: 'T', body: 'B', linkType: 'payment', linkId: 5 },
    ]);
  });

  it('sends a request alert and sums up the channels', async () => {
    let body = '';
    const fake = (async (_u: string, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ messageId: 1, reminderAt: null, results: [{ channel: 'push', status: 'skipped', detail: '' }, { channel: 'whatsapp', status: 'sent', detail: '' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const sent = await sendRequestAlert('0123456789', { urgent: true, minutesLeft: 24, firstVisit: '10/28 09:00', visits: 3, area: 'Bangsar' }, fake);
    expect(JSON.parse(body)).toEqual({ phone: '0123456789', urgent: true, minutesLeft: 24, firstVisit: '10/28 09:00', visits: 3, area: 'Bangsar' });
    expect(alertSummary(sent)).toBe('Push skipped · WhatsApp sent');
  });

  it('lists every caregiver status', () => {
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual(['none', 'pending', 'approved', 'rejected', 'suspended']);
  });


  it('E4-5 test visit: start times and the call', async () => {
    expect(START_OPTIONS[0]).toEqual({ value: 420, label: '7:00 am' });
    expect(START_OPTIONS.at(-1)).toEqual({ value: 1320, label: '10:00 pm' });
    let body = '';
    const fake = (async (_url: string, init?: RequestInit) => {
      body = init?.body as string;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await addTestVisit('0123456789', '2026-11-01', 600, 45, fake);
    expect(JSON.parse(body)).toEqual({ phone: '0123456789', date: '2026-11-01', start: 600, minutes: 45 });
  });

  it('E5-7 mark order settled: sends the order number in capitals', async () => {
    let body = '';
    const fake = (async (_url: string, init?: RequestInit) => {
      body = init?.body as string;
      return new Response('{"number":"P1","rewarded":true}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await markOrderSettled(' p123 ', fake)).toEqual({ number: 'P1', rewarded: true });
    expect(JSON.parse(body)).toEqual({ number: 'P123' });
  });

  it('E6-1 expire a request: sends the order number in capitals', async () => {
    let body = '';
    const fake = (async (_url: string, init?: RequestInit) => {
      body = init?.body as string;
      return new Response('{"number":"P1"}', { status: 200 });
    }) as unknown as typeof fetch;
    await expireRequest(' p20261102001 ', fake);
    expect(JSON.parse(body)).toEqual({ number: 'P20261102001' });
  });

  it('moves a visit to start soon, counting visits from 1', async () => {
    let body = '';
    const fake = (async (_u: string, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ number: 'P20261102001', date: '2026-11-02', start: 600 }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await visitSoon(' p20261102001 ', 2, fake)).toMatchObject({ start: 600 });
    expect(JSON.parse(body)).toEqual({ number: 'P20261102001', index: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { menuFor } from '../session';
import { sentryOptions } from '../sentry';
import { fetchFunnel, ofPreviousText } from './funnel';

describe('E15-3 monitoring in admin', () => {
  it('reads the funnel for 7 or 30 days (R61-4)', async () => {
    const calls: [string, string][] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push([url, init?.method ?? 'GET']);
      return new Response(JSON.stringify({ days: 30, from: '2026-10-26', to: '2026-11-24', steps: [], byDay: [] }));
    }) as unknown as typeof fetch;
    expect(await fetchFunnel(30, fake)).toMatchObject({ days: 30 });
    expect(calls).toEqual([['/api/admin/funnel?days=30', 'GET']]);
    expect(ofPreviousText(null)).toBe('–');
    expect(ofPreviousText(45)).toBe('45%');
    expect(menuFor({ pages: ['funnel'] })).toEqual([{ page: 'funnel', path: '/funnel', label: 'Funnel' }]);
  });

  it('never sends the user or private numbers to Sentry (R61-1)', () => {
    const o = sentryOptions('https://key@sentry.example/1');
    expect(o.sendDefaultPii).toBe(false);
    const e = o.beforeSend({ user: { id: 4 }, message: 'Owner 0123456789 at IC 900101-14-5678', extra: { address: '12 Jalan Ampang' } });
    expect(e).toEqual({ message: 'Owner [removed] at IC [removed]', extra: { address: '[removed]' } });
  });
});

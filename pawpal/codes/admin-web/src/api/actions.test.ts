import { describe, expect, it } from 'vitest';
import { actionQuery, listActions } from './actions';

describe('E14-4 action log page', () => {
  it('leaves empty filters out of the query (R60-4)', () => {
    expect(actionQuery({ admin: '', kind: '', from: '', to: '', page: 1 })).toBe('');
    expect(actionQuery({ admin: 'kf', kind: 'money', from: '2026-11-01', to: '2026-11-23', page: 2 })).toBe('?admin=kf&kind=money&from=2026-11-01&to=2026-11-23&page=2');
  });

  it('only reads the log (R60-3)', async () => {
    const calls: [string, string][] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push([url, init?.method ?? 'GET']);
      return new Response(JSON.stringify({ rows: [], total: 0, page: 1, admins: [] }));
    }) as unknown as typeof fetch;
    expect(await listActions({ admin: '', kind: 'login', from: '', to: '', page: 1 }, fake)).toMatchObject({ total: 0 });
    expect(calls).toEqual([['/api/admin/actions?kind=login', 'GET']]);
  });
});

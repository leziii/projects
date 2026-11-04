import { describe, expect, it } from 'vitest';
import { fetchHealth, healthLabel } from './health';

const ok = { status: 'ok', database: 'up', redis: 'up', version: '0.1.0' } as const;

describe('admin health', () => {
  it('reads the server health report', async () => {
    const fake = (async () => new Response(JSON.stringify(ok))) as unknown as typeof fetch;
    expect(await fetchHealth(fake)).toEqual(ok);
  });

  it('returns null when the server is down', async () => {
    const fake = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await fetchHealth(fake)).toBeNull();
  });

  it('labels each state', () => {
    expect(healthLabel(ok)).toBe('All systems OK');
    expect(healthLabel({ ...ok, status: 'degraded', redis: 'down' })).toBe('Degraded (database up, Redis down)');
    expect(healthLabel(null)).toBe('Server not reachable');
  });
});

import { describe, expect, it } from 'vitest';
import { fetchHealth, healthLabel } from './health';

const ok = { status: 'ok', database: 'up', redis: 'up', version: '0.1.0' } as const;

describe('mobile health', () => {
  it('reads the server health report', async () => {
    expect(await fetchHealth(async () => ({ statusCode: 200, data: ok }))).toEqual(ok);
  });

  it('returns null on error status or network failure', async () => {
    expect(await fetchHealth(async () => ({ statusCode: 500, data: null }))).toBeNull();
    expect(await fetchHealth(async () => { throw new Error('offline'); })).toBeNull();
  });

  it('labels each state', () => {
    expect(healthLabel(ok)).toBe('All systems OK');
    expect(healthLabel(null)).toBe('Server not reachable');
  });
});

import { describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('uni', {
  getStorageSync: (k: string) => store.get(k) ?? '',
  setStorageSync: (k: string, v: string) => store.set(k, v),
  removeStorageSync: (k: string) => store.delete(k),
  redirectTo: vi.fn(),
});

const { trackStep, visitorId } = await import('./funnel');
const { sentryOptions } = await import('../sentry');

describe('E15-3 monitoring in the app', () => {
  it('keeps one random visitor id per phone (R61-4)', () => {
    const id = visitorId();
    expect(id).toMatch(/^v-[a-z0-9]+-[a-z0-9]+$/);
    expect(visitorId()).toBe(id);
  });

  it('reports a step and never breaks the page when the server fails', async () => {
    const send = vi.fn(async () => ({ statusCode: 200, data: { ok: true } }));
    await trackStep('setup', send, 'v-12345678');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/funnel', method: 'POST', data: { step: 'setup', visitor: 'v-12345678' } }));
    await expect(trackStep('home', async () => ({ statusCode: 500, data: {} }), 'v-12345678')).resolves.toBeUndefined();
    await expect(trackStep('home', () => Promise.reject(new Error('offline')), 'v-12345678')).resolves.toBeUndefined();
  });

  it('never sends the user or private numbers to Sentry (R61-1)', () => {
    const o = sentryOptions('https://key@sentry.example/1');
    expect(o.sendDefaultPii).toBe(false);
    expect(o.beforeSend({ user: { id: 1 }, message: 'Call 012-345 6789' })).toEqual({ message: 'Call [removed]' });
  });
});

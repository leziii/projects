import { describe, expect, it } from 'vitest';
import { failureDetails, keyBytes, pushSupport, resultSummary } from './alerts';

const base = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0', standalone: false, hasServiceWorker: true, hasPush: true, permission: 'default' };

describe('push alerts on this phone', () => {
  it('knows when push can work', () => {
    expect(pushSupport(base)).toBe('available');
    expect(pushSupport({ ...base, permission: 'denied' })).toBe('blocked');
    expect(pushSupport({ ...base, hasPush: false })).toBe('unsupported');
    expect(pushSupport({ ...base, permission: null })).toBe('unsupported');
    expect(pushSupport({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1' })).toBe('install-first');
    expect(pushSupport({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1', standalone: true })).toBe('available');
  });

  it('turns the server key into bytes', () => {
    expect([...keyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });

  it('sums up where a test alert went', () => {
    expect(
      resultSummary([
        { channel: 'push', status: 'failed', detail: '' },
        { channel: 'push', status: 'sent', detail: '' },
        { channel: 'whatsapp', status: 'failed', detail: '' },
        { channel: 'sms', status: 'sent', detail: '' },
      ]),
    ).toBe('Push: sent · WhatsApp: failed · SMS: sent');
    expect(failureDetails([{ channel: 'push', status: 'failed', detail: 'Push service said 403: invalid JWT' }, { channel: 'whatsapp', status: 'sent', detail: 'ok' }])).toEqual([
      'Push: Push service said 403: invalid JWT',
    ]);
    expect(resultSummary([{ channel: 'push', status: 'skipped', detail: '' }, { channel: 'whatsapp', status: 'skipped', detail: '' }])).toBe('Push: off · WhatsApp: off');
  });
});

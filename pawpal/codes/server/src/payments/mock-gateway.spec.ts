import { describe, expect, it } from 'vitest';
import { MOCK_SIGNATURE_HEADER, MockGateway } from './mock-gateway';

describe('MockGateway', () => {
  it('signs webhooks it sends and accepts them back', async () => {
    const gw = new MockGateway('secret');
    const ref = await gw.createCharge();
    const hook = gw.settle(ref, 'success');
    expect(hook).not.toBeNull();
    expect(gw.parseWebhook(hook!.rawBody, hook!.headers)).toMatchObject({ gatewayRef: ref, type: 'payment.succeeded' });
    expect(await gw.query(ref)).toBe('succeeded');
  });

  it('rejects a webhook signed with another secret or changed body', async () => {
    const gw = new MockGateway('secret');
    const hook = gw.settle(await gw.createCharge(), 'failure')!;
    const other = new MockGateway('other');
    expect(() => other.parseWebhook(hook.rawBody, hook.headers)).toThrow('Bad webhook signature');
    const changed = Buffer.from(hook.rawBody.toString().replace('failed', 'succeeded'));
    expect(() => gw.parseWebhook(changed, hook.headers)).toThrow('Bad webhook signature');
    expect(() => gw.parseWebhook(hook.rawBody, { [MOCK_SIGNATURE_HEADER]: undefined })).toThrow();
  });

  it('unknown outcome sends no webhook but query knows the result', async () => {
    const gw = new MockGateway('secret');
    const ref = await gw.createPayout();
    expect(gw.settle(ref, 'unknown')).toBeNull();
    expect(gw.lastWebhook(ref)).toBeNull();
    expect(await gw.query(ref)).toBe('succeeded');
  });

  it('knows nothing about payments it never opened', async () => {
    const gw = new MockGateway('secret');
    expect(gw.knows('nope')).toBe(false);
    expect(gw.settle('nope', 'success')).toBeNull();
    expect(await gw.query('nope')).toBe('pending');
  });

  it('takes back an open payment it forgot after a server restart', () => {
    const gw = new MockGateway('secret');
    gw.adopt('mock_ch_old');
    expect(gw.knows('mock_ch_old')).toBe(true);
    expect(gw.settle('mock_ch_old', 'success')).not.toBeNull();
  });
});

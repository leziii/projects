import type { StatusChange } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { fetchHistory, stepLabel, whoWhy } from './history';

const change = (over: Partial<StatusChange> = {}): StatusChange => ({
  id: 1,
  entity: 'payment',
  entityId: 7,
  fromStatus: 'pending',
  toStatus: 'succeeded',
  actorType: 'gateway',
  actorId: null,
  reason: 'Gateway webhook evt_1',
  createdAt: '2026-10-24 16:00:00.000',
  ...over,
});

describe('admin status history', () => {
  it('loads history for one object', async () => {
    let url = '';
    const fake = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify([change()]));
    }) as unknown as typeof fetch;
    expect(await fetchHistory('payment', 7, fake)).toHaveLength(1);
    expect(url).toBe('/api/history/payment/7');
  });

  it('describes each step', () => {
    expect(stepLabel(change({ fromStatus: null, toStatus: 'pending' }))).toBe('Created → Pending');
    expect(stepLabel(change())).toBe('Pending → Succeeded');
  });

  it('says who and why', () => {
    expect(whoWhy(change())).toBe('Gateway · Gateway webhook evt_1');
    expect(whoWhy(change({ actorType: 'admin', actorId: 'kf', reason: 'Checked with bank' }))).toBe('Admin (kf) · Checked with bank');
  });
});

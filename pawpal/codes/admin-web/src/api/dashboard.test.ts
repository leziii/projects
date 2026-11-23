import { describe, expect, it } from 'vitest';
import { getQueues } from './dashboard';

describe('E14-1 dashboard', () => {
  it('reads the queue counts', async () => {
    const urls: string[] = [];
    const fake = (async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify([{ key: 'pets', count: 2 }]), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await getQueues(fake)).toEqual([{ key: 'pets', count: 2 }]);
    expect(urls).toEqual(['/api/admin/dashboard/queues']);
  });
});

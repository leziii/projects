import type { StatusChange } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { decidePet, fetchPetQueue, petStep, reasonHint, reasonsText } from './pets';

describe('E3-3 admin pet check', () => {
  it('loads the queue and posts a decision', async () => {
    const calls: { url: string; body?: string }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      return new Response(JSON.stringify(init?.body ? { id: 4, status: 'needs_info' } : []), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchPetQueue(fake)).toEqual([]);
    await decidePet(4, 'needs_info', 'Upload the card', fake);
    expect(calls).toEqual([{ url: '/api/admin/pets', body: undefined }, { url: '/api/admin/pets/4/decision', body: JSON.stringify({ status: 'needs_info', note: 'Upload the card' }) }]);
  });

  it('labels reasons, history steps and the reason box', () => {
    expect(reasonsText(['senior', 'no_vaccine'])).toBe('Senior pet, Not vaccinated');
    expect(reasonsText([])).toBe('—');
    expect(petStep({ fromStatus: null, toStatus: 'pending' } as StatusChange)).toBe('Created → Pending check');
    expect(petStep({ fromStatus: 'pending', toStatus: 'rejected' } as StatusChange)).toBe('Pending check → Not accepted');
    expect(reasonHint('approved').required).toBe(false);
    expect(reasonHint('rejected').required).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { listProblems, startProblemReview } from './cases';

describe('E12-1 caregiver reports on Cases', () => {
  it('lists reports and starts a review', async () => {
    const urls: string[] = [];
    const fake = (async (u: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? 'GET'} ${u}`);
      return new Response(JSON.stringify([{ id: 4, status: 'reviewing' }]), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await listProblems(fake)).toEqual([{ id: 4, status: 'reviewing' }]);
    await startProblemReview(4, fake);
    expect(urls.map((u) => u.replace(/^(\w+) .*?(\/api\/)/, '$1 $2'))).toEqual(['GET /api/admin/problems', 'POST /api/admin/problems/4/review']);
  });
});

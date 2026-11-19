import { describe, expect, it } from 'vitest';
import { contactLine, decideException, exceptionStatusText, exceptionVisitText, findCandidates, getException, listExceptions, offerSubstitute, refundPreview } from './exceptions';

describe('E12-3 exceptions', () => {
  it('calls the queue, the detail and the decision', async () => {
    const urls: string[] = [];
    const fake = (async (u: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? 'GET'} ${u} ${init?.body ?? ''}`.trim());
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;
    await listExceptions(fake);
    await getException(7, 0, fake);
    await decideException(7, 0, { fault: 'none', refundPercent: 100, reason: 'Storm' }, fake);
    await findCandidates(7, 0, [{ index: 0, start: 600 }, { index: 1, start: 540 }], fake);
    await offerSubstitute(7, 0, { caregiverId: 3, visits: [{ index: 0, start: 600 }], reason: 'Unwell' }, fake);
    expect(urls.map((u) => u.replace(/^(\w+) .*?(\/api\/)/, '$1 $2'))).toEqual([
      'GET /api/admin/exceptions',
      'GET /api/admin/exceptions/7/0',
      'POST /api/admin/exceptions/7/0/decide {"fault":"none","refundPercent":100,"reason":"Storm"}',
      'GET /api/admin/exceptions/7/0/candidates?visits=0:600,1:540',
      'POST /api/admin/exceptions/7/0/substitute {"caregiverId":3,"visits":[{"index":0,"start":600}],"reason":"Unwell"}',
    ]);
  });

  it('words the rows and the refund (R51-1, R51-3)', () => {
    expect(exceptionVisitText({ date: '2026-11-20', start: 600, index: 0 })).toBe('Fri 20 Nov · 10:00 am · visit 1');
    expect(exceptionStatusText({ status: 'open', fault: null, substitute: null })).toBe('To decide');
    expect(exceptionStatusText({ status: 'decided', fault: 'owner', substitute: null })).toBe('Owner at fault (no handover)');
    // E12-4 (R52-1, R52-4, R52-5)
    expect(exceptionStatusText({ status: 'offered', fault: null, substitute: 'waiting' })).toBe('Substitute offered');
    expect(exceptionStatusText({ status: 'decided', fault: null, substitute: 'approved' })).toBe('Substitute approved');
    expect(exceptionStatusText({ status: 'decided', fault: 'no_substitute', substitute: 'declined' })).toBe('No substitute');
    expect(contactLine({ id: 1, method: 'called', note: 'no answer', at: '2026-11-20 09:51:00.000' })).toBe('Called · no answer · 9:51 am');
    expect(refundPreview(4000, 50)).toBe('RM20 of RM40');
  });
});

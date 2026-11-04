import type { StatusChange } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { ageOfExperience, appStep, changeBlock, decideApplication, decideChange, decisionBlock, fetchReviewList } from './caregivers';

describe('E4-2 admin caregiver review', () => {
  it('loads a filter and posts a decision', async () => {
    const calls: { url: string; body?: string }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      return new Response(JSON.stringify(init?.body ? {} : []), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchReviewList('needs_info', fake);
    await decideApplication(3, { status: 'approved', note: '', idChecked: true, certChecked: false }, fake);
    expect(calls.map((c) => c.url)).toEqual(['/api/admin/caregivers?status=needs_info', '/api/admin/caregivers/3/decision']);
    expect(JSON.parse(calls[1].body ?? '')).toEqual({ status: 'approved', note: '', idChecked: true, certChecked: false });
  });

  it('submit rules: IC tick, same approved IC, reasons', () => {
    expect(decisionBlock({ status: '', note: '', idChecked: false }, [])).toBe('Choose a decision');
    expect(decisionBlock({ status: 'approved', note: '', idChecked: false }, [])).toContain('Tick');
    expect(decisionBlock({ status: 'approved', note: '', idChecked: true }, [])).toBe('');
    expect(decisionBlock({ status: 'approved', note: '', idChecked: true }, [{ phone: '+60 11-1', status: 'approved' }])).toContain('already approved');
    expect(decisionBlock({ status: 'approved', note: '', idChecked: true }, [{ phone: '+60 11-1', status: 'rejected' }])).toBe('');
    expect(decisionBlock({ status: 'rejected', note: 'no', idChecked: false }, [])).toContain('reason');
    expect(decisionBlock({ status: 'needs_info', note: 'Retake the selfie', idChecked: false }, [])).toBe('');
  });

  it('labels', () => {
    expect(appStep({ fromStatus: 'submitted', toStatus: 'needs_info' } as StatusChange)).toBe('Under review → Needs info');
    expect(appStep({ fromStatus: null, toStatus: 'submitted' } as StatusChange)).toBe('Created → Under review');
    expect(ageOfExperience(1)).toBe('1 year');
    expect(ageOfExperience(null)).toBe('—');
  });

  it('profile changes: decision call and submit rule', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await decideChange(5, 'rejected', 'Blurry photo', fake);
    expect(calls).toEqual(['/api/admin/profile-changes/5/decision']);
    expect(changeBlock('', '')).toBe('Choose a decision');
    expect(changeBlock('approved', '')).toBe('');
    expect(changeBlock('rejected', 'no')).toContain('reason');
  });
});

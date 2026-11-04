import { DEFAULT_RULES } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { fetchInsurance, fetchRules, fetchSupport, insuranceBlock, ruleSummary, saveInsurance, supportSummary } from './rules';

describe('admin rules page', () => {
  it('loads rules from the server', async () => {
    const fake = (async () => new Response(JSON.stringify(DEFAULT_RULES))) as unknown as typeof fetch;
    expect(await fetchRules(fake)).toEqual(DEFAULT_RULES);
  });

  it('returns null when the server is down', async () => {
    const fake = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchRules(fake)).toBeNull();
  });

  it('summarises the settled rules', () => {
    const rows = Object.fromEntries(ruleSummary(DEFAULT_RULES).map((r) => [r.item, r.rule]));
    expect(rows['Capacity']).toBe('Max 3 pets, max 2 dogs');
    expect(rows['Accept window']).toBe('<3 h: fail · 3–6 h: urgent, 30 min · ≥6 h: normal, 3 h');
    expect(rows['Cancel refund']).toBe('≥24 h: 100% · 1–24 h: 80% · <1 h: 0%');
    expect(rows['Waiting']).toBe('First 10 min free, then RM5 per 10 min, max 60 min');
    expect(rows['Split']).toBe('Caregiver 85%, platform 15%');
    expect(rows['Report']).toBe('Min 3 photos, confirm within 12 h');
    expect(rows['Booking']).toBe('7:00–22:00 · up to 60 days ahead · max 20 days per order · max 3 visits/day');
  });
});

describe('E2-6 support number on the rules page', () => {
  it('shows the number, the placeholder, or that it is missing', () => {
    expect(supportSummary({ whatsapp: '60198765432', placeholder: false })).toBe('+60 19-876 5432');
    expect(supportSummary({ whatsapp: '60123456789', placeholder: true })).toBe('+60 12-345 6789 (placeholder) · set SUPPORT_WHATSAPP in server/.env');
    expect(supportSummary({ whatsapp: null, placeholder: false })).toBe('Not set · set SUPPORT_WHATSAPP in server/.env');
    expect(supportSummary(null)).toBe('Server not reachable');
  });

  it('loads the support number', async () => {
    const info = { whatsapp: '60123456789', placeholder: true };
    const fake = (async () => new Response(JSON.stringify(info))) as unknown as typeof fetch;
    expect(await fetchSupport(fake)).toEqual(info);
  });
});

describe('E4-6 insurance switch on the rules page', () => {
  const off = { on: false, note: '' };
  it('says why Save is off', () => {
    expect(insuranceBlock({ ...off, reason: '' }, off)).toBe('Nothing changed');
    expect(insuranceBlock({ on: true, note: 'abc', reason: 'Policy signed' }, off)).toBe('Write what the insurance covers (at least 5 characters)');
    expect(insuranceBlock({ on: true, note: 'x'.repeat(151), reason: 'Policy signed' }, off)).toBe('Note: at most 150 characters');
    expect(insuranceBlock({ on: true, note: 'Pet injury cover', reason: 'ok' }, off)).toBe('Give a reason for the change (at least 5 characters)');
    expect(insuranceBlock({ on: true, note: 'Pet injury cover', reason: 'Policy signed' }, off)).toBe('');
    expect(insuranceBlock({ on: false, note: 'Pet injury cover', reason: 'Policy ended' }, { on: true, note: 'Pet injury cover' })).toBe('');
  });

  it('loads and saves through the admin API', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ insurance: { on: true, note: 'Pet injury cover' }, history: [] }));
    }) as unknown as typeof fetch;
    expect((await fetchInsurance(fake)).insurance.on).toBe(true);
    await saveInsurance({ on: true, note: 'Pet injury cover', reason: 'Policy signed' }, fake);
    expect(calls.map(([u, i]) => [u, i?.method])).toEqual([
      ['/api/admin/insurance', 'GET'],
      ['/api/admin/insurance', 'POST'],
    ]);
  });
});

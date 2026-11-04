import { quoteVisit, type BookingDraft } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { FIX_URL, OVERTIME_OPTIONS, addVisit, draftInput, levelOptions, lineText, nextHint, nextStep, removeVisit, visitDays } from './booking';

describe('booking setup page (E5-1)', () => {
  it('level choice depends on the pets', () => {
    expect(levelOptions(['cat'])).toEqual([]);
    expect(levelOptions(['dog']).map((o) => o.label)).toEqual(['Basic · ≥20 min', 'Upgrade · ≥60 min']);
    expect(levelOptions(['dog', 'cat']).map((o) => o.label)).toEqual(['Basic · ≥45 min', 'Upgrade · ≥60 min']);
    expect(OVERTIME_OPTIONS.map((o) => o.label)).toEqual(['None', '+15 min', '+30 min', '+45 min', '+60 min']);
  });

  it('adds, sorts, groups and removes visits', () => {
    let v = addVisit([], { date: '2026-11-02', start: 600 });
    v = addVisit(v, { date: '2026-11-01', start: 1080 });
    v = addVisit(v, { date: '2026-11-01', start: 540 });
    expect(addVisit(v, { date: '2026-11-01', start: 540 })).toBe(v);
    expect(visitDays(v)).toEqual([
      { date: '2026-11-01', title: 'Sun 1 Nov', visits: [{ date: '2026-11-01', start: 540, time: '9:00 am' }, { date: '2026-11-01', start: 1080, time: '6:00 pm' }] },
      { date: '2026-11-02', title: 'Mon 2 Nov', visits: [{ date: '2026-11-02', start: 600, time: '10:00 am' }] },
    ]);
    expect(removeVisit(v, { date: '2026-11-01', start: 540 })).toHaveLength(2);
  });

  it('price line and Next hint', () => {
    expect(lineText(quoteVisit(['dog', 'cat'], 'basic', 1))).toBe('Dog + cats RM70 + overtime RM10 = RM80 · 60 min');
    expect(lineText(quoteVisit(['dog', 'dog'], 'upgrade'))).toBe('Dog RM70 + extra pet RM10 = RM80 · 60 min');
    expect(lineText(quoteVisit(['cat'], 'basic'))).toBe('Cat RM40 = RM40 · 30 min');
    const d = { petIds: [1], level: 'basic', overtimeUnits: 0, addressId: 2, visits: [], summary: { lines: [], total: 0, blocks: ['Add at least one visit'], waitsForCheck: [] }, caregiver: null, caregiverNote: null, entry: null, promoCode: null } as BookingDraft;
    expect(nextHint(d)).toBe('Add at least one visit');
    expect(nextHint({ ...d, summary: { ...d.summary, blocks: [] } })).toBe('Ready. Choose a caregiver next.');
    expect(nextHint({ ...d, summary: { ...d.summary, blocks: [] }, caregiver: { id: 3, displayName: 'Siti A.' } })).toBe('Caregiver chosen. Next: tell them how to get in.');
    expect(nextStep(d)).toEqual({ label: 'Next: choose a caregiver', url: '/pages/booking/caregivers' });
    expect(nextStep({ ...d, caregiver: { id: 3, displayName: 'Siti A.' } })).toEqual({ label: 'Next: how to get in', url: '/pages/booking/entry' });
    const chosen = { ...d, summary: { ...d.summary, blocks: [] }, caregiver: { id: 3, displayName: 'Siti A.' }, entry: { method: 'live_confirm' as const, keyLock: '', guard: '', notes: '' } };
    expect(nextHint(chosen)).toBe('All set. Next: check everything and pay.');
    expect(nextStep(chosen)).toEqual({ label: 'Next: confirm and pay', url: '/pages/booking/confirm' });
    expect(Object.values(FIX_URL).map((f) => f.url)).toEqual(['/pages/booking/index', '/pages/pets/index', '/pages/booking/caregivers', '/pages/booking/entry']);
    expect(draftInput(d)).toEqual({ petIds: [1], level: 'basic', overtimeUnits: 0, addressId: 2, visits: [] });
  });
});

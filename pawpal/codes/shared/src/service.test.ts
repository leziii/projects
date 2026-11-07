import { describe, expect, it } from 'vitest';
import { SERVICE_RULES, checklistFor, finishEarlyText, isCheckItem, photoCountText, servedMinutes, servedText } from './service';

describe('E8-4 record service', () => {
  it('builds the checklist from the pets (R36-3)', () => {
    expect(checklistFor([{ kind: 'cat' }])).toEqual(['feed', 'water', 'litter']);
    expect(checklistFor([{ kind: 'dog' }])).toEqual(['feed', 'water', 'walk']);
    expect(checklistFor([{ kind: 'dog' }, { kind: 'cat' }])).toEqual(['feed', 'water', 'litter', 'walk']);
    expect(isCheckItem('walk')).toBe(true);
    expect(isCheckItem('nap')).toBe(false);
  });

  it('counts whole minutes from entry and shows them against the minimum (R36-2)', () => {
    const now = new Date('2026-11-04T01:25:59Z'); // 9:25:59 am KL
    expect(servedMinutes('2026-11-04 09:02:10.000', now)).toBe(23);
    expect(servedMinutes('2026-11-04 09:30:00.000', now)).toBe(0);
    expect(servedText(23, 45)).toBe('Served 23 min / at least 45 min');
  });

  it('asks before finishing under the minimum only (R36-5)', () => {
    expect(finishEarlyText(23, 45)).toBe('You have served 23 of 45 min. Finish anyway?');
    expect(finishEarlyText(45, 45)).toBeNull();
  });

  it('allows up to 9 photos (R36-4)', () => {
    expect(SERVICE_RULES.maxPhotos).toBe(9);
    expect(photoCountText(3)).toBe('3 of 9 photos');
  });
});

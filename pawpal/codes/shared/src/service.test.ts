import { describe, expect, it } from 'vitest';
import { SERVICE_RULES, checkByText, confirmByOf, confirmByText, reportReadyText, reportSentText, reportProblems, sentText, checklistFor, finishEarlyText, isCheckItem, photoCountText, servedMinutes, servedText } from './service';

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

  it('needs 3 photos, and a note when an item is not ticked (R37-1)', () => {
    const checklist = [{ item: 'feed' as const, done: true }, { item: 'walk' as const, done: false }];
    expect(reportProblems({ photos: [1, 2], checklist, note: '' })).toEqual(['Add at least 3 photos (2 so far)', 'Add a note on why Walk was not done']);
    expect(reportProblems({ photos: [1, 2, 3], checklist, note: 'Raining, played indoors' })).toEqual([]);
    expect(reportProblems({ photos: [1, 2, 3], checklist: checklist.map((c) => ({ ...c, done: true })), note: '' })).toEqual([]);
    expect(reportProblems({ photos: [1, 2, 3], checklist: [{ item: 'litter', done: false }, { item: 'walk', done: false }], note: '' })[0]).toBe('Add a note on why Litter, Walk were not done');
    expect(reportProblems({ photos: [1, 2, 3], checklist: [], note: 'x'.repeat(501) })).toEqual(['Keep the note under 500 characters']);
  });

  it('gives the owner 12 h from sending (R37-4)', () => {
    expect(confirmByOf('2026-11-04 09:51:20.123')).toBe('2026-11-04 21:51:20');
    expect(confirmByText('2026-11-04 09:51:20.123')).toBe('9:51 pm, Wed 4 Nov');
    // E9-1 (R39-1, R39-2)
    expect(checkByText('2026-11-04 09:51:20.123')).toBe('Please check by 9:51 pm, Wed 4 Nov');
    expect(reportSentText('2026-11-04 09:51:20.123')).toBe('Sent 9:51 am, Wed 4 Nov');
    expect(reportReadyText('2026-11-04 09:51:20.123', new Date('2026-11-04T02:00:00Z'))).toBe('Report ready · check by 9:51 pm');
    expect(reportReadyText('2026-11-04 15:10:00.000', new Date('2026-11-04T08:00:00Z'))).toBe('Report ready · check by 3:10 am, Thu 5 Nov');
    expect(sentText('2026-11-04 09:51:20.123', new Date('2026-11-04T02:00:00Z'))).toBe('Sent 9:51 am · owner confirms by 9:51 pm');
    expect(sentText('2026-11-04 15:10:00.000', new Date('2026-11-04T08:00:00Z'))).toBe('Sent 3:10 pm · owner confirms by 3:10 am, Thu 5 Nov');
  });
});

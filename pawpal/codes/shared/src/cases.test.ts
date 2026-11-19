import { describe, expect, it } from 'vitest';
import { CASE_KIND_LABEL, caseKindsFor, caseOpen, caseProblem, caseTimeline, checkCase, checkCaseNote, confirmedText } from './cases';

describe('E9-2 confirm or raise a problem', () => {
  it('needs a type and a description up to 500 characters (R40-3)', () => {
    expect(caseProblem({})).toBe('Choose what went wrong');
    expect(caseProblem({ kind: 'late', description: '  ' })).toBe('Describe the problem');
    expect(caseProblem({ kind: 'other', description: 'x'.repeat(501) })).toBe('Keep it under 500 characters');
    expect(checkCase({ kind: 'report', description: ' Litter not cleaned ' })).toEqual({ kind: 'report', description: 'Litter not cleaned' });
    expect(() => checkCase({ kind: 'bad', description: 'x' })).toThrow('Choose what went wrong');
    expect(CASE_KIND_LABEL.no_entry).toBe("Couldn't get in");
  });

  it('says who confirmed and when (R40-1, R40-2)', () => {
    expect(confirmedText('2026-11-05 10:30:00.000', 'owner', 'owner')).toBe('Confirmed 10:30 am, Thu 5 Nov by you');
    expect(confirmedText('2026-11-05 22:00:00.000', 'owner', 'caregiver')).toBe('Confirmed 10:00 pm, Thu 5 Nov by the owner');
    expect(confirmedText('2026-11-05 22:00:00.000', 'auto', 'owner')).toBe('Confirmed 10:00 pm, Thu 5 Nov automatically after 12 h');
  });
});

describe('E12-2 owner follows a case', () => {
  it('offers types from acceptance; Report problem only once the report waits (R50-1)', () => {
    expect(caseKindsFor('accepted', 'todo')).toEqual(['late', 'no_entry', 'no_show', 'other']);
    expect(caseKindsFor('accepted', 'in_service')).toEqual(['late', 'no_entry', 'no_show', 'other']);
    expect(caseKindsFor('accepted', 'report_sent')).toEqual(['report', 'late', 'no_entry', 'other']);
    expect(caseKindsFor('accepted', 'confirmed')).toEqual([]);
    expect(caseKindsFor('accepted', 'cancelled')).toEqual([]);
    expect(caseKindsFor('paid', 'todo')).toEqual([]);
    expect(CASE_KIND_LABEL.no_show).toBe("Caregiver didn't come");
  });

  it('shows Sent → Under review → Decided and keeps notes short (R50-2 … R50-4)', () => {
    const t = caseTimeline({ createdAt: '2026-11-05 10:30:00.000', reviewingAt: '2026-11-05 11:00:00.000', decidedAt: null });
    expect(t.map((s) => [s.label, s.at])).toEqual([['Sent', '2026-11-05 10:30:00.000'], ['Under review', '2026-11-05 11:00:00.000'], ['Decided', null]]);
    expect(caseOpen({ status: 'reviewing' })).toBe(true);
    expect(caseOpen({ status: 'decided' })).toBe(false);
    expect(checkCaseNote(' Door code was 1234 ')).toBe('Door code was 1234');
    expect(() => checkCaseNote(' ')).toThrow('Write a note');
    expect(() => checkCaseNote('x'.repeat(301))).toThrow('Keep it under 300 characters');
  });
});

import { describe, expect, it } from 'vitest';
import { CASE_KIND_LABEL, caseProblem, checkCase, confirmedText } from './cases';

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

import { describe, expect, it } from 'vitest';
import { checkContact, contactText, problemKindsFor, problemProblem } from './problems';

describe('E12-1 caregiver problem reports', () => {
  it('offers types by visit status (R49-1, R49-2)', () => {
    expect(problemKindsFor('todo')).toEqual(['late', 'no_entry', 'pets_mismatch', 'cannot_serve']);
    expect(problemKindsFor('in_service')).toHaveLength(4);
    expect(problemKindsFor('disputed')).toEqual(['dispute_evidence']);
    expect(problemKindsFor('report_sent')).toEqual([]);
    expect(problemKindsFor('cancelled')).toEqual([]);
  });

  it('needs a type that fits and a description (R49-2)', () => {
    expect(problemProblem({ kind: 'no_entry', description: 'Code wrong' }, 'arrived')).toBe('');
    expect(problemProblem({ kind: 'dispute_evidence', description: 'x' }, 'arrived')).toBe('Choose what went wrong');
    expect(problemProblem({ kind: 'no_entry', description: '  ' }, 'arrived')).toBe('Describe the problem');
    expect(problemProblem({ kind: 'no_entry', description: 'x'.repeat(501) }, 'arrived')).toBe('Keep it under 500 characters');
    expect(problemProblem({ kind: 'late', description: 'x' }, 'confirmed')).toBe('Problems can be reported from acceptance until the report is sent');
  });

  it('checks and shows contact tries (R49-3)', () => {
    expect(checkContact({ method: 'called', note: ' no answer ' })).toEqual({ method: 'called', note: 'no answer' });
    expect(() => checkContact({ method: 'emailed' })).toThrow('Choose how you tried to reach the owner');
    expect(() => checkContact({ method: 'called', note: 'x'.repeat(101) })).toThrow('Keep the note under 100 characters');
    expect(contactText({ method: 'called', note: 'no answer', at: '2026-11-16 18:02:00' }, (kl) => kl.slice(11, 16))).toBe('18:02 · Called: no answer');
    expect(contactText({ method: 'knocked', note: '', at: '2026-11-16 18:05:00' }, (kl) => kl.slice(11, 16))).toBe('18:05 · Knocked');
  });
});

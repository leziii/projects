import { describe, expect, it } from 'vitest';
import { checkInsurance, experienceText, initials } from './trust';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('owner view of a caregiver (E4-6)', () => {
  it('initials and experience', () => {
    expect(initials('Siti A.')).toBe('SA');
    expect(initials('Kumar')).toBe('K');
    expect(initials('')).toBe('');
    expect(experienceText(0)).toBe('New to pet sitting');
    expect(experienceText(1)).toBe('1 year experience');
    expect(experienceText(3)).toBe('3 years experience');
  });

  it('insurance: on needs a note, off may keep one; admin gives a reason', () => {
    expect(checkInsurance({ on: true, note: ' Pet injury cover by Etiqa ', reason: 'Policy signed' })).toEqual({ on: true, note: 'Pet injury cover by Etiqa', reason: 'Policy signed' });
    expect(checkInsurance({ on: false, note: '', reason: 'Policy ended' }).on).toBe(false);
    expect(code(() => checkInsurance({ on: 'yes', reason: 'Policy signed' }))).toBe('INSURANCE_ON');
    expect(code(() => checkInsurance({ on: true, note: 'abc', reason: 'Policy signed' }))).toBe('INSURANCE_NOTE');
    expect(code(() => checkInsurance({ on: true, note: 'x'.repeat(151), reason: 'Policy signed' }))).toBe('INSURANCE_NOTE');
    expect(code(() => checkInsurance({ on: true, note: 'Pet injury cover', reason: 'ok' }))).toBe('REASON_REQUIRED');
  });
});

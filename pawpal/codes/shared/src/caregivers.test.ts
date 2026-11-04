import { describe, expect, it } from 'vitest';
import { abilityText, appDecisionMessage, canTakeDog, changeDecisionMessage, checkAppDecision, checkChangeDecision, checkDraft, displayName, maskIc, missingItems, normalizeIc, planProfileSave } from './caregivers';

const now = new Date('2026-10-29T10:00:00+08:00');
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('E4-1 caregiver application', () => {
  it('reads a Malaysian IC with a real birth date and age 18+', () => {
    expect(normalizeIc('900101145678', now)).toBe('900101-14-5678');
    expect(normalizeIc('900101-14-5678', now)).toBe('900101-14-5678');
    expect(normalizeIc('081029-10-1234', now)).toBe('081029-10-1234');
    expect(code(() => normalizeIc('081030-10-1234', now))).toBe('IC_UNDER_AGE');
    expect(code(() => normalizeIc('901301-14-5678', now))).toBe('IC_FORMAT');
    expect(code(() => normalizeIc('900230-14-5678', now))).toBe('IC_FORMAT');
    expect(code(() => normalizeIc('A1234567', now))).toBe('IC_FORMAT');
  });

  it('a draft may be partly empty but what is filled must be valid', () => {
    expect(checkDraft({}, now)).toEqual({ fullName: '', icNumber: '', experienceYears: null, cats: false, dogs: false, maxDogSize: null, areas: [], guideRead: false });
    expect(checkDraft({ dogs: false, maxDogSize: 'large', areas: ['Bangsar', 'Mont Kiara'] }, now)).toMatchObject({ maxDogSize: null, areas: ['Mont Kiara', 'Bangsar'] });
    expect(code(() => checkDraft({ experienceYears: 2.5 }, now))).toBe('APP_YEARS');
    expect(code(() => checkDraft({ areas: ['Penang'] }, now))).toBe('APP_AREA');
    expect(code(() => checkDraft({ dogs: true, maxDogSize: 'huge' as never }, now))).toBe('APP_DOG_SIZE');
  });

  it('lists what is missing before submit', () => {
    const empty = checkDraft({}, now);
    expect(missingItems(empty, [])).toEqual(['Full name', 'IC number', 'IC front', 'IC back', 'Selfie holding your IC', 'Years of experience', 'Cats or dogs', 'At least one area', 'Read the care guide']);
    const full = checkDraft({ fullName: 'Siti Aminah', icNumber: '900101145678', experienceYears: 0, dogs: true, areas: ['Bangsar'], guideRead: true }, now);
    expect(missingItems(full, [{ kind: 'ic_front' }, { kind: 'ic_back' }, { kind: 'selfie' }])).toEqual(['Largest dog size']);
    expect(missingItems({ ...full, maxDogSize: 'medium' }, [{ kind: 'ic_front' }, { kind: 'ic_back' }, { kind: 'selfie' }])).toEqual([]);
  });

  it('dog size covers dogs up to its weight; IC is masked on screens', () => {
    expect(canTakeDog('small', 9.5)).toBe(true);
    expect(canTakeDog('small', 12)).toBe(false);
    expect(canTakeDog('medium', 25)).toBe(true);
    expect(canTakeDog(null, 5)).toBe(false);
    expect(maskIc('900101-14-5678')).toBe('******-**-5678');
  });
});

describe('admin review decisions (E4-2)', () => {
  it('approve needs the identity tick; the ticks go into the note', () => {
    expect(() => checkAppDecision({ status: 'approved' })).toThrow('Tick that the IC photos');
    expect(checkAppDecision({ status: 'approved', idChecked: true })).toEqual({ status: 'approved', caregiverNote: null, internalNote: 'IC and selfie match' });
    expect(checkAppDecision({ status: 'approved', idChecked: true, certChecked: true, note: 'good' }).internalNote).toBe('IC and selfie match, certificates checked; good');
  });

  it('needs info and not approved need a reason', () => {
    expect(() => checkAppDecision({ status: 'needs_info', note: 'bad' })).toThrow('at least 5 characters');
    expect(checkAppDecision({ status: 'rejected', note: ' IC photo is blurry ' })).toMatchObject({ caregiverNote: 'IC photo is blurry' });
    expect(() => checkAppDecision({ status: 'suspended' })).toThrow('Choose approve');
  });

  it('message carries the reason', () => {
    expect(appDecisionMessage('needs_info', 'Retake the IC back.').body).toBe('Retake the IC back. Open your application to update it.');
    expect(appDecisionMessage('approved', null).title).toBe('You are a PawPal caregiver');
  });
});

describe('caregiver profile (E4-4)', () => {
  const base = { cats: true, dogs: true, maxDogSize: 'medium' as const, areas: ['Bangsar'], experienceYears: 3, intro: ' Hi ' };
  const current = { dogs: true, maxDogSize: 'medium' as const };

  it('display name', () => {
    expect(displayName('Siti Aminah binti Ahmad')).toBe('Siti A.');
    expect(displayName('  raj  kumar ')).toBe('raj K.');
    expect(displayName('Mei')).toBe('Mei');
    expect(displayName('')).toBe('');
  });

  it('same or lower ability saves at once', () => {
    expect(planProfileSave(current, base)).toEqual({ now: { ...base, intro: 'Hi' }, ability: null });
    expect(planProfileSave(current, { ...base, maxDogSize: 'small' }).now.maxDogSize).toBe('small');
    expect(planProfileSave(current, { ...base, dogs: false })).toMatchObject({ now: { dogs: false, maxDogSize: null }, ability: null });
  });

  it('a larger dog size or starting dogs waits for review; the current one stays', () => {
    expect(planProfileSave(current, { ...base, maxDogSize: 'large' })).toMatchObject({ now: { maxDogSize: 'medium' }, ability: { dogs: true, maxDogSize: 'large' } });
    const start = planProfileSave({ dogs: false, maxDogSize: null }, { ...base, maxDogSize: 'small' });
    expect(start).toMatchObject({ now: { dogs: false, maxDogSize: null }, ability: { dogs: true, maxDogSize: 'small' } });
    expect(code(() => planProfileSave({ dogs: false, maxDogSize: null }, { ...base, cats: false }))).toBe('PROFILE_NO_PETS');
  });

  it('checks areas, years, intro and size', () => {
    expect(code(() => planProfileSave(current, { ...base, areas: [] }))).toBe('PROFILE_AREA');
    expect(code(() => planProfileSave(current, { ...base, experienceYears: '' }))).toBe('APP_YEARS');
    expect(code(() => planProfileSave(current, { ...base, intro: 'x'.repeat(301) }))).toBe('PROFILE_INTRO');
    expect(code(() => planProfileSave(current, { ...base, maxDogSize: null }))).toBe('APP_DOG_SIZE');
    expect(code(() => planProfileSave(current, { ...base, cats: false, dogs: false }))).toBe('PROFILE_NO_PETS');
  });

  it('change decisions', () => {
    expect(checkChangeDecision('approved', '')).toMatchObject({ caregiverNote: null, internalNote: 'Profile change approved' });
    expect(code(() => checkChangeDecision('rejected', 'no'))).toBe('APP_REASON_NEEDED');
    expect(changeDecisionMessage('rejected', 'Photo is blurry').body).toBe('Photo is blurry Your profile stays as it was.');
    expect(abilityText({ dogs: true, maxDogSize: 'large' })).toBe('Dogs up to Large (over 25 kg)');
  });
});

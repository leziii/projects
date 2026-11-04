import type { CaregiverProfile } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { abilitySummary, pendingText, profileFormToInput, profileToForm, reviewHint } from './profile';

const profile: CaregiverProfile = {
  displayName: 'Siti A.',
  cats: true,
  dogs: true,
  maxDogSize: 'small',
  areas: ['Bangsar'],
  experienceYears: 3,
  intro: '',
  hasPhoto: false,
  pending: null,
  lastRejected: null,
};

describe('caregiver profile form (E4-4)', () => {
  it('round trip', () => {
    expect(profileFormToInput(profileToForm(profile))).toEqual({ cats: true, dogs: true, maxDogSize: 'small', areas: ['Bangsar'], experienceYears: '3', intro: '' });
    expect(profileFormToInput({ ...profileToForm(profile), dogs: false }).maxDogSize).toBeNull();
  });

  it('warns before a raise; lowering is quiet', () => {
    expect(reviewHint(profile, { dogs: true, maxDogSize: 'large' })).toBe('Dogs up to Large (over 25 kg) needs review. Until then you keep dogs up to small (under 10 kg).');
    expect(reviewHint(profile, { dogs: false, maxDogSize: null })).toBe('');
    expect(reviewHint(profile, { dogs: true, maxDogSize: 'small' })).toBe('');
  });

  it('pending and summary text', () => {
    expect(pendingText(profile)).toBe('');
    expect(pendingText({ pending: { ability: { dogs: true, maxDogSize: 'large' }, photo: true, createdAt: '' } })).toBe('Waiting for review: Dogs up to Large (over 25 kg), new photo');
    expect(abilitySummary(profile)).toBe('Cats · Dogs up to Small (under 10 kg)');
  });
});

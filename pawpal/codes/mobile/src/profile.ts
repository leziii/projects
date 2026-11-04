import { DOG_SIZE_LABEL, abilityText, dogRank, type Area, type CaregiverProfile, type DogSize, type ProfileInput } from '@pawpal/shared';

/** The S04 form as typed. */
export interface ProfileForm {
  cats: boolean;
  dogs: boolean;
  maxDogSize: DogSize | null;
  areas: Area[];
  years: string;
  intro: string;
}

export const profileToForm = (p: CaregiverProfile): ProfileForm => ({
  cats: p.cats,
  dogs: p.dogs,
  maxDogSize: p.maxDogSize,
  areas: [...p.areas],
  years: String(p.experienceYears),
  intro: p.intro,
});

export const profileFormToInput = (f: ProfileForm): ProfileInput => ({
  cats: f.cats,
  dogs: f.dogs,
  maxDogSize: f.dogs ? f.maxDogSize : null,
  areas: f.areas,
  experienceYears: f.years.trim(),
  intro: f.intro,
});

/** Shown under the dog choice before saving: a larger ability goes to review (R15-2). */
export function reviewHint(p: Pick<CaregiverProfile, 'dogs' | 'maxDogSize'>, f: Pick<ProfileForm, 'dogs' | 'maxDogSize'>): string {
  if (dogRank(f.dogs, f.maxDogSize) <= dogRank(p.dogs, p.maxDogSize)) return '';
  return `${abilityText({ dogs: f.dogs, maxDogSize: f.maxDogSize })} needs review. Until then you keep ${abilityText(p).toLowerCase()}.`;
}

/** "Waiting for review: Dogs up to Large (over 25 kg), new photo". */
export function pendingText(p: Pick<CaregiverProfile, 'pending'>): string {
  const c = p.pending;
  if (!c) return '';
  const parts = [c.ability ? abilityText(c.ability) : '', c.photo ? 'new photo' : ''].filter(Boolean);
  return `Waiting for review: ${parts.join(', ')}`;
}

/** "Cats · Dogs up to Medium (10–25 kg)" */
export function abilitySummary(p: Pick<CaregiverProfile, 'cats' | 'dogs' | 'maxDogSize'>): string {
  return [p.cats ? 'Cats' : '', p.dogs && p.maxDogSize ? `Dogs up to ${DOG_SIZE_LABEL[p.maxDogSize]}` : ''].filter(Boolean).join(' · ');
}

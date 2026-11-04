/**
 * Caregiver application (E4-1, S02). Settled with KF in round 12:
 * Malaysian IC only; required identity photos and a selfie with the IC; experience, pets and areas;
 * dog size ability; the care guide must be read. Certificates and good conduct are optional.
 * The draft is kept on the server; after submit it is locked until an admin asks for more info.
 */
import { AREAS, type Area } from './addresses';
import { RuleError } from './rules';

export type DogSize = 'small' | 'medium' | 'large';
export const DOG_SIZES: readonly DogSize[] = ['small', 'medium', 'large'];
export const DOG_SIZE_LABEL: Record<DogSize, string> = { small: 'Small (under 10 kg)', medium: 'Medium (10–25 kg)', large: 'Large (over 25 kg)' };
/** Heaviest dog each size covers, kg. */
export const DOG_SIZE_MAX_KG: Record<DogSize, number> = { small: 10, medium: 25, large: 90 };

/** Can a caregiver with this size take a dog of this weight? (Used by booking, E5-2.) */
export const canTakeDog = (size: DogSize | null, weightKg: number) => size !== null && weightKg <= DOG_SIZE_MAX_KG[size];

export type ApplicationFileKind = 'ic_front' | 'ic_back' | 'selfie' | 'certificate' | 'good_conduct';
export const APPLICATION_FILE_LABEL: Record<ApplicationFileKind, string> = {
  ic_front: 'IC front',
  ic_back: 'IC back',
  selfie: 'Selfie holding your IC',
  certificate: 'Certificate',
  good_conduct: 'Good-conduct certificate',
};
export const REQUIRED_FILES: readonly ApplicationFileKind[] = ['ic_front', 'ic_back', 'selfie'];
/** At most this many files of each kind. */
export const FILE_LIMIT: Record<ApplicationFileKind, number> = { ic_front: 1, ic_back: 1, selfie: 1, certificate: 3, good_conduct: 1 };

export type ApplicationStatus = 'draft' | 'submitted' | 'needs_info' | 'approved' | 'rejected';
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Under review',
  needs_info: 'Needs info',
  approved: 'Approved',
  rejected: 'Not approved',
};

export const APPLICATION_RULES = { nameMax: 80, maxYears: 60, minAge: 18, photoMaxBytes: 5 * 1024 * 1024 } as const;

/** What the caregiver types (all optional while it is a draft). */
export interface ApplicationInput {
  fullName?: string;
  icNumber?: string;
  experienceYears?: number | null;
  cats?: boolean;
  dogs?: boolean;
  maxDogSize?: DogSize | null;
  areas?: string[];
  guideRead?: boolean;
}

export interface ApplicationFields {
  fullName: string;
  /** "900101-14-5678" or '' */
  icNumber: string;
  experienceYears: number | null;
  cats: boolean;
  dogs: boolean;
  maxDogSize: DogSize | null;
  areas: Area[];
  guideRead: boolean;
}

export interface ApplicationFile {
  id: number;
  kind: ApplicationFileKind;
}

export interface Application extends ApplicationFields {
  status: ApplicationStatus;
  files: ApplicationFile[];
  /** What is still missing before it can be submitted (labels). */
  missing: string[];
  /** Admin's request or reason (needs info / rejected; E4-2). */
  adminNote: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

/** Applications the caregiver may still change. After "Not approved" they may fix it and send it again (R13-6). */
export const EDITABLE: readonly ApplicationStatus[] = ['draft', 'needs_info', 'rejected'];

/**
 * Malaysian IC: 12 digits as YYMMDD-PB-###G with a real birth date. Returns "YYMMDD-PB-####".
 * The age check uses the birth date in the number.
 */
export function normalizeIc(input: string, now: Date): string {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(digits)) throw new RuleError('IC_FORMAT', 'IC number: 12 digits, e.g. 900101-14-5678');
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const thisYY = now.getUTCFullYear() % 100;
  const year = yy <= thisYY ? 2000 + yy : 1900 + yy;
  const birth = new Date(Date.UTC(year, mm - 1, dd));
  if (mm < 1 || mm > 12 || birth.getUTCDate() !== dd) throw new RuleError('IC_FORMAT', 'IC number: the first 6 digits must be a birth date (YYMMDD)');
  const age = now.getUTCFullYear() - year - (now.getUTCMonth() * 100 + now.getUTCDate() < (mm - 1) * 100 + dd ? 1 : 0);
  if (age < APPLICATION_RULES.minAge) throw new RuleError('IC_UNDER_AGE', `Caregivers must be ${APPLICATION_RULES.minAge} or older`);
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** Checks the format of whatever is filled in; empty fields are fine in a draft. */
export function checkDraft(input: ApplicationInput, now: Date): ApplicationFields {
  const fullName = text(input.fullName);
  if (fullName.length > APPLICATION_RULES.nameMax) throw new RuleError('APP_NAME', `Name: at most ${APPLICATION_RULES.nameMax} characters`);
  const icRaw = text(input.icNumber);
  const icNumber = icRaw ? normalizeIc(icRaw, now) : '';
  let experienceYears: number | null = null;
  if (input.experienceYears !== null && input.experienceYears !== undefined && String(input.experienceYears) !== '') {
    experienceYears = Number(input.experienceYears);
    if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > APPLICATION_RULES.maxYears) {
      throw new RuleError('APP_YEARS', `Experience: whole years, 0–${APPLICATION_RULES.maxYears}`);
    }
  }
  const dogs = input.dogs === true;
  const maxDogSize = dogs && input.maxDogSize ? input.maxDogSize : null;
  if (maxDogSize && !DOG_SIZES.includes(maxDogSize)) throw new RuleError('APP_DOG_SIZE', 'Choose a dog size');
  const areas = Array.isArray(input.areas) ? input.areas : [];
  if (!areas.every((a) => AREAS.includes(a as Area))) throw new RuleError('APP_AREA', 'Choose areas from the list');
  return {
    fullName,
    icNumber,
    experienceYears,
    cats: input.cats === true,
    dogs,
    maxDogSize,
    areas: AREAS.filter((a) => areas.includes(a)),
    guideRead: input.guideRead === true,
  };
}

/** Labels of what is still missing before submitting. Empty = ready. */
export function missingItems(a: ApplicationFields, files: Pick<ApplicationFile, 'kind'>[]): string[] {
  const missing: string[] = [];
  if (!a.fullName) missing.push('Full name');
  if (!a.icNumber) missing.push('IC number');
  for (const kind of REQUIRED_FILES) if (!files.some((f) => f.kind === kind)) missing.push(APPLICATION_FILE_LABEL[kind]);
  if (a.experienceYears === null) missing.push('Years of experience');
  if (!a.cats && !a.dogs) missing.push('Cats or dogs');
  if (a.dogs && !a.maxDogSize) missing.push('Largest dog size');
  if (!a.areas.length) missing.push('At least one area');
  if (!a.guideRead) missing.push('Read the care guide');
  return missing;
}

/** "900101-14-5678" → "******-**-5678" for screens that do not need the full number. */
export const maskIc = (ic: string) => (ic ? `******-**-${ic.slice(-4)}` : '');

/** Placeholder care guide (R12-6); KF will give the real text. */
export const CARE_GUIDE = {
  version: 'draft-1',
  title: 'PawPal care guide',
  sections: [
    { heading: 'Before the visit', points: ['Read the pet profile and the owner’s notes.', 'Arrive on time; tell the owner in the app if you will be late.'] },
    { heading: 'At the home', points: ['Follow the entry instructions exactly.', 'Never let a pet outside unless the owner asked.', 'Do not touch anything that is not part of the job.'] },
    { heading: 'Care', points: ['Fresh water and the food the owner left, in the amount they wrote.', 'Clean the litter or pick up after the dog.', 'Watch for anything unusual and report it right away.'] },
    { heading: 'Finishing', points: ['Take the required photos for the report.', 'Lock up as you found it.', 'Owner’s address and details stay private, always.'] },
  ],
} as const;

/* ---- Admin review (E4-2, A03/A04). Settled with KF in round 13. ---- */

export const REVIEW_FILTERS: readonly ApplicationStatus[] = ['submitted', 'needs_info', 'approved', 'rejected'];
export const REVIEW_FILTER_LABEL: Partial<Record<ApplicationStatus, string>> = {
  submitted: 'Waiting',
  needs_info: 'Needs info',
  approved: 'Approved',
  rejected: 'Not approved',
};

export type AppDecision = 'approved' | 'needs_info' | 'rejected';
export const APP_DECISIONS: readonly AppDecision[] = ['approved', 'needs_info', 'rejected'];
export const APP_NOTE_MAX = 300;

/**
 * R13-2/R13-3: Approve needs the identity tick; Needs info / Not approved need a reason the caregiver sees.
 * The ticks and any note go into the history.
 */
export function checkAppDecision(input: { status?: unknown; note?: unknown; idChecked?: unknown; certChecked?: unknown }): {
  status: AppDecision;
  caregiverNote: string | null;
  internalNote: string;
} {
  const status = input.status as AppDecision;
  if (!APP_DECISIONS.includes(status)) throw new RuleError('APP_DECISION', 'Choose approve, needs info or not approved');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > APP_NOTE_MAX) throw new RuleError('APP_NOTE', `Reason: at most ${APP_NOTE_MAX} characters`);
  if (status === 'approved') {
    if (input.idChecked !== true) throw new RuleError('APP_ID_CHECK', 'Tick that the IC photos and selfie match the name and IC number');
    const checks = ['IC and selfie match', ...(input.certChecked === true ? ['certificates checked'] : [])].join(', ');
    return { status, caregiverNote: null, internalNote: note ? `${checks}; ${note}` : checks };
  }
  if (note.length < 5) throw new RuleError('APP_REASON_NEEDED', 'Give the caregiver a reason (at least 5 characters)');
  return { status, caregiverNote: note, internalNote: note };
}

/** The message the applicant gets after a decision; the reason is shown when they open it. */
export function appDecisionMessage(status: AppDecision, note: string | null): { title: string; body: string } {
  if (status === 'approved') return { title: 'You are a PawPal caregiver', body: 'Your application is approved. Switch to the Caregiver role to start.' };
  if (status === 'needs_info') return { title: 'More info needed for your application', body: `${note ?? ''} Open your application to update it.`.trim() };
  return { title: 'Application not approved', body: `${note ?? ''} You can fix your application and send it again.`.trim() };
}

/** A row in the admin review list (A03). */
export interface ReviewRow {
  userId: number;
  fullName: string;
  phone: string;
  status: ApplicationStatus;
  submittedAt: string | null;
  /** "Complete" or what is missing. */
  documents: string;
  /** Same IC already used by another account. */
  sameIc: boolean;
}

/** Another account with the same IC number (R13-5). */
export interface SameIcAccount {
  phone: string;
  status: ApplicationStatus;
}

/* ---- Caregiver profile (E4-4, S04). Settled with KF in round 15. ---- */

export const PROFILE_RULES = { introMax: 300 } as const;

/** What owners see (R15-5): first name and the initial of the last word, e.g. "Siti A.". */
export function displayName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.`;
}

/** 0 = no dogs, then small, medium, large. */
export const dogRank = (dogs: boolean, size: DogSize | null) => (dogs && size ? DOG_SIZES.indexOf(size) + 1 : 0);

/** The ability part of a change waiting for review. */
export interface AbilityRequest {
  dogs: boolean;
  maxDogSize: DogSize | null;
}

export interface ProfileChange {
  /** Larger dog ability asked for, or null. */
  ability: AbilityRequest | null;
  /** A new photo is waiting. */
  photo: boolean;
  createdAt: string;
}

export interface CaregiverProfile {
  displayName: string;
  cats: boolean;
  dogs: boolean;
  maxDogSize: DogSize | null;
  areas: Area[];
  experienceYears: number;
  intro: string;
  hasPhoto: boolean;
  /** Waiting for review (one at a time). */
  pending: ProfileChange | null;
  /** Reason for the last change that was not approved, until the next one is sent. */
  lastRejected: string | null;
}

export interface ProfileInput {
  cats?: boolean;
  dogs?: boolean;
  maxDogSize?: DogSize | null;
  areas?: string[];
  experienceYears?: number | string | null;
  intro?: string;
}

/**
 * Splits a save (R15-1/R15-2): what applies at once, and a larger dog ability that waits for review.
 * Lowering is instant; while a raise waits, the current ability stays in use.
 */
export function planProfileSave(
  current: Pick<CaregiverProfile, 'dogs' | 'maxDogSize'>,
  input: ProfileInput,
): { now: Pick<CaregiverProfile, 'cats' | 'dogs' | 'maxDogSize' | 'areas' | 'experienceYears' | 'intro'>; ability: AbilityRequest | null } {
  const areas = Array.isArray(input.areas) ? input.areas : [];
  if (!areas.length || !areas.every((a) => AREAS.includes(a as Area))) throw new RuleError('PROFILE_AREA', 'Choose at least one area from the list');
  const years = Number(input.experienceYears);
  if (input.experienceYears === null || input.experienceYears === '' || !Number.isInteger(years) || years < 0 || years > APPLICATION_RULES.maxYears) {
    throw new RuleError('APP_YEARS', `Experience: whole years, 0–${APPLICATION_RULES.maxYears}`);
  }
  const intro = typeof input.intro === 'string' ? input.intro.trim() : '';
  if (intro.length > PROFILE_RULES.introMax) throw new RuleError('PROFILE_INTRO', `Intro: at most ${PROFILE_RULES.introMax} characters`);
  const dogs = input.dogs === true;
  const size = dogs ? (input.maxDogSize ?? null) : null;
  if (dogs && (!size || !DOG_SIZES.includes(size))) throw new RuleError('APP_DOG_SIZE', 'Choose the largest dog size');
  const cats = input.cats === true;

  const raise = dogRank(dogs, size) > dogRank(current.dogs, current.maxDogSize);
  const now = {
    cats,
    dogs: raise ? current.dogs : dogs,
    maxDogSize: raise ? current.maxDogSize : size,
    areas: AREAS.filter((a) => areas.includes(a)),
    experienceYears: years,
    intro,
  };
  if (!now.cats && !now.dogs) {
    throw new RuleError('PROFILE_NO_PETS', raise ? 'Keep cats until the dog change is approved' : 'Choose cats or dogs');
  }
  return { now, ability: raise ? { dogs, maxDogSize: size } : null };
}

/** "Dogs up to Large (over 25 kg)" for the review screens. */
export const abilityText = (a: AbilityRequest | Pick<CaregiverProfile, 'dogs' | 'maxDogSize'>) =>
  a.dogs && a.maxDogSize ? `Dogs up to ${DOG_SIZE_LABEL[a.maxDogSize]}` : 'No dogs';

export type ChangeDecision = 'approved' | 'rejected';

/** Approve, or Not approved with a reason the caregiver sees (R15-4, same rule as applications). */
export function checkChangeDecision(status: unknown, note: unknown): { status: ChangeDecision; caregiverNote: string | null; internalNote: string } {
  if (status !== 'approved' && status !== 'rejected') throw new RuleError('APP_DECISION', 'Choose approve or not approved');
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > APP_NOTE_MAX) throw new RuleError('APP_NOTE', `Reason: at most ${APP_NOTE_MAX} characters`);
  if (status === 'approved') return { status, caregiverNote: null, internalNote: text || 'Profile change approved' };
  if (text.length < 5) throw new RuleError('APP_REASON_NEEDED', 'Give the caregiver a reason (at least 5 characters)');
  return { status, caregiverNote: text, internalNote: text };
}

export function changeDecisionMessage(status: ChangeDecision, note: string | null): { title: string; body: string } {
  if (status === 'approved') return { title: 'Profile change approved', body: 'Your profile now shows the change.' };
  return { title: 'Profile change not approved', body: `${note ?? ''} Your profile stays as it was.`.trim() };
}

/** A row in the admin "Profile changes" list. */
export interface ChangeRow {
  userId: number;
  displayName: string;
  phone: string;
  /** "Dogs up to Large (over 25 kg) · New photo" */
  summary: string;
  createdAt: string;
}

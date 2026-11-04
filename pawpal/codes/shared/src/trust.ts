/**
 * What owners see about a caregiver (E4-6, O08): the Verified badge and the insurance note.
 */
import type { Area } from './addresses';
import type { DogSize } from './caregivers';
import { RuleError } from './rules';

export const ID_VERIFIED_LABEL = 'ID verified';
export const CERT_CHECKED_LABEL = 'Certificate checked';
/** Shown when an owner taps the badge (R17-5). */
export const ID_VERIFIED_TEXT = "PawPal checked this caregiver's IC and a selfie before approving them.";

/** R17-3: one platform-wide note, off until a real policy is in place (E15-5). */
export interface Insurance {
  on: boolean;
  note: string;
}
export const INSURANCE_NOTE_MAX = 150;
export const INSURANCE_OFF: Insurance = { on: false, note: '' };

export function checkInsurance(input: { on?: unknown; note?: unknown; reason?: unknown }): Insurance & { reason: string } {
  if (typeof input.on !== 'boolean') throw new RuleError('INSURANCE_ON', 'Choose on or off');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > INSURANCE_NOTE_MAX) throw new RuleError('INSURANCE_NOTE', `Note: at most ${INSURANCE_NOTE_MAX} characters`);
  if (input.on && note.length < 5) throw new RuleError('INSURANCE_NOTE', 'Write what the insurance covers (at least 5 characters)');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 5) throw new RuleError('REASON_REQUIRED', 'Admin changes need a reason (at least 5 characters)');
  return { on: input.on, note, reason };
}

/** The O08 card. Never the phone number, full name or IC (R17-4). */
export interface CaregiverCard {
  id: number;
  displayName: string;
  /** "SA" when there is no approved photo. */
  initials: string;
  hasPhoto: boolean;
  experienceYears: number;
  areas: Area[];
  cats: boolean;
  dogs: boolean;
  maxDogSize: DogSize | null;
  intro: string;
  idVerified: boolean;
  certChecked: boolean;
  /** The note when insurance is on, otherwise null. */
  insurance: string | null;
}

/** "Siti A." → "SA", "Kumar" → "K". */
export function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** "1 year experience", "3 years experience", or "New to pet sitting". */
export const experienceText = (years: number) => (years <= 0 ? 'New to pet sitting' : `${years} year${years === 1 ? '' : 's'} experience`);

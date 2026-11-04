/**
 * Pet profiles (E3-1, O02/O03). Settled with KF in round 9:
 * age from birth month + year; dogs need breed (list or "Other") and weight 1–90 kg;
 * a vaccine record counts for 12 months; nothing is rejected automatically —
 * senior, no or old vaccine record, or a health note sends the pet to an admin check.
 */
import { RuleError, type PetKind } from './rules';

export type PetStatus = 'approved' | 'pending' | 'needs_info' | 'rejected';
export const PET_STATUS_LABEL: Record<PetStatus, string> = {
  approved: 'Approved',
  pending: 'Pending check',
  needs_info: 'Needs info',
  rejected: 'Not accepted',
};

/** Why a pet goes to the admin check. */
export type CheckReason = 'senior' | 'no_vaccine' | 'old_vaccine' | 'health_note';
export const CHECK_REASON_LABEL: Record<CheckReason, string> = {
  senior: 'Senior pet',
  no_vaccine: 'Not vaccinated',
  old_vaccine: 'Vaccine record older than 12 months',
  health_note: 'Health note to read',
};

export const PET_RULES = {
  nameMax: 30,
  breedMax: 40,
  noteMax: 300,
  weightMinKg: 1,
  weightMaxKg: 90,
  maxAgeYears: 30,
  vaccineValidMonths: 12,
  seniorAge: { cat: 12, dog: 8 } as Record<PetKind, number>,
  photoMaxBytes: 5 * 1024 * 1024,
} as const;

export const DOG_BREEDS = [
  'Beagle',
  'Border Collie',
  'Chihuahua',
  'Corgi',
  'Dachshund',
  'French Bulldog',
  'German Shepherd',
  'Golden Retriever',
  'Husky',
  'Labrador Retriever',
  'Maltese',
  'Mixed / Local',
  'Pomeranian',
  'Poodle',
  'Pug',
  'Schnauzer',
  'Shiba Inu',
  'Shih Tzu',
] as const;
export const OTHER_BREED = 'Other';

/** Month and year, month 1–12. */
export interface YearMonth {
  year: number;
  month: number;
}

export interface PetInput {
  kind: PetKind;
  name: string;
  birth: YearMonth;
  /** Dogs only. */
  breed?: string | null;
  /** Dogs only, kg with one decimal. */
  weightKg?: number | null;
  vaccinated: boolean;
  /** Last vaccination; needed when vaccinated. */
  lastVaccine?: YearMonth | null;
  healthNote?: string;
  /** Owner ticked "this information is true". */
  confirmed: boolean;
}

export interface PetFields {
  kind: PetKind;
  name: string;
  birth: YearMonth;
  breed: string | null;
  weightKg: number | null;
  vaccinated: boolean;
  lastVaccine: YearMonth | null;
  healthNote: string;
}

export interface Pet extends PetFields {
  id: number;
  status: PetStatus;
  checkReasons: CheckReason[];
  /** What the admin wrote when asking for more info or rejecting; null otherwise. */
  adminNote: string | null;
  hasVaccinePhoto: boolean;
  updatedAt: string;
}

/** Year and month in Kuala Lumpur (UTC+8). */
export function klYearMonth(now: Date): YearMonth {
  const kl = new Date(now.getTime() + 8 * 3600_000);
  return { year: kl.getUTCFullYear(), month: kl.getUTCMonth() + 1 };
}

const monthIndex = (ym: YearMonth) => ym.year * 12 + ym.month - 1;

/** Whole years from birth to now. */
export function ageYears(birth: YearMonth, now: Date): number {
  return Math.floor((monthIndex(klYearMonth(now)) - monthIndex(birth)) / 12);
}

/** "3 yrs", "1 yr", "5 mths" for the list. */
export function ageText(birth: YearMonth, now: Date): string {
  const months = monthIndex(klYearMonth(now)) - monthIndex(birth);
  if (months < 12) return `${months} mth${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} yr${years === 1 ? '' : 's'}`;
}

function yearMonth(v: unknown, code: string, label: string, now: Date): YearMonth {
  const ym = v as Partial<YearMonth> | null | undefined;
  const year = Number(ym?.year);
  const month = Number(ym?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new RuleError(code, `Choose the ${label} month and year`);
  const value = { year, month };
  if (monthIndex(value) > monthIndex(klYearMonth(now))) throw new RuleError(code, `The ${label} cannot be in the future`);
  return value;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Checks and cleans what the owner typed. Throws RuleError with a code the form can show. */
export function checkPet(input: Partial<PetInput>, now: Date): PetFields {
  if (input.kind !== 'cat' && input.kind !== 'dog') throw new RuleError('PET_KIND', 'Choose cat or dog');
  const kind = input.kind;
  const name = text(input.name);
  if (!name || name.length > PET_RULES.nameMax) throw new RuleError('PET_NAME', `Name: 1–${PET_RULES.nameMax} characters`);
  const birth = yearMonth(input.birth, 'PET_BIRTH', 'birth', now);
  if (ageYears(birth, now) > PET_RULES.maxAgeYears) throw new RuleError('PET_BIRTH', 'Check the birth year');

  let breed: string | null = null;
  let weightKg: number | null = null;
  if (kind === 'dog') {
    breed = text(input.breed);
    if (!breed || breed === OTHER_BREED) throw new RuleError('PET_BREED', 'Dogs need a breed');
    if (breed.length > PET_RULES.breedMax) throw new RuleError('PET_BREED', `Breed: at most ${PET_RULES.breedMax} characters`);
    const w = Number(input.weightKg);
    if (input.weightKg === null || input.weightKg === undefined || !Number.isFinite(w) || w < PET_RULES.weightMinKg || w > PET_RULES.weightMaxKg) {
      throw new RuleError('PET_WEIGHT', `Dogs need a weight of ${PET_RULES.weightMinKg}–${PET_RULES.weightMaxKg} kg`);
    }
    weightKg = Math.round(w * 10) / 10;
  }

  if (typeof input.vaccinated !== 'boolean') throw new RuleError('PET_VACCINE', 'Say whether the pet is vaccinated');
  const lastVaccine = input.vaccinated ? yearMonth(input.lastVaccine, 'PET_VACCINE_DATE', 'last vaccination', now) : null;
  if (lastVaccine && monthIndex(lastVaccine) < monthIndex(birth)) throw new RuleError('PET_VACCINE_DATE', 'The last vaccination cannot be before birth');

  const healthNote = text(input.healthNote);
  if (healthNote.length > PET_RULES.noteMax) throw new RuleError('PET_NOTE', `Health note: at most ${PET_RULES.noteMax} characters`);
  if (input.confirmed !== true) throw new RuleError('PET_NOT_CONFIRMED', 'Tick to confirm the information is true');

  return { kind, name, birth, breed, weightKg, vaccinated: input.vaccinated, lastVaccine, healthNote };
}

/** Reasons the pet needs an admin look. Empty = approved straight away. */
export function checkReasons(pet: PetFields, now: Date): CheckReason[] {
  const reasons: CheckReason[] = [];
  if (ageYears(pet.birth, now) >= PET_RULES.seniorAge[pet.kind]) reasons.push('senior');
  if (!pet.vaccinated || !pet.lastVaccine) reasons.push('no_vaccine');
  else if (monthIndex(klYearMonth(now)) - monthIndex(pet.lastVaccine) > PET_RULES.vaccineValidMonths) reasons.push('old_vaccine');
  if (pet.healthNote) reasons.push('health_note');
  return reasons;
}

/** Fields that matter for safety. Changing only the name (or photo) of an approved pet keeps it approved (KF, R10-1). */
export function riskyChange(before: PetFields, after: PetFields): boolean {
  const ym = (v: YearMonth | null) => (v ? `${v.year}-${v.month}` : '');
  return (
    before.kind !== after.kind ||
    ym(before.birth) !== ym(after.birth) ||
    before.breed !== after.breed ||
    before.weightKg !== after.weightKg ||
    before.vaccinated !== after.vaccinated ||
    ym(before.lastVaccine) !== ym(after.lastVaccine) ||
    before.healthNote !== after.healthNote
  );
}

/**
 * Status after the owner saves. A pet an admin rejected stays rejected;
 * after "needs info" the owner's update always goes back to the admin;
 * an approved pet stays approved unless a risky field changed.
 */
export function statusAfterSave(previous: PetStatus | null, reasons: CheckReason[], risky = true): PetStatus {
  if (previous === 'rejected') return 'rejected';
  if (previous === 'needs_info') return 'pending';
  if (previous === 'approved' && !risky) return 'approved';
  return reasons.length ? 'pending' : 'approved';
}

/** What the owner is told on the status page (O04). */
export const PET_STATUS_HELP: Record<PetStatus, string> = {
  approved: 'All set. You can book visits for this pet.',
  pending: 'We are checking this pet. You can start a booking, but payment waits until the check is done.',
  needs_info: 'We need more information. Update the profile and we will check again. Payment waits until then.',
  rejected: 'This pet cannot be booked. See the reason below.',
};

/**
 * Can the pet be used in a booking (E5)? Settled with KF:
 * pending / needs info may go into a draft but payment waits; rejected cannot be chosen.
 */
export type PetBooking = 'ok' | 'pay_after_check' | 'blocked';
export function petBooking(status: PetStatus): PetBooking {
  if (status === 'approved') return 'ok';
  return status === 'rejected' ? 'blocked' : 'pay_after_check';
}

/** What an admin can decide on a pet in the check (A06). */
export type PetDecision = 'approved' | 'needs_info' | 'rejected';
export const PET_DECISIONS: readonly PetDecision[] = ['approved', 'needs_info', 'rejected'];

/**
 * Admin decision (E3-3, KF R10-2): needs info / not accepted need a reason the owner sees;
 * approve takes an optional internal note that only goes into the history.
 */
export function checkAdminDecision(status: unknown, note: unknown): { status: PetDecision; ownerNote: string | null; internalNote: string } {
  if (!PET_DECISIONS.includes(status as PetDecision)) throw new RuleError('PET_STATUS', 'Choose approve, needs info or not accepted');
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > PET_RULES.noteMax) throw new RuleError('PET_NOTE', `Reason: at most ${PET_RULES.noteMax} characters`);
  if (status === 'approved') return { status, ownerNote: null, internalNote: text };
  if (text.length < 5) throw new RuleError('PET_REASON_NEEDED', 'Give the owner a reason (at least 5 characters)');
  return { status: status as PetDecision, ownerNote: text, internalNote: text };
}

/** Pets waiting in the admin check. */
export const PET_CHECK_STATUSES: readonly PetStatus[] = ['pending', 'needs_info'];

/** The message the owner gets after a decision (no address, only the pet's name). */
export function petDecisionMessage(name: string, status: PetDecision): { title: string; body: string } {
  const who = name.length <= 20 ? name : 'your pet';
  if (status === 'approved') return { title: `${who} is approved`, body: 'All set. You can book visits for this pet.' };
  if (status === 'needs_info') return { title: `More info needed for ${who}`, body: 'Open to see what we need, then update the profile.' };
  return { title: `${who} cannot be booked`, body: 'Open to see the reason.' };
}

/** A row in the admin pet check list (A05). */
export interface PetCheckRow {
  id: number;
  name: string;
  kind: PetKind;
  summary: string;
  ownerPhone: string;
  status: PetStatus;
  checkReasons: CheckReason[];
  updatedAt: string;
}

/** One line for the list: "Corgi · 12 kg · 5 yrs" or "Cat · 3 yrs". */
export function petSummary(pet: Pick<PetFields, 'kind' | 'breed' | 'weightKg' | 'birth'>, now: Date): string {
  const parts = pet.kind === 'dog' ? [pet.breed ?? 'Dog', `${pet.weightKg} kg`] : ['Cat'];
  return [...parts, ageText(pet.birth, now)].join(' · ');
}

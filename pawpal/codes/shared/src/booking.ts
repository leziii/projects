/**
 * Booking setup (E5-1, O06): pets, level, dates and visits, overtime, address, and the price per visit.
 * Settled with KF in Round 18. Times are minutes after midnight, Kuala Lumpur.
 */
import type { Area } from './addresses';
import { canTakeDog, type DogSize } from './caregivers';
import type { PetStatus } from './pets';
import { DEFAULT_RULES, RuleError, checkCapacity, quoteVisit, type PetKind, type RuleSet, type ServiceLevel, type VisitQuote } from './rules';
import { addDays, dayText, isFree, klDate, timeText, type Schedule } from './schedule';
import type { CaregiverCard } from './trust';

export const BOOKING_RULES = {
  /** Start times in 30-minute steps (R18-3). */
  startStep: 30,
  /** Overtime units of 15 minutes per visit, 0–4 (R18-2). */
  maxOvertimeUnits: 4,
  /** Never more than this many visits in one draft (20 days × 3). */
  maxVisits: 60,
} as const;

export interface BookingVisit {
  date: string;
  /** Minutes after midnight. */
  start: number;
}

export interface DraftInput {
  petIds: number[];
  level: ServiceLevel;
  overtimeUnits: number;
  addressId: number | null;
  visits: BookingVisit[];
}

export const EMPTY_DRAFT: DraftInput = { petIds: [], level: 'basic', overtimeUnits: 0, addressId: null, visits: [] };

/** The caregiver chosen on O07/O08 (R19-4). */
export interface ChosenCaregiver {
  id: number;
  displayName: string;
}

/** What the draft needs to know about the owner's pets and addresses. */
export interface DraftContext {
  pets: { id: number; kind: PetKind; status: PetStatus; name: string; weightKg?: number | null }[];
  addressIds: number[];
  now: Date;
}

export interface VisitLine extends BookingVisit {
  /** "Sun 1 Nov · 9:00 am" */
  label: string;
  quote: VisitQuote;
}

export interface DraftSummary {
  lines: VisitLine[];
  total: number;
  /** Reasons "Next" is off, in the order to fix them. Empty when ready. */
  blocks: string[];
  /** Names of chosen pets still being checked; payment waits for them (R18-5). */
  waitsForCheck: string[];
}

export interface BookingDraft extends DraftInput {
  summary: DraftSummary;
  caregiver: ChosenCaregiver | null;
  /** Why an earlier choice was cleared (R19-4), until a caregiver is chosen again. */
  caregiverNote: string | null;
  /** How the caregiver gets in; null until saved on O09 (R20-4). */
  entry: EntryInfo | null;
  /** The promo code tried on O10 (E5-6); checked again at every step. */
  promoCode: string | null;
}

/** 7:00 am … 10:00 pm. */
export function startOptions(r: RuleSet = DEFAULT_RULES): number[] {
  const out: number[] = [];
  for (let m = r.booking.firstHour * 60; m <= r.booking.lastHour * 60; m += BOOKING_RULES.startStep) out.push(m);
  return out;
}

/** The dates an owner can pick: today and the next 60 days. */
export function bookingDates(now: Date, r: RuleSet = DEFAULT_RULES): string[] {
  const today = klDate(now);
  return Array.from({ length: r.booking.maxDaysAhead + 1 }, (_, i) => addDays(today, i));
}

/** The moment a visit starts. */
export const visitTime = (v: BookingVisit) => new Date(Date.parse(`${v.date}T00:00:00Z`) + v.start * 60_000 - 8 * 3600_000);

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** Checks the shape of what the app sends. A draft may be incomplete; the summary says what is missing. */
export function checkBookingDraft(input: Partial<Record<keyof DraftInput, unknown>>, r: RuleSet = DEFAULT_RULES): DraftInput {
  const petIds = input.petIds ?? [];
  if (!Array.isArray(petIds) || !petIds.every(isId)) throw new RuleError('BOOKING_PETS', 'Choose pets from your list');
  const level = input.level ?? 'basic';
  if (level !== 'basic' && level !== 'upgrade') throw new RuleError('BOOKING_LEVEL', 'Choose basic or upgrade');
  const overtimeUnits = input.overtimeUnits ?? 0;
  if (!Number.isInteger(overtimeUnits) || (overtimeUnits as number) < 0 || (overtimeUnits as number) > BOOKING_RULES.maxOvertimeUnits) {
    throw new RuleError('BOOKING_OVERTIME', `Overtime: 0 to ${BOOKING_RULES.maxOvertimeUnits * 15} minutes`);
  }
  const addressId = input.addressId ?? null;
  if (addressId !== null && !isId(addressId)) throw new RuleError('BOOKING_ADDRESS', 'Choose one of your addresses');
  const visits = input.visits ?? [];
  const starts = startOptions(r);
  if (!Array.isArray(visits) || visits.length > BOOKING_RULES.maxVisits) throw new RuleError('BOOKING_VISITS', 'Too many visits');
  const clean = visits.map((v: { date?: unknown; start?: unknown }) => {
    if (!isDate(v?.date) || !starts.includes(v?.start as number)) {
      throw new RuleError('BOOKING_VISIT', `Visits start between ${timeText(starts[0])} and ${timeText(starts[starts.length - 1])}, every 30 minutes`);
    }
    return { date: v.date, start: v.start as number };
  });
  clean.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return { petIds: [...new Set(petIds as number[])], level, overtimeUnits: overtimeUnits as number, addressId: addressId as number | null, visits: clean };
}

/** Prices each visit and lists what still stops "Next" (R18-1 … R18-5). */
export function summarizeDraft(d: DraftInput, ctx: DraftContext, r: RuleSet = DEFAULT_RULES): DraftSummary {
  const blocks: string[] = [];
  const pets = d.petIds.map((id) => ctx.pets.find((p) => p.id === id)).filter((p) => !!p);
  const kinds = pets.map((p) => p.kind);
  if (!pets.length) blocks.push('Choose at least one pet');
  if (pets.some((p) => p.status === 'rejected')) blocks.push('A chosen pet cannot be booked');
  let capacityOk = pets.length > 0;
  try {
    if (pets.length) checkCapacity(kinds, r);
  } catch (e) {
    blocks.push((e as Error).message);
    capacityOk = false;
  }
  // Cats have one level only (R18-1).
  const level: ServiceLevel = kinds.includes('dog') ? d.level : 'basic';
  const quote = capacityOk ? quoteVisit(kinds, level, d.overtimeUnits, r) : null;

  const today = klDate(ctx.now);
  const last = addDays(today, r.booking.maxDaysAhead);
  const dates = [...new Set(d.visits.map((v) => v.date))];
  if (!d.visits.length) blocks.push('Add at least one visit');
  if (dates.length > r.booking.maxOrderDays) blocks.push(`At most ${r.booking.maxOrderDays} dates per booking`);
  if (dates.some((x) => x < today || x > last)) blocks.push(`Dates must be from today to ${dayText(last)}`);
  for (const date of dates) {
    const day = d.visits.filter((v) => v.date === date);
    if (day.length > r.booking.maxVisitsPerDay) blocks.push(`${dayText(date)}: at most ${r.booking.maxVisitsPerDay} visits a day`);
    if (quote && day.some((v, i) => i > 0 && day[i - 1].start + quote.totalMinutes > v.start)) blocks.push(`${dayText(date)}: visits overlap`);
  }
  const first = d.visits[0];
  if (first && visitTime(first).getTime() < ctx.now.getTime() + r.accept.failBelowHours * 3600_000) {
    blocks.push(`The first visit must be at least ${r.accept.failBelowHours} hours from now`);
  }
  if (d.addressId === null || !ctx.addressIds.includes(d.addressId)) blocks.push('Choose an address');

  const lines = quote ? d.visits.map((v) => ({ ...v, label: `${dayText(v.date)} · ${timeText(v.start)}`, quote })) : [];
  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.quote.total, 0),
    blocks,
    waitsForCheck: pets.filter((p) => p.status === 'pending' || p.status === 'needs_info').map((p) => p.name),
  };
}

/** What a booking needs from a caregiver (R19-1). */
export interface BookingNeeds {
  area: Area;
  cats: boolean;
  dogWeights: number[];
  overtimeMin: number;
}

export interface CaregiverAbility {
  areas: Area[];
  cats: boolean;
  dogs: boolean;
  maxDogSize: DogSize | null;
  overtimeMaxMin: number;
}

export function bookingNeeds(d: DraftInput, ctx: Pick<DraftContext, 'pets'>, area: Area): BookingNeeds {
  const pets = d.petIds.map((id) => ctx.pets.find((p) => p.id === id)).filter((p) => !!p);
  return {
    area,
    cats: pets.some((p) => p.kind === 'cat'),
    dogWeights: pets.filter((p) => p.kind === 'dog').map((p) => p.weightKg ?? 0),
    overtimeMin: d.overtimeUnits * 15,
  };
}

/** Works in the area, takes every pet and accepts the overtime. Anyone else is hidden. */
export function fitsBooking(c: CaregiverAbility, n: BookingNeeds): boolean {
  if (!c.areas.includes(n.area)) return false;
  if (n.cats && !c.cats) return false;
  if (n.dogWeights.length && (!c.dogs || !n.dogWeights.every((w) => canTakeDog(c.maxDogSize, w)))) return false;
  return n.overtimeMin <= c.overtimeMaxMin;
}

/** The visits that may clash with the caregiver's blocks, booked visits or travel buffer (R19-2). */
export function clashingVisits(visits: BookingVisit[], minutes: number, s: Pick<Schedule, 'settings' | 'blocks' | 'visits'>): BookingVisit[] {
  return visits.filter((v) => !isFree(v.date, v.start, minutes, s));
}

/** "All 3 visits look free" / "May clash: Sun 1 Nov 9:00 am, Mon 2 Nov 6:00 pm". */
export function availabilityText(total: number, clashes: BookingVisit[]): string {
  if (!clashes.length) return total === 1 ? 'Your visit looks free' : `All ${total} visits look free`;
  return `May clash: ${clashes.map((v) => `${dayText(v.date)} ${timeText(v.start)}`).join(', ')}`;
}

/** One row of the O07 list. */
export interface CaregiverOption {
  card: CaregiverCard;
  free: boolean;
  availability: string;
}

/** Free first, then most experience (R19-3). */
export const sortOptions = (list: CaregiverOption[]) =>
  [...list].sort((a, b) => Number(b.free) - Number(a.free) || b.card.experienceYears - a.card.experienceYears || a.card.id - b.card.id);

export const FREE_NOT_RESERVED = 'Free is not reserved. The caregiver confirms when accepting.';

/** How the caregiver gets in (E5-3, O09, R20-1). */
export type EntryMethod = 'pre_authorised' | 'live_confirm';
export const ENTRY_METHODS: readonly EntryMethod[] = ['pre_authorised', 'live_confirm'];
export const ENTRY_METHOD_LABEL: Record<EntryMethod, { title: string; help: string }> = {
  pre_authorised: { title: 'Pre-authorised', help: 'The caregiver lets themself in by your instructions.' },
  live_confirm: { title: 'Live confirm', help: 'You confirm in the app when the caregiver arrives.' },
};
export const ENTRY_TEXT_MAX = 300;

export interface EntryInfo {
  method: EntryMethod;
  /** Door code, where the key is. Required for pre-authorised (R20-2). */
  keyLock: string;
  guard: string;
  notes: string;
}

export const EMPTY_ENTRY: EntryInfo = { method: 'pre_authorised', keyLock: '', guard: '', notes: '' };

/** Checks the O09 form. Each box at most 300 characters; pre-authorised needs the key or lock box. */
export function checkEntry(input: Partial<Record<keyof EntryInfo, unknown>>): EntryInfo {
  const method = input.method as EntryMethod;
  if (!ENTRY_METHODS.includes(method)) throw new RuleError('ENTRY_METHOD', 'Choose how the caregiver gets in');
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const e = { method, keyLock: text(input.keyLock), guard: text(input.guard), notes: text(input.notes) };
  if ([e.keyLock, e.guard, e.notes].some((t) => t.length > ENTRY_TEXT_MAX)) throw new RuleError('ENTRY_TOO_LONG', `Each box: at most ${ENTRY_TEXT_MAX} characters`);
  if (method === 'pre_authorised' && !e.keyLock) throw new RuleError('ENTRY_KEY_NEEDED', 'Write how to get in: the door code or where the key is');
  return e;
}

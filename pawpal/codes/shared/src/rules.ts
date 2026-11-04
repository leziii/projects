/**
 * PawPal settled business rules (Pawpal_Project.md section 2.4).
 * Money is integer sen (RM1 = 100). Times are Malaysia time (UTC+8).
 * Change only with KF's approval.
 */
export interface RuleSet {
  version: string;
  price: { cat: number; dogBasic: number; dogUpgrade: number; mixedPerCat: number; extraPet: number; overtimePer15: number };
  minMinutes: { cat: number; dogBasic: number; dogUpgrade: number; mixedBasic: number; mixedUpgrade: number };
  capacity: { maxPets: number; maxDogs: number };
  accept: { failBelowHours: number; urgentBelowHours: number; urgentWindowMinutes: number; normalWindowMinutes: number };
  cancel: { fullRefundHours: number; partialRefundHours: number; partialRefundPercent: number };
  waiting: { freeMinutes: number; blockMinutes: number; feePerBlock: number; maxMinutes: number };
  split: { caregiverServicePercent: number; caregiverWaitingPercent: number; noHandoverCaregiverPercent: number };
  report: { confirmWindowHours: number; minPhotos: number };
  booking: { firstHour: number; lastHour: number; maxDaysAhead: number; maxOrderDays: number; maxVisitsPerDay: number };
  caregiver: { travelBufferMinutes: number; lateReportMinutes: number };
}

export const DEFAULT_RULES: RuleSet = {
  version: '2026-10-24',
  price: { cat: 4000, dogBasic: 6000, dogUpgrade: 7000, mixedPerCat: 1000, extraPet: 1000, overtimePer15: 1000 },
  minMinutes: { cat: 30, dogBasic: 20, dogUpgrade: 60, mixedBasic: 45, mixedUpgrade: 60 },
  capacity: { maxPets: 3, maxDogs: 2 },
  accept: { failBelowHours: 3, urgentBelowHours: 6, urgentWindowMinutes: 30, normalWindowMinutes: 180 },
  cancel: { fullRefundHours: 24, partialRefundHours: 1, partialRefundPercent: 80 },
  waiting: { freeMinutes: 10, blockMinutes: 10, feePerBlock: 500, maxMinutes: 60 },
  split: { caregiverServicePercent: 85, caregiverWaitingPercent: 100, noHandoverCaregiverPercent: 50 },
  report: { confirmWindowHours: 12, minPhotos: 3 },
  booking: { firstHour: 7, lastHour: 22, maxDaysAhead: 60, maxOrderDays: 20, maxVisitsPerDay: 3 },
  caregiver: { travelBufferMinutes: 30, lateReportMinutes: 15 },
};

export type PetKind = 'cat' | 'dog';
export type ServiceLevel = 'basic' | 'upgrade';

export class RuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const MYT_OFFSET = 8 * HOUR;

/** Percent of an amount in sen, rounded to the nearest sen. */
export function percentOf(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}

export interface VisitQuote {
  serviceKind: 'cat' | 'dog' | 'mixed';
  basePrice: number;
  extraPetFee: number;
  overtimeFee: number;
  total: number;
  minMinutes: number;
  totalMinutes: number;
}

export function checkCapacity(pets: PetKind[], r: RuleSet = DEFAULT_RULES): void {
  if (pets.length === 0) throw new RuleError('NO_PETS', 'Choose at least one pet');
  if (pets.length > r.capacity.maxPets) throw new RuleError('TOO_MANY_PETS', `At most ${r.capacity.maxPets} pets per booking`);
  if (pets.filter((p) => p === 'dog').length > r.capacity.maxDogs) {
    throw new RuleError('TOO_MANY_DOGS', `At most ${r.capacity.maxDogs} dogs per booking`);
  }
}

/** Price one visit. Cats have one level; extra pets do not extend the minimum time. */
export function quoteVisit(pets: PetKind[], level: ServiceLevel, overtimeUnits = 0, r: RuleSet = DEFAULT_RULES): VisitQuote {
  checkCapacity(pets, r);
  if (!Number.isInteger(overtimeUnits) || overtimeUnits < 0) {
    throw new RuleError('OVERTIME_INVALID', 'Overtime must be a whole number of 15-minute units');
  }
  const cats = pets.filter((p) => p === 'cat').length;
  const dogs = pets.length - cats;
  let serviceKind: VisitQuote['serviceKind'];
  let basePrice: number;
  let extraPetFee: number;
  let minMinutes: number;
  if (dogs === 0) {
    serviceKind = 'cat';
    basePrice = r.price.cat;
    extraPetFee = (cats - 1) * r.price.extraPet;
    minMinutes = r.minMinutes.cat;
  } else {
    const upgrade = level === 'upgrade';
    basePrice = upgrade ? r.price.dogUpgrade : r.price.dogBasic;
    extraPetFee = (dogs - 1) * r.price.extraPet;
    if (cats === 0) {
      serviceKind = 'dog';
      minMinutes = upgrade ? r.minMinutes.dogUpgrade : r.minMinutes.dogBasic;
    } else {
      serviceKind = 'mixed';
      basePrice += cats * r.price.mixedPerCat;
      minMinutes = upgrade ? r.minMinutes.mixedUpgrade : r.minMinutes.mixedBasic;
    }
  }
  const overtimeFee = overtimeUnits * r.price.overtimePer15;
  return {
    serviceKind,
    basePrice,
    extraPetFee,
    overtimeFee,
    total: basePrice + extraPetFee + overtimeFee,
    minMinutes,
    totalMinutes: minMinutes + overtimeUnits * 15,
  };
}

export type AcceptKind = 'fail' | 'urgent' | 'normal';

/** Decided once when payment lands; the countdown never re-classifies. */
export function acceptWindow(paidAt: Date, firstVisitStart: Date, r: RuleSet = DEFAULT_RULES): { kind: AcceptKind; deadline: Date | null } {
  const lead = firstVisitStart.getTime() - paidAt.getTime();
  if (lead < r.accept.failBelowHours * HOUR) return { kind: 'fail', deadline: null };
  const minutes = lead < r.accept.urgentBelowHours * HOUR ? r.accept.urgentWindowMinutes : r.accept.normalWindowMinutes;
  return { kind: lead < r.accept.urgentBelowHours * HOUR ? 'urgent' : 'normal', deadline: new Date(paidAt.getTime() + minutes * MIN) };
}

/** Deadline wins at the same instant. */
export function canAccept(now: Date, deadline: Date): boolean {
  return now.getTime() < deadline.getTime();
}

/** Normal cancel of an unstarted visit, measured from the formal submit time. Booked overtime follows the same %. */
export function cancelRefund(visitStart: Date, submittedAt: Date, paid: number, r: RuleSet = DEFAULT_RULES): { percent: number; refund: number } {
  const lead = visitStart.getTime() - submittedAt.getTime();
  if (lead <= 0) throw new RuleError('VISIT_STARTED', 'Visit already started; report an exception instead');
  let percent = 0;
  if (lead >= r.cancel.fullRefundHours * HOUR) percent = 100;
  else if (lead >= r.cancel.partialRefundHours * HOUR) percent = r.cancel.partialRefundPercent;
  return { percent, refund: percentOf(paid, percent) };
}

/** First 10 min free, then RM5 per started 10 min, capped at 60 min. */
export function waitingFee(minutesWaited: number, r: RuleSet = DEFAULT_RULES): number {
  const m = Math.min(Math.max(0, minutesWaited), r.waiting.maxMinutes);
  if (m <= r.waiting.freeMinutes) return 0;
  return Math.ceil((m - r.waiting.freeMinutes) / r.waiting.blockMinutes) * r.waiting.feePerBlock;
}

/** Refund for overtime units paid but not used; a started unit counts as used. */
export function unusedOvertimeRefund(unitsPaid: number, minutesUsed: number, r: RuleSet = DEFAULT_RULES): number {
  const used = Math.min(unitsPaid, Math.ceil(Math.max(0, minutesUsed) / 15));
  return (unitsPaid - used) * r.price.overtimePer15;
}

export type ShareKind = 'service' | 'overtime' | 'waiting' | 'no_handover' | 'caregiver_fault';

export function caregiverShare(kind: ShareKind, amount: number, r: RuleSet = DEFAULT_RULES): number {
  switch (kind) {
    case 'service':
    case 'overtime':
      return percentOf(amount, r.split.caregiverServicePercent);
    case 'waiting':
      return percentOf(amount, r.split.caregiverWaitingPercent);
    case 'no_handover':
      return percentOf(amount, r.split.noHandoverCaregiverPercent);
    case 'caregiver_fault':
      return 0;
  }
}

export function reportConfirmDeadline(submittedAt: Date, r: RuleSet = DEFAULT_RULES): Date {
  return new Date(submittedAt.getTime() + r.report.confirmWindowHours * HOUR);
}

/** Malaysia calendar day number and minute of day. */
function myt(d: Date): { day: number; minuteOfDay: number } {
  const t = d.getTime() + MYT_OFFSET;
  return { day: Math.floor(t / (24 * HOUR)), minuteOfDay: Math.floor((t % (24 * HOUR)) / MIN) };
}

/** Booking draft limits: service hours, 3 h lead, 60 days ahead, 20 days per order, 3 visits per day. */
export function checkBookingPlan(now: Date, visitStarts: Date[], r: RuleSet = DEFAULT_RULES): void {
  if (visitStarts.length === 0) throw new RuleError('NO_VISITS', 'Add at least one visit');
  const b = r.booking;
  const sorted = [...visitStarts].sort((a, c) => a.getTime() - c.getTime());
  if (sorted[0].getTime() - now.getTime() < r.accept.failBelowHours * HOUR) {
    throw new RuleError('TOO_SOON', `First visit must be at least ${r.accept.failBelowHours} hours from now`);
  }
  const perDay = new Map<number, number>();
  for (const v of sorted) {
    const { day, minuteOfDay } = myt(v);
    if (minuteOfDay < b.firstHour * 60 || minuteOfDay > b.lastHour * 60) {
      throw new RuleError('OUTSIDE_HOURS', 'Visits can start between 7:00 am and 10:00 pm');
    }
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if ((perDay.get(day) ?? 0) > b.maxVisitsPerDay) throw new RuleError('TOO_MANY_VISITS', `At most ${b.maxVisitsPerDay} visits per day`);
  }
  const today = myt(now).day;
  const first = myt(sorted[0]).day;
  const last = myt(sorted[sorted.length - 1]).day;
  if (last - today > b.maxDaysAhead) throw new RuleError('TOO_FAR', `Book up to ${b.maxDaysAhead} days ahead`);
  if (last - first + 1 > b.maxOrderDays) throw new RuleError('ORDER_TOO_LONG', `One order can cover at most ${b.maxOrderDays} days`);
}

export function formatRM(sen: number): string {
  const s = (sen / 100).toFixed(2);
  return `RM${s.endsWith('.00') ? s.slice(0, -3) : s}`;
}

export interface PriceRow {
  service: string;
  price: string;
  minMinutes: number;
}

/** Price list shown on the owner home page (O01) and admin rules page (A15). */
export function priceList(r: RuleSet = DEFAULT_RULES): PriceRow[] {
  const perCat = `Dog price + ${formatRM(r.price.mixedPerCat)} per cat`;
  return [
    { service: 'Cat', price: formatRM(r.price.cat), minMinutes: r.minMinutes.cat },
    { service: 'Dog basic', price: formatRM(r.price.dogBasic), minMinutes: r.minMinutes.dogBasic },
    { service: 'Dog upgrade', price: formatRM(r.price.dogUpgrade), minMinutes: r.minMinutes.dogUpgrade },
    { service: 'Mixed basic', price: perCat, minMinutes: r.minMinutes.mixedBasic },
    { service: 'Mixed upgrade', price: perCat, minMinutes: r.minMinutes.mixedUpgrade },
    { service: 'Extra pet', price: `${formatRM(r.price.extraPet)} each`, minMinutes: 0 },
    { service: 'Overtime', price: `${formatRM(r.price.overtimePer15)} per 15 min`, minMinutes: 0 },
  ];
}

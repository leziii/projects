import { DEFAULT_RULES, dayText, formatRM, timeText, type BookingDraft, type BookingVisit, type DraftInput, type PayProblem, type PetKind, type ServiceLevel } from '@pawpal/shared';

/** The level choice (R18-1): none for cats only; minimum time depends on dogs only or mixed. */
export function levelOptions(kinds: PetKind[]): { value: ServiceLevel; label: string }[] {
  if (!kinds.includes('dog')) return [];
  const m = DEFAULT_RULES.minMinutes;
  const mixed = kinds.includes('cat');
  return [
    { value: 'basic', label: `Basic · ≥${mixed ? m.mixedBasic : m.dogBasic} min` },
    { value: 'upgrade', label: `Upgrade · ≥${mixed ? m.mixedUpgrade : m.dogUpgrade} min` },
  ];
}

/** 0–60 min per visit in 15-minute units (R18-2). */
export const OVERTIME_OPTIONS = [0, 1, 2, 3, 4].map((u) => ({ value: u, label: u ? `+${u * 15} min` : 'None' }));

export const draftInput = (d: BookingDraft): DraftInput => ({ petIds: d.petIds, level: d.level, overtimeUnits: d.overtimeUnits, addressId: d.addressId, visits: d.visits });

/** Adds a visit unless that date and time is already there; kept in date and time order. */
export function addVisit(visits: BookingVisit[], v: BookingVisit): BookingVisit[] {
  if (visits.some((x) => x.date === v.date && x.start === v.start)) return visits;
  return [...visits, v].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

export const removeVisit = (visits: BookingVisit[], v: BookingVisit) => visits.filter((x) => x.date !== v.date || x.start !== v.start);

/** Visits by date for the list: "Sun 1 Nov" → 9:00 am, 6:00 pm. */
export function visitDays(visits: BookingVisit[]): { date: string; title: string; visits: (BookingVisit & { time: string })[] }[] {
  const dates = [...new Set(visits.map((v) => v.date))];
  return dates.map((date) => ({ date, title: dayText(date), visits: visits.filter((v) => v.date === date).map((v) => ({ ...v, time: timeText(v.start) })) }));
}

const KIND_LABEL = { cat: 'Cat', dog: 'Dog', mixed: 'Dog + cats' } as const;

/** "Dog + cats RM70 + overtime RM10 = RM80 · 60 min" */
export function lineText(q: BookingDraft['summary']['lines'][number]['quote']): string {
  const parts = [`${KIND_LABEL[q.serviceKind]} ${formatRM(q.basePrice)}`];
  if (q.extraPetFee) parts.push(`extra pet ${formatRM(q.extraPetFee)}`);
  if (q.overtimeFee) parts.push(`overtime ${formatRM(q.overtimeFee)}`);
  return `${parts.join(' + ')} = ${formatRM(q.total)} · ${q.totalMinutes} min`;
}

/** What the Next button says underneath (R19-4, R19-6). */
export function nextHint(d: BookingDraft): string {
  if (d.summary.blocks.length) return d.summary.blocks[0];
  if (!d.caregiver) return 'Ready. Choose a caregiver next.';
  return d.entry ? 'All set. Next: check everything and pay.' : 'Caregiver chosen. Next: tell them how to get in.';
}

/** The O06 button (R20-5): choose a caregiver first, then how to get in, then confirm and pay (O10). */
export function nextStep(d: BookingDraft): { label: string; url: string } {
  if (!d.caregiver) return { label: 'Next: choose a caregiver', url: '/pages/booking/caregivers' };
  if (!d.entry) return { label: 'Next: how to get in', url: '/pages/booking/entry' };
  return { label: 'Next: confirm and pay', url: CONFIRM_URL };
}

export const CONFIRM_URL = '/pages/booking/confirm';

/** Where each O10 problem is fixed (R21-3). A promo code problem is fixed on O10 itself by removing the code. */
export const FIX_URL: Record<Exclude<PayProblem['fix'], 'promo'>, { label: string; url: string }> = {
  setup: { label: 'Change booking', url: '/pages/booking/index' },
  pets: { label: 'See my pets', url: '/pages/pets/index' },
  caregiver: { label: 'Choose a caregiver', url: '/pages/booking/caregivers' },
  entry: { label: 'How to get in', url: '/pages/booking/entry' },
};

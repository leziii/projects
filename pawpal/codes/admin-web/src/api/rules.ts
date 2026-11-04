import { INSURANCE_NOTE_MAX, formatRM, formatWhatsapp, type Insurance, type RuleSet, type StatusChange, type SupportInfo } from '@pawpal/shared';
import { api } from './payments';

export async function fetchRules(fetcher: typeof fetch = fetch): Promise<RuleSet | null> {
  try {
    const res = await fetcher('/api/rules');
    return res.ok ? ((await res.json()) as RuleSet) : null;
  } catch {
    return null;
  }
}

export interface RuleRow {
  item: string;
  rule: string;
}

/** Key limits shown on the admin rules page (A15). */
export function ruleSummary(r: RuleSet): RuleRow[] {
  return [
    { item: 'Capacity', rule: `Max ${r.capacity.maxPets} pets, max ${r.capacity.maxDogs} dogs` },
    {
      item: 'Accept window',
      rule: `<${r.accept.failBelowHours} h: fail · ${r.accept.failBelowHours}–${r.accept.urgentBelowHours} h: urgent, ${r.accept.urgentWindowMinutes} min · ≥${r.accept.urgentBelowHours} h: normal, ${r.accept.normalWindowMinutes / 60} h`,
    },
    {
      item: 'Cancel refund',
      rule: `≥${r.cancel.fullRefundHours} h: 100% · ${r.cancel.partialRefundHours}–${r.cancel.fullRefundHours} h: ${r.cancel.partialRefundPercent}% · <${r.cancel.partialRefundHours} h: 0%`,
    },
    {
      item: 'Waiting',
      rule: `First ${r.waiting.freeMinutes} min free, then ${formatRM(r.waiting.feePerBlock)} per ${r.waiting.blockMinutes} min, max ${r.waiting.maxMinutes} min`,
    },
    { item: 'Split', rule: `Caregiver ${r.split.caregiverServicePercent}%, platform ${100 - r.split.caregiverServicePercent}%` },
    { item: 'Report', rule: `Min ${r.report.minPhotos} photos, confirm within ${r.report.confirmWindowHours} h` },
    {
      item: 'Booking',
      rule: `${r.booking.firstHour}:00–${r.booking.lastHour}:00 · up to ${r.booking.maxDaysAhead} days ahead · max ${r.booking.maxOrderDays} days per order · max ${r.booking.maxVisitsPerDay} visits/day`,
    },
  ];
}

export async function fetchSupport(fetcher: typeof fetch = fetch): Promise<SupportInfo | null> {
  try {
    const res = await fetcher('/api/support');
    return res.ok ? ((await res.json()) as SupportInfo) : null;
  } catch {
    return null;
  }
}

/** The support row on the rules page: the number in use, and how to change it. */
export function supportSummary(info: SupportInfo | null): string {
  if (!info) return 'Server not reachable';
  if (!info.whatsapp) return 'Not set · set SUPPORT_WHATSAPP in server/.env';
  const shown = formatWhatsapp(info.whatsapp);
  return info.placeholder ? `${shown} (placeholder) · set SUPPORT_WHATSAPP in server/.env` : shown;
}

export interface InsuranceAdmin {
  insurance: Insurance;
  history: StatusChange[];
}

export interface InsuranceForm extends Insurance {
  reason: string;
}

export const fetchInsurance = (f?: typeof fetch) => api<InsuranceAdmin>('/admin/insurance', undefined, f);
export const saveInsurance = (form: InsuranceForm, f?: typeof fetch) => api<InsuranceAdmin>('/admin/insurance', form, f);

/** Why Save is off, or '' (R17-3: on needs a note; every change needs a reason). */
export function insuranceBlock(form: InsuranceForm, now: Insurance): string {
  const note = form.note.trim();
  if (form.on === now.on && note === now.note) return 'Nothing changed';
  if (form.on && note.length < 5) return 'Write what the insurance covers (at least 5 characters)';
  if (note.length > INSURANCE_NOTE_MAX) return `Note: at most ${INSURANCE_NOTE_MAX} characters`;
  if (form.reason.trim().length < 5) return 'Give a reason for the change (at least 5 characters)';
  return '';
}

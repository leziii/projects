/**
 * Booking requests for the caregiver (E6-1, S01 and S06). Settled with KF in round 25.
 */
import { visitTime } from './booking';
import type { OrderVisit } from './orders';
import { caregiverShare, type PetKind } from './rules';
import { dayText, timeText } from './schedule';

export const REQUEST_RULES = { historyDays: 30, tickMs: 60_000 } as const;

/** Why the caregiver says no (R26-5). The owner never sees it. */
export type RejectReason = 'not_free' | 'too_far' | 'pets' | 'other';
export const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: 'not_free', label: 'Not free' },
  { value: 'too_far', label: 'Too far' },
  { value: 'pets', label: 'Pets not suitable' },
  { value: 'other', label: 'Other' },
];

/** What the caregiver sees once the order is booked (R26-4). Entry details come in E8-2. */
export interface VisitAddress {
  street: string;
  unit: string;
  postcode: string;
  contactName: string;
  contactPhone: string;
}

/** A clashing visit when Accept is refused (R26-1). */
export interface ClashProblem {
  code: 'SCHEDULE_CLASH';
  message: string;
  clashes: { date: string; start: number }[];
}

/** "These visits clash with your schedule: Tue 3 Nov · 9:00 am. Free that time in your schedule, or say no." */
export const clashText = (clashes: { date: string; start: number }[]) =>
  `${clashes.length === 1 ? 'This visit clashes' : 'These visits clash'} with your schedule: ${clashes.map(visitWhen).join(', ')}. Free that time in your schedule, or say no.`;

/** Why a request is no longer open (S06 History). Withdraw comes in E6-4, reject in E6-2. */
export type RequestEnd = 'expired' | 'withdrawn' | 'rejected' | 'accepted';
export const REQUEST_END_LABEL: Record<RequestEnd, string> = { expired: 'Expired', withdrawn: 'Owner withdrew', rejected: 'You said no', accepted: 'Accepted' };

/** One request as the caregiver sees it: area only, never the street (R25-3). */
export interface RequestCard {
  orderId: number;
  number: string;
  urgent: boolean;
  /** Kuala Lumpur time, "YYYY-MM-DD HH:MM:SS.mmm". */
  deadline: string;
  firstVisit: { date: string; start: number };
  visits: number;
  area: string;
  pets: string;
  incomeSen: number;
}

export interface RequestHistoryRow {
  orderId: number;
  number: string;
  end: RequestEnd;
  /** When it ended (KL time). */
  at: string;
  firstVisit: { date: string; start: number };
  visits: number;
  area: string;
}

export interface RequestList {
  open: RequestCard[];
  history: RequestHistoryRow[];
}

/** The detail page (R25-7): visits, pets and area. Accept and reject come in E6-2. */
export interface RequestDetail extends RequestCard {
  open: boolean;
  end: RequestEnd | null;
  visitLines: { label: string; minutes: number; incomeSen: number }[];
  petList: { name: string; kind: PetKind }[];
  /** Only once accepted (R26-4). */
  address: VisitAddress | null;
}

/** "2026-11-02 13:45:00.000" (Kuala Lumpur) → the moment. */
export const klInstant = (at: string) => new Date(`${at.slice(0, 19).replace(' ', 'T')}+08:00`);

/** "2 h 10 min left", "24 min left", "Under 1 min left"; null once the time is up (R25-5). */
export function timeLeftText(deadline: string, now: Date): string | null {
  const ms = klInstant(deadline).getTime() - now.getTime();
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Under 1 min left';
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min left` : `${min} min left`;
}

/** "1 dog", "2 cats, 1 dog". */
export function petsText(pets: { kind: PetKind }[]): string {
  const n = (k: PetKind) => pets.filter((p) => p.kind === k).length;
  const part = (k: PetKind, c: number) => `${c} ${k}${c === 1 ? '' : 's'}`;
  return (['dog', 'cat'] as PetKind[])
    .filter((k) => n(k) > 0)
    .map((k) => part(k, n(k)))
    .join(', ');
}

/** The caregiver's 85% of the full price of each visit; promos and credit never change it (R7-3, R23, R24-6). */
export const visitIncome = (v: Pick<OrderVisit, 'quote'>) => caregiverShare('service', v.quote.total);

export const firstVisitOf = <V extends { date: string; start: number }>(visits: V[]): V => [...visits].sort((a, b) => visitTime(a).getTime() - visitTime(b).getTime())[0];

/** "Tue 3 Nov · 8:00 am" */
export const visitWhen = (v: { date: string; start: number }) => `${dayText(v.date)} · ${timeText(v.start)}`;

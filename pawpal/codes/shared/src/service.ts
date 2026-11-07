import type { PetKind } from './rules';
import { klInstant } from './requests';
import { dayText, klDate, timeText } from './schedule';

/** E8-4 S11 (R36-2 … R36-4): recording one visit's service. */
export const SERVICE_RULES = { maxPhotos: 9, minPhotos: 3, photoMaxBytes: 10 * 1024 * 1024, shrinkToPx: 1600 } as const;

export type CheckItem = 'feed' | 'water' | 'litter' | 'walk';
export const CHECK_ITEMS: readonly CheckItem[] = ['feed', 'water', 'litter', 'walk'];
export const CHECK_LABEL: Record<CheckItem, string> = { feed: 'Feed', water: 'Fresh water', litter: 'Litter', walk: 'Walk' };

export interface CheckRow {
  item: CheckItem;
  done: boolean;
}

export const isCheckItem = (v: unknown): v is CheckItem => typeof v === 'string' && (CHECK_ITEMS as readonly string[]).includes(v);

/** R36-3: Feed and Fresh water always, Litter if there is a cat, Walk if there is a dog. */
export function checklistFor(pets: { kind: PetKind }[]): CheckItem[] {
  const items: CheckItem[] = ['feed', 'water'];
  if (pets.some((p) => p.kind === 'cat')) items.push('litter');
  if (pets.some((p) => p.kind === 'dog')) items.push('walk');
  return items;
}

/** Whole minutes served since entry (KL time string), never below 0. */
export function servedMinutes(enteredAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - klInstant(enteredAt).getTime()) / 60_000));
}

/** R36-2: "Served 23 min / at least 45 min" */
export const servedText = (served: number, minMinutes: number) => `Served ${served} min / at least ${minMinutes} min`;

/** R36-5: the question before finishing early; null once the minimum is reached. */
export const finishEarlyText = (served: number, minMinutes: number): string | null =>
  served >= minMinutes ? null : `You have served ${served} of ${minMinutes} min. Finish anyway?`;

/** "3 of 9 photos" */
export const photoCountText = (n: number) => `${n} of ${SERVICE_RULES.maxPhotos} photos`;

/** E8-5 S12 (R37-1 … R37-4) */
export const REPORT_RULES = { noteMax: 500, confirmHours: 12 } as const;

/** R37-1: what still stops the report from being sent; empty when it can go. */
export function reportProblems(r: { photos: unknown[]; checklist: CheckRow[]; note: string }): string[] {
  const out: string[] = [];
  if (r.photos.length < SERVICE_RULES.minPhotos) out.push(`Add at least ${SERVICE_RULES.minPhotos} photos (${r.photos.length} so far)`);
  const open = r.checklist.filter((c) => !c.done).map((c) => CHECK_LABEL[c.item]);
  if (open.length && !r.note.trim()) out.push(`Add a note on why ${open.join(', ')} ${open.length > 1 ? 'were' : 'was'} not done`);
  if (r.note.length > REPORT_RULES.noteMax) out.push(`Keep the note under ${REPORT_RULES.noteMax} characters`);
  return out;
}

/** KL "YYYY-MM-DD HH:MM:SS" 12 h after the report was sent. */
export function confirmByOf(reportedAt: string): string {
  return new Date(klInstant(reportedAt).getTime() + REPORT_RULES.confirmHours * 3600_000 + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

const at = (kl: string, sameDayAs?: string) => {
  const time = timeText(Number(kl.slice(11, 13)) * 60 + Number(kl.slice(14, 16)));
  return sameDayAs && kl.slice(0, 10) === sameDayAs.slice(0, 10) ? time : `${time}, ${dayText(kl.slice(0, 10))}`;
};

/** R37-4: "Sent 9:51 am · owner confirms by 9:51 pm" (the day is added when it is another day). */
export function sentText(reportedAt: string, now: Date): string {
  const today = `${klDate(now)} `;
  return `Sent ${at(reportedAt, today)} · owner confirms by ${at(confirmByOf(reportedAt), reportedAt)}`;
}

/** "9:51 pm, Wed 4 Nov" — the owner's deadline in messages. */
export const confirmByText = (reportedAt: string) => at(confirmByOf(reportedAt));

/** E9-1 O17 (R39-2): the sent report as the owner reads it. */
export interface VisitReport {
  orderId: number;
  number: string;
  /** 0-based visit index. */
  index: number;
  date: string;
  start: number;
  /** "Siti A." */
  caregiver: string;
  reportedAt: string;
  photos: number[];
  checklist: CheckRow[];
  note: string;
  /** E9-2: report_sent until the owner confirms (or 12 h pass), or raises a problem. */
  status: 'report_sent' | 'confirmed' | 'disputed';
  confirmedAt: string | null;
  confirmedBy: 'owner' | 'auto' | null;
}

/** R39-2: "Sent 9:51 am, Thu 5 Nov" */
export const reportSentText = (reportedAt: string) => `Sent ${at(reportedAt)}`;

/** R39-2: "Please check by 9:51 pm, Thu 5 Nov" */
export const checkByText = (reportedAt: string) => `Please check by ${confirmByText(reportedAt)}`;

/** R39-1 O13 visit row: "Report ready · check by 9:51 pm" (the day is added when it is not today). */
export function reportReadyText(reportedAt: string, now: Date): string {
  return `Report ready · check by ${at(confirmByOf(reportedAt), `${klDate(now)} `)}`;
}

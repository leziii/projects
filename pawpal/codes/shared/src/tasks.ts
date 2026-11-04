/**
 * E8-1 "My tasks" (S08, R33-1 … R33-6): the caregiver's visits of accepted orders, day by day.
 */
import { visitTime, type EntryMethod } from './booking';
import { addDays, dayText, klDate, timeText } from './schedule';
import type { PetKind, ServiceLevel } from './rules';
import { petsText, type VisitAddress } from './requests';

export const TASK_RULES = { days: 14 } as const;

/** R35-1: To do → Arrived → In service; report stages come with E8-5, "cancelled" with E10. */
export type TaskStatus = 'todo' | 'arrived' | 'in_service' | 'cancelled';
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', arrived: 'Arrived', in_service: 'In service', cancelled: 'Cancelled' };

/** How far one visit has got (R35-1, R35-5); times are KL "YYYY-MM-DD HH:MM:SS.mmm". */
export interface VisitRun {
  status: TaskStatus;
  arrivedAt: string | null;
  enteredAt: string | null;
  enteredBy: 'caregiver' | 'owner' | null;
}

export const NOT_STARTED: VisitRun = { status: 'todo', arrivedAt: null, enteredAt: null, enteredBy: null };

/** R35-2: "I've arrived" works from 30 min before the planned start. */
export const VISIT_RULES = { arriveFromMin: 30 } as const;

export interface Task {
  orderId: number;
  /** Which visit of the order (its place in the order's visit list). */
  index: number;
  number: string;
  date: string;
  /** Minutes after midnight. */
  start: number;
  minutes: number;
  area: string;
  pets: { name: string; kind: PetKind }[];
  status: TaskStatus;
  arrivedAt: string | null;
  enteredAt: string | null;
  enteredBy: 'caregiver' | 'owner' | null;
}

export interface TaskList {
  /** The 14 days from today, with how many tasks each has (R33-2). */
  days: { date: string; count: number }[];
  date: string;
  tasks: Task[];
  /** The caregiver's travel buffer (R16-2), for the gap lines. */
  bufferMin: number;
}

/** The 14 dates the row shows, from today (KL). */
export const taskDates = (now: Date) => Array.from({ length: TASK_RULES.days }, (_, i) => addDays(klDate(now), i));

/** "9:00 – 9:45 am" */
export function taskTime(t: Pick<Task, 'start' | 'minutes'>): string {
  const from = timeText(t.start);
  const to = timeText(t.start + t.minutes);
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)} – ${to}` : `${from} – ${to}`;
}

/** "Mimi, Bobo · 1 dog, 1 cat" */
export const taskPets = (t: Pick<Task, 'pets'>) => `${t.pets.map((p) => p.name).join(', ')} · ${petsText(t.pets)}`;

/** R33-4: the free time between two tasks; tight when it is under the travel buffer. Null when either is cancelled. */
export function taskGap(prev: Task, next: Task, bufferMin: number): { text: string; tight: boolean } | null {
  if (prev.status === 'cancelled' || next.status === 'cancelled') return null;
  const gap = next.start - (prev.start + prev.minutes);
  const h = Math.floor(Math.abs(gap) / 60);
  const m = Math.abs(gap) % 60;
  const len = gap < 0 ? `${h ? `${h} h ` : ''}${m} min overlap` : h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  return gap < bufferMin ? { text: `Tight: ${len}`, tight: true } : { text: `${len} gap`, tight: false };
}

/** E8-2 S09 (R34-4): entry instructions open 2 h before the visit and close when it ends. */
export const ENTRY_RULES = { showBeforeMin: 120 } as const;

export interface VisitPet {
  name: string;
  kind: PetKind;
  breed: string | null;
  birth: { year: number; month: number };
  weightKg: number | null;
  healthNote: string;
}

/** What the caregiver's visit page (S09) shows (R34-2 … R34-6). */
export interface VisitTask extends Task {
  level: ServiceLevel;
  serviceKind: 'cat' | 'dog' | 'mixed';
  minMinutes: number;
  incomeSen: number;
  petDetails: VisitPet[];
  address: (VisitAddress & { area: string }) | null;
  entryMethod: EntryMethod;
  /** Only inside the window and never on a cancelled visit; null otherwise. */
  entry: { keyLock: string; guard: string; notes: string } | null;
  /** When the instructions open, KL time "YYYY-MM-DD HH:MM". */
  entryFrom: string;
}

/** R34-4: is now inside the entry window of this visit? */
export function entryOpen(v: Pick<Task, 'date' | 'start' | 'minutes' | 'status'>, now: Date): boolean {
  if (v.status === 'cancelled') return false;
  const start = visitTime(v).getTime();
  return now.getTime() >= start - ENTRY_RULES.showBeforeMin * 60_000 && now.getTime() <= start + v.minutes * 60_000;
}

/** KL "YYYY-MM-DD HH:MM" of the moment the instructions open. */
export function entryFromOf(v: Pick<Task, 'date' | 'start'>): string {
  const at = new Date(visitTime(v).getTime() - ENTRY_RULES.showBeforeMin * 60_000 + 8 * 3600_000).toISOString();
  return `${at.slice(0, 10)} ${at.slice(11, 16)}`;
}

/** "Shown from 7:00 am" today, otherwise "Shown from 7:00 am, Wed 5 Nov". */
export function entryFromText(from: string, now: Date): string {
  const time = timeText(Number(from.slice(11, 13)) * 60 + Number(from.slice(14, 16)));
  return from.slice(0, 10) === klDate(now) ? `Shown from ${time}` : `Shown from ${time}, ${dayText(from.slice(0, 10))}`;
}

/** R34-4: why the instructions are hidden: not open yet ("Shown from 7:00 am"), or the visit is over. */
export function entryLockedText(v: Pick<Task, 'date' | 'start' | 'minutes'> & { entryFrom: string }, now: Date): string {
  const end = visitTime(v).getTime() + v.minutes * 60_000;
  return now.getTime() > end ? 'Hidden: the visit time has passed' : entryFromText(v.entryFrom, now);
}

/** "Basic care · at least 45 min" */
export const visitServiceText = (v: Pick<VisitTask, 'level' | 'minMinutes'>) => `${v.level === 'upgrade' ? 'Upgrade care' : 'Basic care'} · at least ${v.minMinutes} min`;

/** R35-2: from 30 min before the start until the planned end, while still To do. */
export function canArrive(v: Pick<Task, 'date' | 'start' | 'minutes' | 'status'>, now: Date): boolean {
  if (v.status !== 'todo') return false;
  const start = visitTime(v).getTime();
  return now.getTime() >= start - VISIT_RULES.arriveFromMin * 60_000 && now.getTime() <= start + v.minutes * 60_000;
}

/** "From 8:30 am" — when "I've arrived" starts working. */
export const arriveFromText = (v: Pick<Task, 'start'>) => `From ${timeText(v.start - VISIT_RULES.arriveFromMin)}`;

const clock = (at: string) => timeText(Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16)));

/** R35-5: "Arrived 8:58 am" */
export const arrivedText = (at: string) => `Arrived ${clock(at)}`;

/** R35-5: "Entered 9:02 am (confirmed by you)" — `viewer` is who reads it. */
export function enteredText(at: string, by: 'caregiver' | 'owner', viewer: 'caregiver' | 'owner'): string {
  const who = by === viewer ? 'you' : by === 'owner' ? 'the owner' : 'the caregiver';
  return `Entered ${clock(at)} (confirmed by ${who})`;
}

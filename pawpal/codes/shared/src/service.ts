import type { PetKind } from './rules';
import { klInstant } from './requests';

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

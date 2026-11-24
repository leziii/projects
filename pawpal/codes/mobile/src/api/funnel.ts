import type { FunnelStep } from '@pawpal/shared';
import { api, type Requester } from './client';

const VISITOR_KEY = 'pawpal.visitor';

/** A random id for this phone, kept in storage: it says nothing about the person (R61-4). */
export function visitorId(store: { get: (k: string) => string; set: (k: string, v: string) => void } = { get: (k) => uni.getStorageSync(k) || '', set: (k, v) => uni.setStorageSync(k, v) }): string {
  const known = store.get(VISITOR_KEY);
  if (/^[A-Za-z0-9-]{8,64}$/.test(known)) return known;
  const id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  store.set(VISITOR_KEY, id);
  return id;
}

/** E15-3 (R61-4): tells the server this person reached a step. Never blocks or breaks the page. */
export function trackStep(step: Exclude<FunnelStep, 'paid'>, send?: Requester, visitor = visitorId()): Promise<void> {
  return api('/funnel', { step, visitor }, send).then(
    () => undefined,
    () => undefined,
  );
}

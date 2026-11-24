import type { ActionKind, ActionLogPage } from '@pawpal/shared';
import { api } from './payments';

export interface ActionFilters {
  admin: string;
  kind: ActionKind | '';
  from: string;
  to: string;
  page: number;
}

/** "?kind=money&page=2": empty filters are left out. */
export function actionQuery(f: ActionFilters): string {
  const p = new URLSearchParams();
  for (const k of ['admin', 'kind', 'from', 'to'] as const) if ((f[k] ?? '').trim()) p.set(k, f[k].trim());
  if (f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** E14-4 (round 60): the admin action log, read only. */
export const listActions = (f: ActionFilters, fetcher?: typeof fetch) => api<ActionLogPage>(`/admin/actions${actionQuery(f)}`, undefined, fetcher);

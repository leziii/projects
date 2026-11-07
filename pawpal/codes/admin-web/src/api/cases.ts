import type { AdminCaseRow } from '@pawpal/shared';
import { api } from './payments';

/** E9-2 (R40-4, R40-6): problems owners raised; handling and decisions come with E12-5. */
export const listCases = (f?: typeof fetch) => api<AdminCaseRow[]>('/admin/cases', undefined, f);
export const startReview = (id: number, f?: typeof fetch) => api<AdminCaseRow[]>(`/admin/cases/${id}/review`, {}, f);

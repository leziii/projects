import type { AdminCaseRow, AdminProblemRow } from '@pawpal/shared';
import { api } from './payments';

/** E9-2 (R40-4, R40-6): problems owners raised; handling and decisions come with E12-5. */
export const listCases = (f?: typeof fetch) => api<AdminCaseRow[]>('/admin/cases', undefined, f);
export const startReview = (id: number, f?: typeof fetch) => api<AdminCaseRow[]>(`/admin/cases/${id}/review`, {}, f);

/** E12-1 (R49-4): problems caregivers reported; decisions come with E12-3. */
export const listProblems = (f?: typeof fetch) => api<AdminProblemRow[]>('/admin/problems', undefined, f);
export const startProblemReview = (id: number, f?: typeof fetch) => api<AdminProblemRow[]>(`/admin/problems/${id}/review`, {}, f);

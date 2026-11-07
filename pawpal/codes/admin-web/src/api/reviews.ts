import type { AdminReviewRow } from '@pawpal/shared';
import { api } from './payments';

/** E9-3 (R41-6): every review, and hide one with a reason. */
export const listReviews = (f?: typeof fetch) => api<AdminReviewRow[]>('/admin/reviews', undefined, f);
export const hideReview = (id: number, reason: string, f?: typeof fetch) => api<AdminReviewRow[]>(`/admin/reviews/${id}/hide`, { reason }, f);

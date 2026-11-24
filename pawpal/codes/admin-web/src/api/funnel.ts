import type { FunnelReport } from '@pawpal/shared';
import { api } from './payments';

/** E15-3 (R61-4): the booking funnel for the last 7 or 30 days. */
export const fetchFunnel = (days: 7 | 30, fetcher?: typeof fetch) => api<FunnelReport>(`/admin/funnel?days=${days}`, undefined, fetcher);

/** "45%" of the step before, or "–" for the first step and when the step before had nobody. */
export const ofPreviousText = (p: number | null) => (p === null ? '–' : `${p}%`);

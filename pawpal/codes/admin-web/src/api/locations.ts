import type { LocationFlagRow } from '@pawpal/shared';
import { api } from './payments';

/** E8-6 (R38-4): visits whose caregiver location was far, not shared, or had no home position to compare. */
export const locationFlags = (f?: typeof fetch) => api<LocationFlagRow[]>('/admin/location-flags', undefined, f);

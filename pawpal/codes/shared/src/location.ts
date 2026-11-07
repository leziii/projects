/** E8-6 location check (R7-2, R38-1 … R38-6). */
export const LOCATION_RULES = { flagMeters: 500 } as const;

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A real latitude/longitude pair, or null. */
export function geoPointOf(v: unknown): GeoPoint | null {
  if (!v || typeof v !== 'object') return null;
  const { lat, lng } = v as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Metres between two points (haversine). */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const r = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(h)));
}

export type LocationMoment = 'arrive' | 'report';
export const LOCATION_MOMENT_LABEL: Record<LocationMoment, string> = { arrive: "I've arrived", report: 'Report sent' };

/** Why a check is on the admin list; null = fine. */
export type LocationFlag = 'far' | 'not_shared' | 'no_home';
export const LOCATION_FLAG_LABEL: Record<LocationFlag, string> = { far: 'Far from the address', not_shared: 'Location not shared', no_home: 'No home position' };

/** R38-2 … R38-4: distance from home, and whether admin should look. */
export function checkLocation(home: GeoPoint | null, here: GeoPoint | null): { distanceM: number | null; flag: LocationFlag | null } {
  if (!here) return { distanceM: null, flag: 'not_shared' };
  if (!home) return { distanceM: null, flag: 'no_home' };
  const d = distanceM(home, here);
  return { distanceM: d, flag: d > LOCATION_RULES.flagMeters ? 'far' : null };
}

/** "1.2 km" or "350 m" */
export const distanceText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/** R38-6 */
export const LOCATION_NOTICE = 'Your location is saved only now and when you send the report.';

/** One row of the admin Location flags list (R38-4). */
export interface LocationFlagRow {
  id: number;
  orderId: number;
  number: string;
  visit: number;
  moment: LocationMoment;
  flag: LocationFlag;
  distanceM: number | null;
  caregiver: string;
  at: string;
}

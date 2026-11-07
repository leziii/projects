import type { GeoPoint } from '@pawpal/shared';

/**
 * E8-6 (R38-1, R38-3): the phone's location right now, or null when it is refused, off or too slow.
 * Never watched or tracked; one reading per tap.
 */
export function currentLocation(timeoutMs = 8000): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** A Google Maps link that drops a pin on this point. */
export const mapLink = (p: GeoPoint) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

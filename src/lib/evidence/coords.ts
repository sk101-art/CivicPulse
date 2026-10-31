import { PILOT_BOUNDS } from "@/lib/api/validate";

/**
 * Coordinates that older clients substituted when no GPS fix was available (central Bengaluru,
 * the map default). Evidence carrying them was never located on site, so it is always rejected.
 */
export const DEFAULTED_COORDINATES: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: 12.9716, lng: 77.5946 },
];

export function isDefaultedCoordinate(lat: number, lng: number): boolean {
  return DEFAULTED_COORDINATES.some((c) => Math.abs(c.lat - lat) < 1e-6 && Math.abs(c.lng - lng) < 1e-6);
}

export function isInServiceArea(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= PILOT_BOUNDS.minLat &&
    lat <= PILOT_BOUNDS.maxLat &&
    lng >= PILOT_BOUNDS.minLng &&
    lng <= PILOT_BOUNDS.maxLng
  );
}

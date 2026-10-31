/**
 * Shared, null-safe presentation helpers for issue locations, titles and priority.
 * Every page uses these so placeholder addresses never leak into titles.
 */

const PLACEHOLDER_PATTERNS = [/report location/i, /authority pin/i, /pending/i];

/** True when an address is missing or is a placeholder rather than a real place name. */
export function isPlaceholderAddress(address: string | null | undefined): boolean {
  const a = (address ?? "").trim();
  if (!a) return true;
  if (a.toLowerCase() === "bengaluru") return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(a));
}

function formatCoord(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(4) : "?";
}

/** A readable location: the real address, or "Near <lat>, <lng>". */
export function displayLocation(
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined
): string {
  return isPlaceholderAddress(address) ? `Near ${formatCoord(lat)}, ${formatCoord(lng)}` : address!.trim();
}

export function categoryLabel(category: string | null | undefined): string {
  const c = (category ?? "OTHER").replace(/_/g, " ").toLowerCase();
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** "Potholes — MG Road" or "Potholes — Near 12.9250, 77.5938" (no nested brackets). */
export function issueTitle(
  category: string | null | undefined,
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined
): string {
  return `${categoryLabel(category)} — ${displayLocation(address, lat, lng)}`;
}

/** Long free text is clipped for cards; full text stays on the detail page. */
export function clipText(text: string | null | undefined, max = 280): string {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

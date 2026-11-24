export interface BasemapConfig {
  hasKey: boolean;
  isCarto: boolean;
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const OSM_FALLBACK_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Constructs the CARTO raster tile URL with the required API key.
 * CARTO requires the key passed as query parameter: `?key=YOUR_KEY`
 */
export function getCartoTileUrl(
  key?: string,
  style: "voyager" | "dark" | "light" = "voyager"
): string {
  const cleanKey = key?.trim();
  const subpath =
    style === "dark"
      ? "dark_all"
      : style === "light"
      ? "light_all"
      : "rastertiles/voyager";

  if (cleanKey && cleanKey.length > 0) {
    return `https://{s}.basemaps.cartocdn.com/${subpath}/{z}/{x}/{y}.png?key=${encodeURIComponent(cleanKey)}`;
  }
  return `https://{s}.basemaps.cartocdn.com/${subpath}/{z}/{x}/{y}.png`;
}

/**
 * Returns the effective basemap tile configuration.
 * Adheres strictly to fallback behavior: if no CARTO key is configured,
 * provides approved OpenStreetMap tiles to prevent "API KEY REQUIRED" watermarks.
 */
export function getBasemapConfig(
  style: "voyager" | "dark" | "light" = "voyager"
): BasemapConfig {
  const rawKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
  const cartoKey = rawKey?.trim();
  const hasKey = Boolean(cartoKey && cartoKey.length > 0);

  if (hasKey) {
    return {
      hasKey: true,
      isCarto: true,
      url: getCartoTileUrl(cartoKey, style),
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
      maxZoom: 20,
    };
  }

  return {
    hasKey: false,
    isCarto: false,
    url: OSM_FALLBACK_URL,
    attribution: OSM_ATTRIBUTION,
    subdomains: "abc",
    maxZoom: 19,
  };
}

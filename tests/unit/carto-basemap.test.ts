import { describe, it, expect } from "vitest";
import {
  getCartoTileUrl,
  getBasemapConfig,
  CARTO_ATTRIBUTION,
  OSM_ATTRIBUTION,
} from "@/lib/map/carto";

describe("CARTO Basemaps API Key & Tile URL Configuration", () => {
  it("1. Dynamically appends ?key= parameter when a valid key is provided", () => {
    const testKey = "carto_test_secret_key_12345";
    const url = getCartoTileUrl(testKey, "voyager");

    expect(url).toContain("?key=carto_test_secret_key_12345");
    expect(url).toBe(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=carto_test_secret_key_12345"
    );
    expect(url).not.toContain("api_key");
    expect(url).not.toContain("YOUR_KEY");
    expect(url).not.toContain("undefined");
  });

  it("2. Properly encodes special characters in the API key", () => {
    const testKeyWithSpecialChars = "key+with/special&chars==";
    const url = getCartoTileUrl(testKeyWithSpecialChars, "voyager");

    expect(url).toContain(
      `?key=${encodeURIComponent("key+with/special&chars==")}`
    );
    expect(url).not.toContain("&chars=="); // Ensure unencoded ampersand is not present
  });

  it("3. Supports dark and light CARTO basemap styles when requested", () => {
    const testKey = "valid_key";
    const darkUrl = getCartoTileUrl(testKey, "dark");
    const lightUrl = getCartoTileUrl(testKey, "light");

    expect(darkUrl).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=valid_key"
    );
    expect(lightUrl).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=valid_key"
    );
  });

  it("4. Returns fallback OpenStreetMap configuration when key is missing or empty", () => {
    const originalKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
    try {
      delete process.env.NEXT_PUBLIC_CARTO_API_KEY;

      const config = getBasemapConfig("voyager");
      expect(config.hasKey).toBe(false);
      expect(config.isCarto).toBe(false);
      expect(config.url).toBe("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
      expect(config.attribution).toContain("OpenStreetMap");
      expect(config.subdomains).toBe("abc");
    } finally {
      process.env.NEXT_PUBLIC_CARTO_API_KEY = originalKey;
    }
  });

  it("5. Activates CARTO configuration when NEXT_PUBLIC_CARTO_API_KEY is present", () => {
    const originalKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
    try {
      process.env.NEXT_PUBLIC_CARTO_API_KEY = "live_carto_basemap_key";

      const config = getBasemapConfig("voyager");
      expect(config.hasKey).toBe(true);
      expect(config.isCarto).toBe(true);
      expect(config.url).toBe(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=live_carto_basemap_key"
      );
      expect(config.attribution).toContain("CARTO");
      expect(config.attribution).toContain("OpenStreetMap");
      expect(config.subdomains).toBe("abcd");
      expect(config.maxZoom).toBe(20);
    } finally {
      process.env.NEXT_PUBLIC_CARTO_API_KEY = originalKey;
    }
  });

  it("6. Contains correct legal attributions for both OpenStreetMap and CARTO", () => {
    expect(CARTO_ATTRIBUTION).toContain("OpenStreetMap");
    expect(CARTO_ATTRIBUTION).toContain("CARTO");
    expect(OSM_ATTRIBUTION).toContain("OpenStreetMap");
  });
});

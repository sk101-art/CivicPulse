"use client";

import React, { useState, useCallback } from "react";
import { TileLayer } from "react-leaflet";
import {
  getCartoTileUrl,
  getBasemapConfig,
  CARTO_ATTRIBUTION,
  OSM_ATTRIBUTION,
  OSM_FALLBACK_URL,
  type BasemapConfig,
} from "@/lib/map/carto";

export {
  getCartoTileUrl,
  getBasemapConfig,
  CARTO_ATTRIBUTION,
  OSM_ATTRIBUTION,
  OSM_FALLBACK_URL,
  type BasemapConfig,
};

export interface CartoTileLayerProps {
  style?: "voyager" | "dark" | "light";
  maxZoom?: number;
}

/**
 * Shared CartoTileLayer for all Leaflet map views.
 * Dynamically binds `process.env.NEXT_PUBLIC_CARTO_API_KEY`.
 * Automatically falls back to OpenStreetMap if key is missing or invalid.
 */
export function CartoTileLayer({
  style = "voyager",
  maxZoom = 20,
}: CartoTileLayerProps) {
  const rawKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
  const cartoKey = rawKey?.trim();
  const hasValidKey = Boolean(cartoKey && cartoKey.length > 0);

  // If no key is configured in env, fallback to OpenStreetMap immediately
  // to avoid CARTO's "API KEY REQUIRED" watermark
  const [useFallback, setUseFallback] = useState(!hasValidKey);

  const handleTileError = useCallback(() => {
    // If tiles fail to load (e.g. 401/403/invalid key), immediately switch to approved fallback
    setUseFallback(true);
  }, []);

  if (useFallback || !hasValidKey) {
    return (
      <TileLayer
        url={OSM_FALLBACK_URL}
        attribution={OSM_ATTRIBUTION}
        maxZoom={Math.min(maxZoom, 19)}
        subdomains="abc"
      />
    );
  }

  const tileUrl = getCartoTileUrl(cartoKey, style);

  return (
    <TileLayer
      url={tileUrl}
      attribution={CARTO_ATTRIBUTION}
      maxZoom={maxZoom}
      subdomains="abcd"
      eventHandlers={{
        tileerror: handleTileError,
      }}
    />
  );
}

/**
 * Map Configuration Error / Notice Banner.
 * Displays a tactile notice only when CARTO API Key is not configured,
 * informing the user/admin that the OpenStreetMap fallback basemap is active.
 */
export function CartoConfigNotice({ className = "" }: { className?: string }) {
  const rawKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
  const cartoKey = rawKey?.trim();
  if (cartoKey && cartoKey.length > 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`absolute bottom-3 left-3 z-[1000] px-2.5 py-1.5 rounded-lg bg-[#FAF9F5]/95 backdrop-blur-sm border border-[#DDDCD3] shadow-[0_1px_3px_rgba(41,55,50,0.06)] flex items-center gap-2 text-[10px] text-[#65736B] font-mono pointer-events-auto select-none ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
      <span>
        CARTO key unconfigured (<code>NEXT_PUBLIC_CARTO_API_KEY</code>). Active: OpenStreetMap fallback.
      </span>
    </div>
  );
}

"use client";

import React from "react";
import { TileLayer } from "react-leaflet";

export interface TrafficTilesLayerProps {
  apiKey?: string;
  opacity?: number;
}

export function TrafficTilesLayer({
  apiKey,
  opacity = 0.65,
}: TrafficTilesLayerProps) {
  const envKey = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_TOMTOM_KEY : "";
  const effectiveKey = (apiKey || envKey || "").trim();

  if (!effectiveKey) {
    // Keys-later mode: render friendly non-blocking notice badge
    return (
      <div className="leaflet-bottom leaflet-left" style={{ pointerEvents: "auto", margin: "12px" }}>
        <div className="px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-500/40 text-amber-300 text-xs font-mono shadow-2xl backdrop-blur-md flex items-center gap-2">
          <span>⚠️</span>
          <span>Traffic flow tiles disabled – TomTom key not set</span>
        </div>
      </div>
    );
  }

  // TomTom Traffic Flow relative0 tile URL
  const tileUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${effectiveKey}`;

  return (
    <TileLayer
      url={tileUrl}
      opacity={opacity}
      zIndex={400}
      attribution='&copy; <a href="https://www.tomtom.com/">TomTom</a> Traffic'
    />
  );
}

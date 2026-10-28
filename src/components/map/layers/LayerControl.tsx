"use client";

import React, { useState } from "react";

export interface LayerControlProps {
  showIssues: boolean;
  onToggleIssues: (val: boolean) => void;
  showTraffic: boolean;
  onToggleTraffic: (val: boolean) => void;
  isTrafficKeySet?: boolean;
}

export function LayerControl({
  showIssues,
  onToggleIssues,
  showTraffic,
  onToggleTraffic,
  isTrafficKeySet = false,
}: LayerControlProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-[1010] flex flex-col items-end pointer-events-auto">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="px-3 py-2 rounded-xl bg-gray-950/90 backdrop-blur-md border border-white/10 text-white hover:text-cyan-400 hover:border-cyan-400/50 shadow-2xl transition flex items-center gap-2 text-xs font-mono font-bold"
        title="Toggle Map Layers"
        aria-label="Map Layers"
      >
        <span>🗺️</span>
        <span className="hidden sm:inline">Layers</span>
        <span className="text-[10px] text-white/40">{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Layer options dropdown panel */}
      {isOpen && (
        <div className="mt-2 w-56 rounded-2xl bg-gray-950/95 backdrop-blur-xl border border-white/10 p-3 shadow-2xl space-y-2.5 text-xs font-mono">
          <div className="text-[10px] uppercase font-black tracking-widest text-white/40 pb-1 border-b border-white/5">
            Map Overlays
          </div>

          {/* Issues Layer Toggle */}
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-white/80 group-hover:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Issues (Bands)
            </span>
            <input
              type="checkbox"
              checked={showIssues}
              onChange={(e) => onToggleIssues(e.target.checked)}
              className="w-4 h-4 rounded bg-gray-800 border-white/20 accent-rose-500 cursor-pointer"
            />
          </label>

          {/* Traffic Layer Toggle */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex flex-col">
              <span className="text-white/80 group-hover:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Live Traffic
              </span>
              {!isTrafficKeySet && (
                <span className="text-[9px] text-amber-400/70 ml-4.5">
                  key not set
                </span>
              )}
            </div>
            <input
              type="checkbox"
              checked={showTraffic}
              onChange={(e) => onToggleTraffic(e.target.checked)}
              className="w-4 h-4 rounded bg-gray-800 border-white/20 accent-amber-500 cursor-pointer"
            />
          </label>
        </div>
      )}
    </div>
  );
}

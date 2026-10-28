import React from "react";
import { PlacementMode, RouteOption } from "./types";
import { pointToPolyDist } from "./utils";

export type VehicleMode = "motorcycle" | "car" | "pedestrian" | "wheelchair";

export interface RoutePanelProps {
  mode: PlacementMode;
  setMode: (mode: PlacementMode) => void;
  source: [number, number] | null;
  destination: [number, number] | null;
  loading: boolean;
  onOptimize: () => void;
  onClear: () => void;
  showReportButton?: boolean;
  allRoutes: RouteOption[];
  selectedRouteIndex: number;
  hazards: Array<{ id: string; latitude: number; longitude: number; title?: string; category: string }>;
  routeError: string | null;
  vehicle?: VehicleMode;
  setVehicle?: (v: VehicleMode) => void;
  beta?: number;
  setBeta?: (b: number) => void;
  explanation?: string | null;
  keyDisabled?: boolean;
}

export function RoutePanel({
  mode,
  setMode,
  source,
  destination,
  loading,
  onOptimize,
  onClear,
  showReportButton = false,
  allRoutes,
  selectedRouteIndex,
  hazards,
  routeError,
  vehicle = "motorcycle",
  setVehicle,
  beta = 0.15,
  setBeta,
  explanation,
  keyDisabled = false,
}: RoutePanelProps) {
  const currentRoute = allRoutes[selectedRouteIndex];

  return (
    <>
      {/* Top Action Bar */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-wrap items-center gap-2">
        {/* Source Button */}
        <div className="p-2 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button
            onClick={() => setMode("source")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === "source"
                ? "bg-emerald-500 border-emerald-400 text-black animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                : source
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                : "bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-emerald-500/50"
            }`}
          >
            {mode === "source"
              ? "⊕ Placing Source..."
              : source
              ? "✓ Source Set"
              : "⊕ Set Source"}
          </button>
        </div>

        {/* Destination Button */}
        <div className="p-2 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button
            onClick={() => setMode("destination")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === "destination"
                ? "bg-rose-500 border-rose-400 text-white animate-pulse shadow-[0_0_20px_rgba(255,46,99,0.4)]"
                : destination
                ? "bg-rose-500/20 border-rose-500/30 text-rose-400"
                : "bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-rose-500/50"
            }`}
          >
            {mode === "destination"
              ? "⊕ Placing Dest..."
              : destination
              ? "✓ Dest Set"
              : "⊕ Set Destination"}
          </button>
        </div>

        {/* Vehicle Selector */}
        {setVehicle && (
          <div className="p-1.5 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center gap-1">
            {(
              [
                ["motorcycle", "🏍️ Moto"],
                ["car", "🚗 Car"],
                ["pedestrian", "🚶 Walk"],
                ["wheelchair", "♿ Wheel"],
              ] as const
            ).map(([vKey, label]) => (
              <button
                key={vKey}
                onClick={() => setVehicle(vKey)}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                  vehicle === vKey
                    ? "bg-cyan-500/30 text-cyan-300 border border-cyan-400/50"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Safest vs Fastest Slider */}
        {setBeta && (
          <div className="px-3 py-1.5 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center gap-2 text-[10px] font-mono text-white/60">
            <span>⚡ Fast</span>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.05"
              value={beta}
              onChange={(e) => setBeta(parseFloat(e.target.value))}
              className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              title={`Safety Bias (β): ${beta}`}
            />
            <span>🛡️ Safe</span>
            <span className="text-cyan-400 font-bold ml-1">{beta.toFixed(2)}</span>
          </div>
        )}

        {/* Compute Safe Route Button */}
        {source && destination && (
          <div className="p-2 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button
              onClick={onOptimize}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-[10px] font-display font-black uppercase tracking-widest bg-cyan-400 text-black shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:bg-cyan-300 active:scale-95 disabled:opacity-50 transition-all"
            >
              {loading ? "⏳ Computing Path..." : "▶ Compute Safe Route"}
            </button>
          </div>
        )}

        {/* Report Button (if enabled) */}
        {showReportButton && (
          <div className="p-2 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button
              onClick={() => setMode("report")}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
                mode === "report"
                  ? "bg-amber-500 border-amber-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,184,0,0.4)]"
                  : "bg-black/60 backdrop-blur-md border-white/10 text-amber-400 hover:border-amber-500/50"
              }`}
            >
              {mode === "report" ? "📍 Pinning Issue..." : "📍 Report on Map"}
            </button>
          </div>
        )}

        {/* Reset / Clear Button */}
        {(source || destination || allRoutes.length > 0) && (
          <div className="p-2 bg-gray-950/90 backdrop-blur-md rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button
              onClick={onClear}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition"
            >
              ✕ Clear
            </button>
          </div>
        )}

        {/* Keys-Later Mode Notice */}
        {keyDisabled && (
          <div className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-mono">
            ⚠️ TomTom key not set (keys-later mode)
          </div>
        )}
      </div>

      {/* Safe Route Found Card */}
      {currentRoute && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] w-[440px] max-w-[92vw] rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden bg-emerald-950/90 border border-emerald-500/40">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-emerald-500/20 bg-emerald-900/20">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider">
                {currentRoute.isDetour ? "Safety Detour Route" : "Optimized Safe Route"}
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {hazards.length} Hazard{hazards.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Explanation Banner */}
          {explanation && (
            <div className="px-5 py-2 bg-emerald-900/30 border-b border-emerald-500/10 text-xs text-emerald-200 font-sans flex items-center gap-2">
              <span className="text-emerald-400 font-bold">🛡️ Choice:</span>
              <span>{explanation}</span>
            </div>
          )}

          <div className="px-5 py-3 flex items-center justify-between text-xs font-mono text-white/80">
            <div>
              <span className="text-white/40 block text-[10px]">DISTANCE</span>
              <strong className="text-base text-white">
                {(currentRoute.distance / 1000).toFixed(1)} km
              </strong>
            </div>
            <div>
              <span className="text-white/40 block text-[10px]">EST. TIME</span>
              <strong className="text-base text-white">
                {Math.ceil(currentRoute.duration / 60)} mins
              </strong>
            </div>
            <div>
              <span className="text-white/40 block text-[10px]">HAZARD SCORE</span>
              <span className="text-emerald-400 font-bold">
                {currentRoute.routeScore !== undefined
                  ? currentRoute.routeScore.toFixed(0)
                  : hazards.length === 0
                  ? "HAZARD-FREE"
                  : `${hazards.length} Hazards`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Route Error Notice */}
      {routeError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] w-[420px] max-w-[92vw] rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden bg-rose-950/90 border border-rose-500/40">
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-xs uppercase">
              <span>⚠ Route Advisory</span>
            </div>
            <p className="text-xs text-rose-200/80 leading-relaxed font-sans">{routeError}</p>
          </div>
        </div>
      )}

      {/* Hazard Warning Notice */}
      {allRoutes.length > 0 && hazards.length > 0 && (
        <div className="absolute top-44 left-1/2 -translate-x-1/2 z-[1000] w-[420px] max-w-[92vw] rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden bg-rose-950/95 border border-rose-500/50">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-rose-500/30 bg-rose-900/30">
            <div className="flex items-center gap-2 text-rose-300 font-mono font-bold text-xs">
              <span>⚠ {hazards.length} Hazard(s) on Route</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              UNSAFE
            </span>
          </div>

          <div className="px-5 py-3 max-h-40 overflow-y-auto space-y-2 text-xs font-mono">
            {hazards.map((h, i) => (
              <div
                key={h.id}
                className="p-2 rounded-lg bg-rose-900/20 border border-rose-500/20 flex items-center justify-between"
              >
                <div className="truncate">
                  <span className="text-white font-bold block truncate">
                    {i + 1}. {h.title || h.category}
                  </span>
                  <span className="text-[10px] text-white/50">{h.category}</span>
                </div>
                <span className="text-[10px] text-rose-300 font-bold shrink-0 ml-2">
                  {Math.round(
                    pointToPolyDist(
                      [h.latitude, h.longitude],
                      currentRoute?.coords ?? []
                    )
                  )}
                  m from path
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode Helper Badge at Bottom */}
      {mode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/10 text-sm font-bold text-white shadow-2xl">
          {mode === "source" && "Click on the map to place your 🟢 Source point"}
          {mode === "destination" && "Click on the map to place your 🔴 Destination point"}
          {mode === "report" && "Click on the map to place a 📍 new issue at that location"}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-[999] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
          <div className="px-8 py-4 rounded-2xl bg-slate-900 border border-cyan-500/20 text-sm font-bold text-cyan-400 shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            Computing safe route...
          </div>
        </div>
      )}
    </>
  );
}

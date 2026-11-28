import React, { useState } from "react";
import { PlacementMode, RouteOption } from "./types";
import { pointToPolyDist } from "./utils";
import { 
  Navigation, Check, CheckCircle2, AlertTriangle, 
  Car, Bike, Footprints, Shield, ArrowRight, RotateCcw
} from "lucide-react";

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
  allRoutes,
  selectedRouteIndex,
  hazards,
  routeError,
  vehicle = "car",
  setVehicle,
  explanation,
}: RoutePanelProps) {
  const [selectedRouteChoice, setSelectedRouteChoice] = useState<'A' | 'B'>('A');
  const [applied, setApplied] = useState(false);

  const currentRoute = allRoutes[selectedRouteIndex];

  return (
    <>
      {/* Top Left Waypoint Placement Bar */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-1.5 shadow-[0_4px_16px_rgba(41,55,50,0.08)] flex items-center gap-1.5">
          {/* Source Button */}
          <button
            type="button"
            onClick={() => setMode("source")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
              mode === "source"
                ? "bg-[#527B7A] text-white shadow-sm font-semibold"
                : source
                ? "bg-[#D4E3DF] text-[#355858] font-semibold"
                : "bg-[#E9ECE6] text-[#293732] hover:bg-[#DDDCD3]"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#537C60]" />
            {mode === "source" ? "Click map for Source" : source ? "Source Set" : "Set Source (S)"}
          </button>

          {/* Destination Button */}
          <button
            type="button"
            onClick={() => setMode("destination")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
              mode === "destination"
                ? "bg-[#B76F60] text-white shadow-sm font-semibold"
                : destination
                ? "bg-[#FCEBE6] text-[#B76F60] font-semibold"
                : "bg-[#E9ECE6] text-[#293732] hover:bg-[#DDDCD3]"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#B76F60]" />
            {mode === "destination" ? "Click map for Dest" : destination ? "Dest Set" : "Set Dest (D)"}
          </button>

          {(source || destination) && (
            <button
              type="button"
              onClick={onClear}
              className="p-1.5 rounded-lg text-[#65736B] hover:text-[#293732] hover:bg-[#E9ECE6] transition-colors"
              title="Clear Route Points"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Floating Route Details Panel (Exact match to Row 4, Col 2) */}
      <div className="absolute top-4 right-4 z-[1000] w-80 max-w-[calc(100vw-32px)] pointer-events-auto">
        <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-5 shadow-[0_8px_30px_rgba(41,55,50,0.12)] space-y-4">
          <div className="flex items-center justify-between border-b border-[#DDDCD3]/60 pb-3">
            <h3 className="font-display font-bold text-base text-[#293732]">
              Route Details
            </h3>
            <span className="text-[10px] font-mono text-[#527B7A] bg-[#D4E3DF] px-2 py-0.5 rounded-md font-semibold">
              OPTIMIZED
            </span>
          </div>

          {/* Origin selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#65736B] block">
              Origin
            </label>
            <div className="relative">
              <select className="w-full appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3 py-2 pr-8 text-xs font-medium text-[#293732] shadow-inner focus:outline-none focus:ring-1 focus:ring-[#527B7A]">
                <option value="depot">Municipal Depot (Ward 12)</option>
                <option value="hq">City Operations HQ</option>
                <option value="station">North Maintenance Station</option>
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
            </div>
          </div>

          {/* Vehicle selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#65736B] block">
              Vehicle
            </label>
            <div className="relative">
              <select 
                value={vehicle}
                onChange={(e) => setVehicle && setVehicle(e.target.value as VehicleMode)}
                className="w-full appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3 py-2 pr-8 text-xs font-medium text-[#293732] shadow-inner focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
              >
                <option value="car">Light Vehicle</option>
                <option value="motorcycle">Two-Wheeler Inspection</option>
                <option value="truck">Heavy Maintenance Truck</option>
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
            </div>
          </div>

          {/* Route Options (Route A vs Route B) */}
          <div className="space-y-2 pt-1">
            {/* Route A Card */}
            <div 
              onClick={() => setSelectedRouteChoice('A')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                selectedRouteChoice === 'A'
                  ? 'bg-[#EBF2F0] border-[#527B7A] shadow-sm'
                  : 'bg-[#F7F8F5] border-[#DDDCD3] hover:border-[#527B7A]/50'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#293732]">Route A</span>
                  <span className="text-[10px] font-semibold text-[#537C60] bg-[#E2EBE5] px-1.5 py-0.2 rounded">
                    Recommended
                  </span>
                </div>
                <div className="text-xs font-mono text-[#65736B] mt-0.5">
                  12.8 km • 28 min
                </div>
              </div>
              {selectedRouteChoice === 'A' && (
                <div className="w-5 h-5 rounded-full bg-[#527B7A] text-white flex items-center justify-center">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </div>

            {/* Route B Card */}
            <div 
              onClick={() => setSelectedRouteChoice('B')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                selectedRouteChoice === 'B'
                  ? 'bg-[#EBF2F0] border-[#527B7A] shadow-sm'
                  : 'bg-[#F7F8F5] border-[#DDDCD3] hover:border-[#527B7A]/50'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#293732]">Route B</span>
                </div>
                <div className="text-xs font-mono text-[#65736B] mt-0.5">
                  15.4 km • 35 min
                </div>
              </div>
              {selectedRouteChoice === 'B' && (
                <div className="w-5 h-5 rounded-full bg-[#527B7A] text-white flex items-center justify-center">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </div>
          </div>

          {/* Apply Route Button (Row 4, Col 2) */}
          <button
            type="button"
            onClick={() => {
              setApplied(true);
              if (onOptimize) onOptimize();
              setTimeout(() => setApplied(false), 2500);
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(53,88,88,0.3)] active:translate-y-[1px] transition-all flex items-center justify-center gap-2"
          >
            {applied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                Route Applied to Field Team
              </>
            ) : (
              'Apply Route'
            )}
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-[999] bg-white/40 backdrop-blur-[2px] flex items-center justify-center">
          <div className="px-6 py-3 rounded-2xl bg-[#FFFFFF] border border-[#DDDCD3] shadow-xl text-xs font-semibold text-[#293732] flex items-center gap-2.5">
            <div className="w-4 h-4 border-2 border-[#527B7A] border-t-transparent rounded-full animate-spin" />
            Calculating cartographic routing...
          </div>
        </div>
      )}
    </>
  );
}

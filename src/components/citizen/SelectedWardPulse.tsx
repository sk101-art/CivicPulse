'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight, Loader2, Compass, Map as MapIcon } from 'lucide-react';
import { useGeoContext } from '@/context/GeoContext';

export function SelectedWardPulse() {
  const { currentWard, wardData } = useGeoContext();

  const total = wardData.stats?.totalReported;
  const resolved = wardData.stats?.resolvedCount;
  const activeUnresolved = Math.max(0, (total ?? 0) - (resolved ?? 0));

  return (
    <div
      data-testid="selected-ward-pulse"
      className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-[#527B7A] shrink-0" />
          <h3 className="font-display font-semibold text-base text-[#293732] tracking-tight truncate">
            {currentWard?.fullName || 'Selected Ward Pulse'}
          </h3>
        </div>
        <span className="text-[11px] font-mono font-bold text-[#355858] bg-[#E5E9E3] px-2.5 py-0.5 rounded-full border border-[#C2D7D1] shrink-0">
          {currentWard?.wardLabel || 'Ward'}
        </span>
      </div>

      {/* 3 Compact Ward Metrics */}
      {wardData.error ? (
        <div className="p-3 rounded-xl bg-[#FBF1EF] border border-[#EAC8C1] text-xs text-[#B76F60]">
          Unable to load telemetry for the selected ward.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3]">
            <div className="font-mono font-bold text-lg text-[#293732]">
              {wardData.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#527B7A]" />
              ) : (
                total ?? '—'
              )}
            </div>
            <div className="text-[10px] text-[#65736B] font-medium uppercase tracking-wider leading-tight">
              Total Issues
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB]">
            <div className="font-mono font-bold text-lg text-[#B68B63]">
              {wardData.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#B68B63]" />
              ) : (
                total === undefined || resolved === undefined ? '—' : activeUnresolved
              )}
            </div>
            <div className="text-[10px] text-[#B68B63] font-medium uppercase tracking-wider leading-tight">
              Active / Unresolved
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4]">
            <div className="font-mono font-bold text-lg text-[#537C60]">
              {wardData.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#537C60]" />
              ) : (
                resolved ?? '—'
              )}
            </div>
            <div className="text-[10px] text-[#537C60] font-medium uppercase tracking-wider leading-tight">
              Verified Fixed
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Page Shortcuts */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Link
          href="/citizen/intelligence"
          className="py-2 px-3 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5 truncate">
            <Compass className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />
            <span className="truncate">Ward Intelligence</span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />
        </Link>

        <Link
          href="/citizen/map"
          className="py-2 px-3 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5 truncate">
            <MapIcon className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />
            <span className="truncate">Map View</span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />
        </Link>
      </div>
    </div>
  );
}

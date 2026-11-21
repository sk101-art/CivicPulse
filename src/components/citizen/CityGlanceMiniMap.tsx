'use client';

import React from 'react';
import { useGeoContext } from '@/context/GeoContext';
import { MapPin, CheckCircle2, Clock, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

export function CityGlanceMiniMap() {
  const { currentWard, wardData, setSelectedCategory } = useGeoContext();

  const total = wardData.stats?.totalReported ?? 0;
  const inProgress = wardData.stats?.inProgressCount ?? 0;
  const resolved = wardData.stats?.resolvedCount ?? 0;
  const critical = wardData.stats?.criticalCount ?? 0;

  const categories = wardData.categoryBreakdown || {};

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#527B7A]" />
          <h3 className="font-display font-semibold text-base text-[#293732] tracking-tight">
            {currentWard?.fullName || 'Ward Telemetry'}
          </h3>
        </div>
        <span className="text-[11px] font-mono font-bold text-[#355858] bg-[#E5E9E3] px-2.5 py-0.5 rounded-full border border-[#C2D7D1]">
          {currentWard?.wardLabel || 'Ward Overview'}
        </span>
      </div>

      {/* Ward Metric Badges */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3]">
          <div className="font-mono font-bold text-lg text-[#293732]">
            {wardData.isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#527B7A]" /> : total}
          </div>
          <div className="text-[10px] text-[#65736B] font-medium uppercase tracking-wider">
            Total Issues
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB]">
          <div className="font-mono font-bold text-lg text-[#B68B63]">
            {wardData.isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#B68B63]" /> : inProgress}
          </div>
          <div className="text-[10px] text-[#B68B63] font-medium uppercase tracking-wider">
            Active Repairs
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4]">
          <div className="font-mono font-bold text-lg text-[#537C60]">
            {wardData.isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#537C60]" /> : resolved}
          </div>
          <div className="text-[10px] text-[#537C60] font-medium uppercase tracking-wider">
            Fixed
          </div>
        </div>
      </div>

      {/* Ward-Wise Category Breakdown Table */}
      <div className="space-y-2 pt-1 border-t border-[#DDDCD3]/60">
        <div className="flex items-center justify-between text-xs font-semibold text-[#293732]">
          <span>Ward Category Breakdown</span>
          <span className="text-[11px] font-mono text-[#65736B]">Live DB Counts</span>
        </div>

        <div className="divide-y divide-[#DDDCD3]/40 max-h-40 overflow-y-auto">
          {[
            { label: 'Potholes', key: 'POTHOLES', color: '#527B7A' },
            { label: 'Drainage', key: 'DRAINAGE', color: '#718F9E' },
            { label: 'Waterlogging', key: 'WATERLOGGING', color: '#4A7C92' },
            { label: 'Streetlights', key: 'STREETLIGHTS', color: '#B68B63' },
            { label: 'Garbage & Waste', key: 'TRASH', color: '#537C60' },
            { label: 'Sidewalks', key: 'SIDEWALKS', color: '#87917B' },
            { label: 'Footpaths', key: 'FOOTPATH', color: '#9AA88E' },
            { label: 'Traffic Signs', key: 'TRAFFIC_SIGNS', color: '#B76F60' },
            { label: 'Road Cuts', key: 'ROAD_CUT', color: '#7A6B88' },
            { label: 'Tree Fall', key: 'TREE_FALL', color: '#5F8265' },
            { label: 'Graffiti', key: 'GRAFFITI', color: '#886B85' },
            { label: 'Other Infrastructure', key: 'OTHER', color: '#66766D' },
          ].map((cat) => {
            const count = categories[cat.key] || 0;
            return (
              <Link
                key={cat.key}
                href={`/citizen/map?category=${cat.key}`}
                onClick={() => setSelectedCategory(cat.key)}
                className="flex items-center justify-between py-1.5 px-1 hover:bg-[#FAF9F5] rounded-lg transition-colors group cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-[#293732] group-hover:text-[#355858] font-medium">{cat.label}</span>
                </div>
                <span className="font-mono font-bold text-[#65736B] group-hover:text-[#293732] bg-[#F3F2EB] px-2 py-0.5 rounded-md text-[11px]">
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Direct Ward Map CTA */}
      <Link
        href="/citizen/map"
        className="w-full py-2 px-3 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
      >
        <span>Explore {currentWard?.wardLabel || 'Ward'} on Interactive Map</span>
        <ArrowRight className="w-3.5 h-3.5 text-[#527B7A]" />
      </Link>
    </div>
  );
}

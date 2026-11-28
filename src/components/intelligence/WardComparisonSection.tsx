'use client';

import React from 'react';
import { Compass, ArrowRight } from 'lucide-react';
import type { WardComparisonItem } from '@/lib/intelligence/wardAnalytics';

interface Props {
  comparison: WardComparisonItem[];
  onSelectWard: (wardCode: string) => void;
}

export function WardComparisonSection({ comparison, onSelectWard }: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#527B7A]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              Cross-Ward Infrastructure Benchmarking
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Comparative analysis of infrastructure defect volume, backlog pressure, and verified repair rates.
          </p>
        </div>

        <span className="px-3 py-1 rounded-full bg-[#E5E9E3] text-[#355858] text-xs font-mono font-bold self-start sm:self-auto border border-[#C2D7D1]">
          Raw Counts & Rates (Zero Fabricated Denominators)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#DDDCD3] text-[#65736B] font-mono uppercase text-[10px] tracking-wider bg-[#FAF9F5]">
              <th className="py-2.5 px-3 rounded-l-lg">Ward Context</th>
              <th className="py-2.5 px-3">Total Defect Load</th>
              <th className="py-2.5 px-3">Active Backlog</th>
              <th className="py-2.5 px-3">Resolution Rate</th>
              <th className="py-2.5 px-3">SLA Breach Rate</th>
              <th className="py-2.5 px-3">Critical Hazards</th>
              <th className="py-2.5 px-3 rounded-r-lg">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDDCD3]/60">
            {comparison.map((w) => (
              <tr
                key={w.wardId}
                className={`transition-colors ${
                  w.isCurrentWard ? 'bg-[#F2F6F5] font-semibold' : 'hover:bg-[#FAF9F5]'
                }`}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#293732]">{w.wardCode} • {w.wardName}</span>
                    {w.isCurrentWard && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#355858] text-white">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#65736B]">Primary: {w.topCategory}</div>
                </td>
                <td className="py-3 px-3 font-mono text-[#293732] font-semibold">
                  {w.totalIssues}
                </td>
                <td className="py-3 px-3">
                  <span className="font-mono text-[#B68B63] font-semibold">
                    {w.activeIssues}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-14 h-1.5 rounded-full bg-[#EAECE6] overflow-hidden">
                      <div
                        style={{ width: `${w.resolutionRate}%` }}
                        className="h-full bg-[#537C60] rounded-full"
                      />
                    </div>
                    <span className="font-mono font-bold text-[#537C60]">
                      {w.resolutionRate}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span className={`font-mono font-semibold ${w.slaBreachRate > 0 ? 'text-[#B76F60]' : 'text-[#65736B]'}`}>
                    {w.slaBreachRate}%
                  </span>
                </td>
                <td className="py-3 px-3">
                  {w.criticalCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-[#FAF0EE] text-[#B76F60] font-mono font-bold border border-[#F3D2CC]">
                      {w.criticalCount}
                    </span>
                  ) : (
                    <span className="text-[#929B92] font-mono">0</span>
                  )}
                </td>
                <td className="py-3 px-3">
                  {!w.isCurrentWard ? (
                    <button
                      type="button"
                      onClick={() => onSelectWard(w.wardCode)}
                      className="text-xs text-[#527B7A] hover:text-[#355858] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Switch</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-xs text-[#929B92]">Selected</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

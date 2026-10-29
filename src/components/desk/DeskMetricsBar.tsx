'use client';

import React from 'react';
import { ShieldAlert, Clock, Building2, Wrench } from 'lucide-react';

interface DeskMetricsBarProps {
  reopenedCount: number;
  overallLifespanDays: number | null;
  wardLifespans: Array<{ name: string; medianDays: number }>;
  contractorLifespans: Array<{ name: string; medianDays: number }>;
}

export function DeskMetricsBar({
  reopenedCount,
  overallLifespanDays,
  wardLifespans,
  contractorLifespans,
}: DeskMetricsBarProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Reopened in Warranty Card */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase text-white/50 tracking-wider">
            Reopened In Warranty
          </span>
          <ShieldAlert className="w-4 h-4 text-rose-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-rose-400">
            {reopenedCount}
          </span>
          <span className="text-xs font-mono text-white/40">defects failed</span>
        </div>
        <div className="text-[11px] font-mono text-white/40">
          Invoking the defect liability clause of the contract
        </div>
      </div>

      {/* Repair Lifespan Overall */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase text-white/50 tracking-wider">
            Median Repair Lifespan
          </span>
          <Clock className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-emerald-400">
            {overallLifespanDays !== null ? `${overallLifespanDays}d` : 'N/A'}
          </span>
          <span className="text-xs font-mono text-white/40">city-wide median</span>
        </div>
        <div className="text-[11px] font-mono text-white/40">
          Measured from claim to failure
        </div>
      </div>

      {/* Lifespan by Ward */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase text-white/50 tracking-wider">
            Lifespan by Ward
          </span>
          <Building2 className="w-4 h-4 text-cyan-400" />
        </div>
        {wardLifespans.length === 0 ? (
          <div className="text-xs font-mono text-white/40 pt-1">No ward samples</div>
        ) : (
          <div className="space-y-1 pt-1 max-h-20 overflow-y-auto">
            {wardLifespans.slice(0, 3).map((w) => (
              <div key={w.name} className="flex justify-between items-center text-xs font-mono">
                <div className="flex items-center gap-1 truncate max-w-[150px]">
                  <span className="text-white/70 truncate">{w.name}</span>
                  {(w.name.toLowerCase().includes('demo') || w.name.includes('Pilot Area')) && (
                    <span className="px-1 py-0.5 rounded text-[8px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
                      demo
                    </span>
                  )}
                </div>
                <span className="font-bold text-cyan-300">{w.medianDays}d</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lifespan by Contractor */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase text-white/50 tracking-wider">
            Contractor Lifespan
          </span>
          <Wrench className="w-4 h-4 text-amber-400" />
        </div>
        {contractorLifespans.length === 0 ? (
          <div className="text-xs font-mono text-white/40 pt-1">No contractor data</div>
        ) : (
          <div className="space-y-1 pt-1 max-h-20 overflow-y-auto">
            {contractorLifespans.slice(0, 3).map((c) => (
              <div key={c.name} className="flex justify-between items-center text-xs font-mono">
                <div className="flex items-center gap-1 truncate max-w-[150px]">
                  <span className="text-white/70 truncate">{c.name}</span>
                  {(c.name.toLowerCase().includes('demo') || c.name.includes('Cauvery')) && (
                    <span className="px-1 py-0.5 rounded text-[8px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
                      demo
                    </span>
                  )}
                </div>
                <span className="font-bold text-amber-300">{c.medianDays}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

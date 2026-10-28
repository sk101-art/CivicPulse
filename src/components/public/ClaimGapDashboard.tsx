'use client';

import React, { useState, useTransition } from 'react';
import { 
  Building2, Users, CheckCircle2, 
  XCircle, Clock, BarChart3, RefreshCw
} from 'lucide-react';
import type { ClaimGapGroupStats } from '@/lib/issues/claimGap';

interface ClaimGapDashboardProps {
  initialByWard: ClaimGapGroupStats[];
  initialByDesk: ClaimGapGroupStats[];
  initialPeriod: number;
}

export function ClaimGapDashboard({
  initialByWard,
  initialByDesk,
  initialPeriod,
}: ClaimGapDashboardProps) {
  const [period, setPeriod] = useState<number>(initialPeriod);
  const [view, setView] = useState<'ward' | 'desk'>('ward');
  const [byWard, setByWard] = useState<ClaimGapGroupStats[]>(initialByWard);
  const [byDesk, setByDesk] = useState<ClaimGapGroupStats[]>(initialByDesk);
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (newPeriod: number) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/claim-gap?days=${newPeriod}`);
        if (res.ok) {
          const data = await res.json();
          setByWard(data.byWard);
          setByDesk(data.byDesk);
        }
      } catch (err) {
        console.error('Failed to fetch claim gap', err);
      }
    });
  };

  const getGapBadge = (item: ClaimGapGroupStats) => {
    if (item.insufficientData) {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 border border-white/10 text-white/40">
          Insufficient data (&lt; 5 claims)
        </span>
      );
    }

    if (item.disputedPercentage <= 15) {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          {item.disputedPercentage.toFixed(1)}% (Low Gap)
        </span>
      );
    }

    if (item.disputedPercentage <= 30) {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {item.disputedPercentage.toFixed(1)}% (Moderate Gap)
        </span>
      );
    }

    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
        {item.disputedPercentage.toFixed(1)}% (High Gap)
      </span>
    );
  };

  const activeList = view === 'ward' ? byWard : byDesk;

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
        {/* View switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('ward')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              view === 'ward'
                ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Ward Scorecard
          </button>

          <button
            onClick={() => setView('desk')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              view === 'desk'
                ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Desk Scorecard (Desk A / B)
          </button>
        </div>

        {/* Period toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase text-white/50">Period:</span>
          <button
            onClick={() => handlePeriodChange(30)}
            disabled={isPending}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              period === 30
                ? 'bg-white/20 text-white border border-white/30'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => handlePeriodChange(90)}
            disabled={isPending}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              period === 90
                ? 'bg-white/20 text-white border border-white/30'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Last 90 Days
          </button>
          {isPending && <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin ml-2" />}
        </div>
      </div>

      {/* Choropleth & Visual Distribution Cards (for Ward view) */}
      {view === 'ward' && (
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Ward Choropleth & Claim Gap Severity
            </h3>
            <span className="text-[10px] font-mono text-white/40">
              Disputed Claims ÷ Total Claims
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {byWard.map((ward) => {
              const border = ward.insufficientData
                ? 'border-white/10 bg-white/[0.02]'
                : ward.disputedPercentage <= 15
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : ward.disputedPercentage <= 30
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-rose-500/30 bg-rose-500/5';

              return (
                <div
                  key={ward.id}
                  className={`p-4 rounded-xl border ${border} space-y-2`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-white">{ward.name}</span>
                    <span className="text-white/40">{ward.code}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] font-mono text-white/60">
                      {ward.claimed} claimed fixes
                    </div>
                    <div>{getGapBadge(ward)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scorecard Table */}
      <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
            {view === 'ward' ? 'Ward Integrity Scorecard' : 'Desk Officer Accountability Scorecard'}
          </h3>
          <span className="text-xs font-mono text-white/40">
            {activeList.length} entity / entities monitored
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-white/5 text-white/50 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="p-4">{view === 'ward' ? 'Ward Name & Code' : 'Desk Officer'}</th>
                <th className="p-4 text-center">Claimed Fixes</th>
                <th className="p-4 text-center">Verified Fixes</th>
                <th className="p-4 text-center">Disputed Fixes</th>
                <th className="p-4 text-center">Pending Check</th>
                <th className="p-4 text-center">Claim Gap (% Disputed)</th>
                <th className="p-4 text-right">Median Verification Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {activeList.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="p-4 font-bold text-white">
                    <div className="flex items-center gap-2">
                      {view === 'ward' ? (
                        <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      ) : (
                        <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                      )}
                      <div>
                        <div>{item.name}</div>
                        {item.code && (
                          <div className="text-[10px] text-white/40 font-normal">{item.code}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="p-4 text-center font-bold text-white">{item.claimed}</td>

                  <td className="p-4 text-center text-emerald-400 font-bold">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {item.verified}
                    </span>
                  </td>

                  <td className="p-4 text-center text-rose-400 font-bold">
                    <span className="inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      {item.disputed}
                    </span>
                  </td>

                  <td className="p-4 text-center text-white/50">{item.pending}</td>

                  <td className="p-4 text-center">{getGapBadge(item)}</td>

                  <td className="p-4 text-right text-white/80">
                    {item.medianHoursToVerify !== null ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        {item.medianHoursToVerify}h
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

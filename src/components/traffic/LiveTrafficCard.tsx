'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

interface LiveTrafficData {
  live: {
    currentSpeed: number;
    freeFlowSpeed: number;
    congestionPct: number;
    slowerPct: number;
    roadClass: string;
    confidence: number;
    summary: string;
    updatedAt: string;
  };
  profile24h: Array<{
    hour: number;
    delayRatio: number;
    congestionPct: number;
    isCurrentHour: boolean;
    source?: string;
    isEstimated?: boolean;
  }>;
  currentHour: number;
  dayType: 'WEEKDAY' | 'WEEKEND';
  source: 'TOMTOM_HISTORIC' | 'LIVE_SAMPLE' | 'ESTIMATED';
  fromCache?: boolean;
}

interface LiveTrafficCardProps {
  issueId: string;
  variant?: 'card' | 'drawer' | 'page';
  dayType?: 'WEEKDAY' | 'WEEKEND';
}

export function LiveTrafficCard({ issueId, variant = 'card', dayType: targetDayType }: LiveTrafficCardProps) {
  const [data, setData] = useState<LiveTrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchTraffic() {
      try {
        setLoading(true);
        const url = targetDayType
          ? `/api/issues/${issueId}/traffic-live?dayType=${targetDayType}`
          : `/api/issues/${issueId}/traffic-live`;
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 401) {
            setError('Sign in to view live traffic intelligence');
            return;
          }
          throw new Error(`Traffic API error (${res.status})`);
        }
        const json = await res.json();
        if (mounted) {
          setData(json);
          setError(null);
        }
      } catch {
        if (mounted) {
          setError('Traffic flow unavailable');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTraffic();
    return () => {
      mounted = false;
    };
  }, [issueId, targetDayType]);

  if (loading) {
    return (
      <div className={`p-3.5 rounded-xl bg-white/5 border border-white/10 animate-pulse text-xs text-white/40 flex items-center gap-2 ${variant === 'drawer' ? 'text-[11px]' : ''}`}>
        <Activity className="w-4 h-4 animate-spin text-cyan-400" />
        Loading real-time traffic flow...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/40 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-white/30" />
        <span>{error || 'No traffic profile available'}</span>
      </div>
    );
  }

  const { live, profile24h, currentHour, dayType, source } = data;

  // Congestion status colors
  const congestionColor =
    live.slowerPct > 50
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      : live.slowerPct > 20
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  const sourceLabel =
    source === 'TOMTOM_HISTORIC'
      ? 'TomTom Historic Profile'
      : source === 'LIVE_SAMPLE'
        ? 'Live Traffic Samples'
        : 'Estimated Urban Baseline';

  return (
    <div
      data-testid="live-traffic-card"
      className="p-4 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 space-y-3.5 shadow-sm"
    >
      {/* Header with live summary */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400">
              Live Traffic Intelligence
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/60">
              {dayType}
            </span>
          </div>
          <p className="text-sm font-medium text-white/90">
            {live.summary}
          </p>
        </div>

        <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${congestionColor}`}>
          {live.slowerPct}% slower
        </div>
      </div>

      {/* Speed & Road Metrics */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5 text-xs font-mono">
        <div className="p-2 rounded-lg bg-black/20">
          <span className="text-white/40 block text-[10px]">CURRENT</span>
          <span className="text-white font-bold">{live.currentSpeed} km/h</span>
        </div>
        <div className="p-2 rounded-lg bg-black/20">
          <span className="text-white/40 block text-[10px]">FREE FLOW</span>
          <span className="text-white/80 font-bold">{live.freeFlowSpeed} km/h</span>
        </div>
        <div className="p-2 rounded-lg bg-black/20">
          <span className="text-white/40 block text-[10px]">ROAD CLASS</span>
          <span className="text-cyan-300 font-bold">{live.roadClass}</span>
        </div>
      </div>

      {/* 24-hour Profile Sparkline */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-white/50">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-white/40" />
            24h Congestion Profile
          </span>
          <span className="text-white/40 text-[10px]">
            NOW: {String(currentHour).padStart(2, '0')}:00 ({live.slowerPct}%)
          </span>
        </div>

        {/* Bar sparkline */}
        <div className="h-14 flex items-end gap-[3px] bg-black/30 p-2 rounded-lg border border-white/5">
          {profile24h.map((p) => {
            // Scale bar height: min 10%, max 100%
            const heightPct = Math.max(10, Math.min(100, Math.round(p.delayRatio * 85 + 10)));
            const isNow = p.isCurrentHour;
            const isEstimated = p.isEstimated ?? (p.source === 'ESTIMATED');
            const barColor = isNow
              ? 'bg-cyan-400 ring-2 ring-cyan-400/50'
              : isEstimated
                ? 'bg-white/20 border border-dashed border-white/40 hover:bg-white/30'
                : p.congestionPct > 50
                  ? 'bg-rose-500/70 hover:bg-rose-400'
                  : p.congestionPct > 25
                    ? 'bg-amber-500/70 hover:bg-amber-400'
                    : 'bg-emerald-500/50 hover:bg-emerald-400';

            return (
              <div
                key={p.hour}
                title={`${String(p.hour).padStart(2, '0')}:00 — ${p.congestionPct}% delay ratio${isEstimated ? ' (estimated)' : ''}`}
                className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
              >
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t-sm transition-all ${barColor}`}
                />
              </div>
            );
          })}
        </div>

        {/* Timeline hours labels */}
        <div className="flex justify-between text-[9px] font-mono text-white/30 px-1">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* Footer data basis label */}
      <div className="flex items-center justify-between text-[10px] font-mono text-white/40 pt-1 border-t border-white/5">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-cyan-400" />
          {sourceLabel}
        </span>
        <span>Confidence: {Math.round(live.confidence * 100)}%</span>
      </div>
    </div>
  );
}

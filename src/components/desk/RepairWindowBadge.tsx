'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock, Sparkles } from 'lucide-react';
import type { RepairWindowResult } from '@/lib/traffic/repairWindow';

interface RepairWindowBadgeProps {
  issueId: string;
  initialResult?: RepairWindowResult | null;
  variant?: 'card' | 'drawer' | 'page';
  className?: string;
}

export function RepairWindowBadge({
  issueId,
  initialResult,
  variant = 'card',
  className = '',
}: RepairWindowBadgeProps) {
  const [data, setData] = useState<RepairWindowResult | null>(initialResult || null);
  const [loading, setLoading] = useState<boolean>(!initialResult);

  useEffect(() => {
    if (initialResult) {
      return;
    }

    let isMounted = true;
    const fetchWindow = async () => {
      try {
        const res = await fetch(`/api/issues/${issueId}/repair-window`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setData(json);
        }
      } catch {
        // Fallback gracefully on fetch error
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchWindow();
    return () => {
      isMounted = false;
    };
  }, [issueId, initialResult]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs font-mono text-white/40 ${className}`}>
        <CalendarClock className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
        <span>Calculating repair window...</span>
      </div>
    );
  }

  if (!data || !data.bestWindow) {
    return null;
  }

  const { bestWindow, basis, sampleCount, windows } = data;
  const isLive = basis === 'live';

  if (variant === 'card') {
    return (
      <div
        data-testid="repair-window-card"
        className={`flex items-center gap-2 text-[11px] font-mono text-cyan-300/90 bg-cyan-950/30 border border-cyan-800/40 px-2.5 py-1 rounded-lg ${className}`}
      >
        <CalendarClock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="truncate">
          Best repair window: <strong className="text-white font-semibold">{bestWindow.display}</strong> ({bestWindow.condition}) · based on {sampleCount} samples
        </span>
        <span
          data-testid="repair-window-basis-chip"
          className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold shrink-0 border ${
            isLive
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
          }`}
        >
          {basis}
        </span>
      </div>
    );
  }

  // Detailed view for Desk Issue Page or Issue Drawer
  return (
    <div
      data-testid="repair-window-detailed"
      className={`rounded-xl p-4 bg-white/5 border border-white/10 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            Recommended Repair Windows
          </h4>
        </div>
        <span
          data-testid="repair-window-basis-chip"
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
            isLive
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
          }`}
        >
          {isLive ? `Live Traffic (${sampleCount} samples)` : 'Estimated Road Profile'}
        </span>
      </div>

      {/* Primary recommendation */}
      <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/40 space-y-1">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-white font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Best: {bestWindow.display}
          </span>
          <span className="text-cyan-300/80">
            Avg congestion: {(bestWindow.expectedCongestion * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-[11px] font-mono text-white/60">
          Condition: <span className="text-cyan-300">{bestWindow.condition}</span> · based on {sampleCount} samples · {basis}
        </p>
      </div>

      {/* Alternative windows (up to 2 more) */}
      {windows.length > 1 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">
            Alternative 2-Hour Windows (Next 7 Days)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            {windows.slice(1).map((win, idx) => (
              <div
                key={idx}
                className="p-2 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-between"
              >
                <span className="text-white/80">{win.display}</span>
                <span className="text-white/40">{(win.expectedCongestion * 100).toFixed(0)}% cong</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

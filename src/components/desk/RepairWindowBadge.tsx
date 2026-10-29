'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock, Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { RepairWindowResult, CandidateSlot } from '@/lib/traffic/repairWindow';

interface RepairWindowBadgeProps {
  issueId: string;
  initialResult?: RepairWindowResult | null;
  variant?: 'card' | 'drawer' | 'page';
  className?: string;
  onSlotSelect?: (slot: CandidateSlot) => void;
}

export function RepairWindowBadge({
  issueId,
  initialResult,
  variant = 'card',
  className = '',
  onSlotSelect,
}: RepairWindowBadgeProps) {
  const [data, setData] = useState<RepairWindowResult | null>(initialResult || null);
  const [loading, setLoading] = useState<boolean>(!initialResult);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<CandidateSlot | null>(null);

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

  const { bestWindow, basis, sampleCount, windows, allSlots = [] } = data;
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

  // Detailed view for Desk Issue Drawer or Public Issue Page
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

      {/* Primary recommendation & Human Explanation */}
      <div className="p-3.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-white font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Best: {bestWindow.display}
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
            Score: {bestWindow.score > 100 ? bestWindow.score : `${bestWindow.score ?? 90}/100`}
          </span>
        </div>

        {/* Human Explanation from multi-factor analysis */}
        <p className="text-xs font-mono text-cyan-200/90 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-cyan-900/40">
          {bestWindow.explanation || `Condition: ${bestWindow.condition} · based on ${sampleCount} samples · ${basis}`}
        </p>

        {bestWindow.laneClosure && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-white/70 pt-0.5">
            <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold">
              {bestWindow.laneClosure.remainingLanes} of {bestWindow.laneClosure.totalLanes} lanes open
            </span>
            <span className="text-white/40">·</span>
            <span>Queue delay: {bestWindow.laneClosure.estimatedQueueDelayMin}</span>
            <span className="text-white/40">·</span>
            <span>Closure: {bestWindow.laneClosure.blockedLane}</span>
          </div>
        )}
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
                className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white/90 font-bold">{win.display}</span>
                  <span className="text-[10px] font-bold text-cyan-400">{win.score > 100 ? `Score: ${win.score}` : `${win.score ?? 75}/100`}</span>
                </div>
                <div className="text-[10px] text-white/50 truncate">
                  {win.condition}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable 7-Day 84-Slot Calendar Heatmap */}
      {allSlots.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-2">
          <button
            type="button"
            data-testid="toggle-calendar-btn"
            onClick={() => setShowCalendar(!showCalendar)}
            className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-cyan-300 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <CalendarClock className="w-3.5 h-3.5" />
              {showCalendar ? 'Hide 7-Day Calendar Heatmap' : 'Open 7-Day Calendar (84 Windows)'}
            </span>
            {showCalendar ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showCalendar && (
            <div data-testid="repair-calendar-heatmap" className="space-y-2 p-3 rounded-xl bg-black/40 border border-white/10">
              <div className="flex items-center justify-between text-[10px] font-mono text-white/50 pb-1">
                <span>Next 7 Days (84 × 2h Slots)</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> ≥80</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> 50-79</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span> &lt;50</span>
                </div>
              </div>

              {/* 84-slot micro grid */}
              <div className="grid grid-cols-12 gap-1 max-h-48 overflow-y-auto p-1">
                {allSlots.map((slot, idx) => {
                  const s = slot.score ?? 50;
                  const color =
                    s >= 80
                      ? 'bg-emerald-500/80 hover:bg-emerald-400 text-black'
                      : s >= 50
                      ? 'bg-amber-500/70 hover:bg-amber-400 text-black'
                      : 'bg-rose-500/60 hover:bg-rose-400 text-white';

                  return (
                    <button
                      key={idx}
                      type="button"
                      title={`${slot.display} (Score: ${s > 100 ? s : `${s}/100`})`}
                      onClick={() => {
                        setSelectedSlot(slot);
                        if (onSlotSelect) onSlotSelect(slot);
                      }}
                      className={`h-6 rounded text-[9px] font-mono font-bold flex items-center justify-center transition-all ${color}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* Selected Slot Information */}
              {selectedSlot && (
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-white font-bold">
                    <span>{selectedSlot.display}</span>
                    <span className="text-cyan-400">{selectedSlot.score > 100 ? `Score: ${selectedSlot.score}` : `Score: ${selectedSlot.score}/100`}</span>
                  </div>
                  <p className="text-[11px] text-white/70 leading-relaxed">
                    {selectedSlot.explanation}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

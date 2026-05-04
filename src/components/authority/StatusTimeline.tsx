'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Clock, MapPin, CheckCircle2, Circle, Settings2, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { staggerContainer, fadeUp } from '@/lib/framer';

interface ReportData {
  id: string;
  title: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  rejectedAt: string | null;
  address: string;
  priorityScore: number;
}

interface Counts {
  total: number;
  open: number;
  confirmed: number;
  assigned: number;
  inProgress: number;
  resolved: number;
}

interface StatusTimelineProps {
  reports: ReportData[];
  currentFilter: string;
  counts: Counts;
}

const STAGES = [
  { key: 'OPEN', short: 'O', label: 'Open', color: 'var(--accent-amber)' },
  { key: 'CONFIRMED', short: 'C', label: 'Confirmed', color: 'var(--accent-cyan)' },
  { key: 'ASSIGNED', short: 'A', label: 'Assigned', color: 'var(--accent-electric-blue)' },
  { key: 'IN_PROGRESS', short: 'P', label: 'Progress', color: 'var(--accent-lime)' },
  { key: 'RESOLVED', short: 'R', label: 'Resolved', color: 'var(--accent-lime)' },
];

const FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Resolved', value: 'RESOLVED' },
];

function getStageIndex(status: string) {
  const idx = STAGES.findIndex(s => s.key === status);
  return idx === -1 ? 0 : idx;
}

function getElapsedTime(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = e - s;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remMins}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function getTotalTime(report: ReportData): string {
  const start = new Date(report.createdAt).getTime();
  const endDate = report.resolvedAt || report.rejectedAt;
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  return getElapsedTime(report.createdAt, endDate);
}

export function StatusTimeline({ reports, currentFilter, counts }: StatusTimelineProps) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState<string | null>(null);

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams();
    if (filter !== 'ALL') params.set('filter', filter);
    router.push(`/authority/status${params.toString() ? '?' + params.toString() : ''}`);
  };

  const handleManualStatusUpdate = async (reportId: string, newStatus: string) => {
    setUpdatingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setShowOverride(null);
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-10">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const isActive = currentFilter === f.value;
          const count = f.value === 'ALL' ? counts.total :
            f.value === 'OPEN' ? counts.open :
            f.value === 'CONFIRMED' ? counts.confirmed :
            f.value === 'ASSIGNED' ? counts.assigned :
            f.value === 'IN_PROGRESS' ? counts.inProgress :
            counts.resolved;

          return (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-mono uppercase tracking-widest font-bold transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-cyan/15 text-cyan border border-cyan/30 shadow-lg shadow-cyan/5'
                  : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/60'
              }`}
            >
              {f.label}
              <span className={`text-[8px] px-1.5 py-0.5 rounded ${isActive ? 'bg-cyan/20' : 'bg-white/5'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Reports Grid */}
      {reports.length === 0 ? (
        <div className="py-32 flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
          <h4 className="text-xl font-display font-bold text-white/40 uppercase tracking-tight">No Reports Found</h4>
          <p className="text-sm text-white/20 mt-2">Adjust filters to view different lifecycle stages.</p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {reports.map((report) => {
            const currentIdx = getStageIndex(report.status);
            const isResolved = report.status === 'RESOLVED';
            const isRejected = report.status === 'REJECTED';
            const isOverriding = showOverride === report.id;
            const isUpdating = updatingId === report.id;

            return (
              <motion.div
                key={report.id}
                variants={fadeUp}
                className="rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all overflow-hidden relative group"
              >
                {/* Header */}
                <div className="p-5 pb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="font-display font-bold text-sm text-white uppercase tracking-tight leading-snug truncate">
                      {report.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-widest bg-white/5 text-white/40">
                        {report.category}
                      </span>
                      {report.address && (
                        <div className="flex items-center gap-1 text-white/20 min-w-0">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span className="text-[8px] font-mono uppercase tracking-wider truncate">{report.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <div className={`shrink-0 px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest ${
                      isResolved ? 'bg-lime/10 text-lime border border-lime/20' :
                      isRejected ? 'bg-magenta/10 text-magenta border border-magenta/20' :
                      'bg-cyan/10 text-cyan border border-cyan/20'
                    }`}>
                      {report.status}
                    </div>
                    <button 
                      onClick={() => setShowOverride(isOverriding ? null : report.id)}
                      className="p-1.5 rounded-lg bg-amber/10 text-amber border border-amber/20 hover:bg-amber/20 transition-all -ml-1"
                      title="Manual Status Correction"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Timeline Bar */}
                <div className="px-5 py-4 border-t border-b border-white/5 bg-white/[0.01]">
                  {isRejected ? (
                    <div className="flex items-center gap-3 text-magenta">
                      <div className="w-5 h-5 rounded-full bg-magenta/20 flex items-center justify-center">
                        <span className="text-[10px] font-bold">✕</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-widest font-bold">Rejected</span>
                      {report.rejectedAt && (
                        <span className="text-[9px] font-mono text-magenta/50 ml-auto">
                          {formatDistanceToNow(new Date(report.rejectedAt))} ago
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {STAGES.map((stage, idx) => {
                        const isCompleted = idx < currentIdx || isResolved;
                        const isCurrent = idx === currentIdx && !isResolved;

                        return (
                          <div key={stage.key} className="flex items-center flex-1">
                            {/* Node */}
                            <div className="relative flex flex-col items-center" style={{ minWidth: 24 }}>
                              {isCompleted ? (
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                                  style={{
                                    background: stage.color,
                                    boxShadow: `0 0 12px ${stage.color}40`,
                                  }}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                                </div>
                              ) : isCurrent ? (
                                <div className="relative">
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center border-2"
                                    style={{ borderColor: stage.color, background: `${stage.color}15` }}
                                  >
                                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: stage.color }} />
                                  </div>
                                  <div
                                    className="absolute inset-0 rounded-full animate-ping opacity-30"
                                    style={{ background: stage.color }}
                                  />
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02]">
                                  <Circle className="w-2.5 h-2.5 text-white/15" />
                                </div>
                              )}
                              <span className={`text-[7px] font-mono font-bold uppercase mt-1.5 tracking-widest ${
                                isCompleted ? 'text-white/60' : isCurrent ? 'text-white/80' : 'text-white/15'
                              }`}>
                                {stage.short}
                              </span>
                            </div>

                            {/* Connector */}
                            {idx < STAGES.length - 1 && (
                              <div className="flex-1 h-0.5 mx-1 rounded-full" style={{
                                background: isCompleted ? stage.color : 'rgba(255,255,255,0.05)',
                                boxShadow: isCompleted ? `0 0 8px ${stage.color}30` : 'none',
                              }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Manual Override Controls */}
                <AnimatePresence>
                  {isOverriding && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-5 py-4 bg-white/5 border-b border-white/5 space-y-3"
                    >
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold text-white/30">Manual Status Correction</p>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {[...STAGES, { key: 'REJECTED', label: 'Reject', color: 'var(--accent-magenta)' }].map((s) => (
                          <button
                            key={s.key}
                            disabled={isUpdating || report.status === s.key}
                            onClick={() => handleManualStatusUpdate(report.id, s.key)}
                            className={`px-2 py-2 rounded-lg text-[8px] font-mono font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                              report.status === s.key 
                                ? 'bg-white/10 text-white opacity-40 cursor-default' 
                                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {isUpdating && updatingId === report.id && report.status !== s.key ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-2.5 h-2.5" />
                            )}
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Timestamps + Total */}
                <div className="p-5 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-[9px] font-mono uppercase tracking-widest text-white/25">
                    {report.confirmedAt && (
                      <span>C: {getElapsedTime(report.createdAt, report.confirmedAt)}</span>
                    )}
                    {report.assignedAt && (
                      <span>A: {getElapsedTime(report.confirmedAt || report.createdAt, report.assignedAt)}</span>
                    )}
                    {report.resolvedAt && (
                      <span>R: {getElapsedTime(report.assignedAt || report.createdAt, report.resolvedAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-white/40 font-bold">
                    <Clock className="w-3 h-3" />
                    {getTotalTime(report)}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

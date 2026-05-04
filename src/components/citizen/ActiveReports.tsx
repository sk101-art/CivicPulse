'use client';

import { Status, Category } from '@prisma/client';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { staggerContainer, fadeUp } from '@/lib/framer';

interface ReportItem {
  id: string;
  title: string;
  category: Category;
  status: Status;
  createdAt: Date;
  address: string | null;
  priorityScore: number;
  voteCount: number;
  commentCount: number;
}

interface ActiveReportsProps {
  reports: ReportItem[];
}

const statusConfig: Record<Status, { color: string; bg: string; label: string; dot: string }> = {
  OPEN:        { color: 'var(--status-open)',          bg: 'rgba(0,212,255,0.1)',    label: 'Open',        dot: '#00D4FF' },
  CONFIRMED:   { color: 'var(--accent-cyan)',          bg: 'rgba(0,245,212,0.1)',    label: 'Confirmed',   dot: '#00F5D4' },
  ASSIGNED:    { color: 'var(--accent-electric-blue)', bg: 'rgba(0,119,255,0.1)',    label: 'Assigned',    dot: '#0077FF' },
  IN_PROGRESS: { color: 'var(--status-progress)',      bg: 'rgba(255,184,0,0.1)',    label: 'In Progress', dot: '#FFB800' },
  RESOLVED:    { color: 'var(--status-resolved)',      bg: 'rgba(196,254,0,0.1)',    label: 'Resolved',    dot: '#C4FE00' },
  REJECTED:    { color: 'var(--accent-magenta)',       bg: 'rgba(255,46,99,0.1)',    label: 'Rejected',    dot: '#FF2E63' },
};

const categoryIcons: Record<Category, { emoji: string; color: string }> = {
  POTHOLES:      { emoji: '🕳️', color: 'var(--cat-potholes)' },
  DRAINAGE:      { emoji: '🌊', color: 'var(--cat-drainage)' },
  STREETLIGHTS:  { emoji: '💡', color: 'var(--cat-streetlights)' },
  SIDEWALKS:     { emoji: '🚶', color: 'var(--cat-sidewalks)' },
  TRAFFIC_SIGNS: { emoji: '🚦', color: 'var(--cat-traffic-signs)' },
  GRAFFITI:      { emoji: '🎨', color: 'var(--cat-graffiti)' },
  TRASH:         { emoji: '🗑️', color: 'var(--cat-trash)' },
  OTHER:         { emoji: '❓', color: 'var(--cat-other)' },
};

export function ActiveReports({ reports }: ActiveReportsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h3 className="font-display font-bold text-xl text-white uppercase tracking-tight">Operational Records</h3>
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Intelligence Data Feed</p>
        </div>
        <Link
          href="/citizen/profile"
          className="text-xs font-mono uppercase tracking-widest transition-colors"
          style={{ color: 'var(--accent-cyan)' }}
        >
          View All →
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl p-10 relative overflow-hidden h-full flex flex-col items-center justify-center text-center"
          style={{ border: '1.5px dashed rgba(255,255,255,0.07)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            📭
          </div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-secondary)' }}>
            No reports filed yet.
          </p>
          <Link href="/citizen/report">
            <button
              className="mt-4 text-sm font-display font-bold transition-colors"
              style={{ color: 'var(--accent-cyan)' }}
            >
              File your first report →
            </button>
          </Link>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {reports.map((report) => {
            const sc = statusConfig[report.status];
            const ci = categoryIcons[report.category];
            const priorityPct = Math.round((report.priorityScore || 0) * 100);
            return (
              <motion.div key={report.id} variants={fadeUp}>
                <Link
                  href={`/citizen/report/${report.id}`}
                  className="group block rounded-2xl transition-all duration-300 overflow-hidden bg-card border border-white/5 hover:bg-white/[0.04] flex flex-col h-full"
                  style={{ borderColor: `${sc.color}15` }}
                >
                  {/* Priority + Category Header */}
                  <div className="p-6 pb-2 flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-display font-black tracking-tighter leading-none" style={{ color: sc.color, fontVariantNumeric: 'tabular-nums' }}>
                        {priorityPct}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-widest opacity-25 font-bold">pts</span>
                    </div>
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 backdrop-blur-xl"
                      style={{ background: `${ci.color}10`, border: `1px solid ${ci.color}20` }}
                    >
                      {ci.emoji}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 flex-1 space-y-4">
                    <h4 className="font-display font-bold text-base text-white uppercase tracking-tight leading-snug group-hover:text-cyan transition-colors line-clamp-2">
                      {report.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-3 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-widest bg-white/5 border border-white/5 text-cyan/70">
                        {report.category === ('NIGGO' as any) ? 'ILLEGAL DUMPING' : report.category.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {report.address && (
                      <div className="flex items-start gap-1.5 text-white/25">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                        <p className="text-[10px] font-mono uppercase tracking-wider line-clamp-1">
                          {report.address.split(',')[0]}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Footer Status */}
                  <div className="px-6 py-5 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <span
                      className="px-4 py-2 rounded-xl text-[9px] font-mono uppercase tracking-[0.2em] font-black inline-flex items-center gap-3 transition-all"
                      style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}20` }}
                    >
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: sc.dot, boxShadow: `0 0 12px ${sc.dot}` }} />
                      {sc.label}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/20 font-bold">
                      {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  RotateCcw, 
  ShieldCheck,
  AlertOctagon
} from 'lucide-react';
import type { ResolutionPerformanceMetrics } from '@/lib/intelligence/wardAnalytics';

interface Props {
  metrics: ResolutionPerformanceMetrics;
  wardName: string;
}

export function ResolutionPerformanceSection({ metrics, wardName }: Props) {
  const cards = [
    {
      title: 'Resolution Rate',
      value: `${metrics.resolutionRate}%`,
      subtitle: `${metrics.resolvedReports} of ${metrics.totalReports} resolved`,
      desc: 'Percentage of defects independently verified as fixed by on-site citizens.',
      color: '#537C60',
      bg: '#EFF6F1',
      borderColor: '#CFE4D4',
      icon: CheckCircle2,
    },
    {
      title: 'Average Resolution Time',
      value: metrics.avgResolutionTimeHours !== null
        ? `${metrics.avgResolutionTimeHours} hrs`
        : 'N/A',
      subtitle: metrics.avgResolutionTimeDays !== null ? `≈ ${metrics.avgResolutionTimeDays} days` : 'No verified fixes in period',
      desc: 'Measured strictly from report filing to independent verification timestamp.',
      color: '#527B7A',
      bg: '#FAF9F5',
      borderColor: '#DDDCD3',
      icon: Clock,
    },
    {
      title: 'Independent Verification Rate',
      value: `${metrics.independentVerificationRate}%`,
      subtitle: `${metrics.resolvedReports} verified, ${metrics.claimedFixedCount} pending`,
      desc: 'Proportion of contractor repair claims independently verified by ground evidence.',
      color: '#355858',
      bg: '#F0F5F4',
      borderColor: '#C8DBD7',
      icon: ShieldCheck,
    },
    {
      title: 'SLA Breach Rate',
      value: `${metrics.slaBreachRate}%`,
      subtitle: `${metrics.outstandingIssues} unresolved issues remaining`,
      desc: 'Proportion of tickets that exceeded statutory response windows without repair.',
      color: '#B76F60',
      bg: '#FAF0EE',
      borderColor: '#F3D2CC',
      icon: ShieldAlert,
    },
    {
      title: 'Reopened Repairs',
      value: metrics.reopenedRepairsCount,
      subtitle: 'Post-repair recurrences',
      desc: 'Repairs where the same defect reappeared during the warranty guarantee.',
      color: '#B68B63',
      bg: '#FDF7F0',
      borderColor: '#F2DFCA',
      icon: RotateCcw,
    },
    {
      title: 'Disputed Claims',
      value: metrics.disputedCount,
      subtitle: 'Citizen audit rejections',
      desc: 'Contractor claims where citizens verified the defect was NOT satisfactorily repaired.',
      color: '#9E3B2D',
      bg: '#FBF0EF',
      borderColor: '#F1CCC8',
      icon: AlertOctagon,
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#527B7A]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              How is {wardName} Improving?
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Audit-backed metrics tracking municipal responsiveness, turnaround speed, and durability.
          </p>
        </div>

        <div className="px-3 py-1 rounded-full bg-[#FAF9F5] border border-[#DDDCD3] text-[11px] font-mono text-[#527B7A] self-start sm:self-auto font-medium">
          Zero Fabricated Denominators
        </div>
      </div>

      {/* Grid of 6 Key Performance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              style={{ backgroundColor: c.bg, borderColor: c.borderColor }}
              className="p-4 rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-[#65736B] uppercase tracking-wider">
                    {c.title}
                  </span>
                  <div
                    className="font-mono font-bold text-2xl sm:text-3xl tracking-tight mt-1"
                    style={{ color: c.color }}
                  >
                    {c.value}
                  </div>
                </div>
                <div
                  className="p-2 rounded-lg bg-white/80 border border-white/60 shadow-xs"
                  style={{ color: c.color }}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="pt-2 border-t border-black/5 text-xs">
                <div className="font-medium text-[#293732] truncate">{c.subtitle}</div>
                <div className="text-[11px] text-[#65736B] mt-0.5 leading-snug">{c.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Layers, 
  FileCheck2, 
  Calendar
} from 'lucide-react';
import type { WardOverviewMetrics, TimePeriod } from '@/lib/intelligence/wardAnalytics';

interface Props {
  metrics: WardOverviewMetrics;
  wardName: string;
  wardLabel: string;
  latestIssueDate: string | null;
  selectedPeriod: TimePeriod;
  onPeriodChange: (p: TimePeriod) => void;
  lastRefreshedAt: string;
}

export function WardOverviewMetricsSection({
  metrics,
  wardName,
  wardLabel,
  latestIssueDate,
  selectedPeriod,
  onPeriodChange,
  lastRefreshedAt,
}: Props) {
  const periods: Array<{ id: TimePeriod; label: string }> = [
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: '90d', label: 'Last 90 Days' },
    { id: '6m', label: 'Last 6 Months' },
    { id: 'all', label: 'All Records' },
  ];

  const cards = [
    {
      title: 'Total Registered Issues',
      value: metrics.totalIssues,
      desc: 'Distinct issue records assigned to this geographical ward.',
      color: '#293732',
      bg: '#FAF9F5',
      borderColor: '#DDDCD3',
      icon: Layers,
      highlight: false,
    },
    {
      title: 'Active / Unresolved',
      value: metrics.activeIssues,
      desc: 'Defects awaiting work order assignment or field repair.',
      color: '#B68B63',
      bg: '#FDF7F0',
      borderColor: '#F2DFCA',
      icon: Clock,
      highlight: metrics.activeIssues > 0,
    },
    {
      title: 'Verified Fixed',
      value: metrics.verifiedResolvedIssues,
      desc: 'Repairs independently confirmed on-site with photographic proof.',
      color: '#537C60',
      bg: '#EFF6F1',
      borderColor: '#CFE4D4',
      icon: CheckCircle2,
      highlight: false,
    },
    {
      title: 'Awaiting Verification',
      value: metrics.awaitingVerificationIssues,
      desc: 'Municipal repair claimed, pending independent citizen confirmation.',
      color: '#718F9E',
      bg: '#F0F5F8',
      borderColor: '#D4E2E9',
      icon: FileCheck2,
      highlight: metrics.awaitingVerificationIssues > 0,
    },
    {
      title: 'Critical & High Priority',
      value: metrics.criticalHighIssues,
      desc: 'High severity hazards with significant risk to safety or transit.',
      color: '#B76F60',
      bg: '#FAF0EE',
      borderColor: '#F3D2CC',
      icon: AlertTriangle,
      highlight: metrics.criticalHighIssues > 0,
    },
    {
      title: 'SLA Breached',
      value: metrics.slaBreachedIssues,
      desc: 'Unresolved issues exceeding statutory resolution timeframe.',
      color: '#9E3B2D',
      bg: '#FBF0EF',
      borderColor: '#F1CCC8',
      icon: ShieldAlert,
      highlight: metrics.slaBreachedIssues > 0,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Ward Identification Header & Time Filter Bar */}
      <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04),0_1px_3px_rgba(41,55,50,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#527B7A]" />
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-[#527B7A]">
              Ward Infrastructure Intelligence
            </span>
            <span className="text-xs text-[#929B92]">•</span>
            <span className="text-xs font-mono text-[#65736B]">
              Refreshed {new Date(lastRefreshedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#293732] tracking-tight">
            {wardLabel} • {wardName}
          </h1>
          <p className="text-xs text-[#65736B] flex items-center gap-2">
            <span>Official PostGIS Ward Boundary</span>
            <span>•</span>
            <span>
              {latestIssueDate
                ? `Latest issue registered ${new Date(latestIssueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : 'No registered defects on record'}
            </span>
          </p>
        </div>

        {/* Time Period Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl self-start md:self-auto overflow-x-auto max-w-full">
          <Calendar className="w-3.5 h-3.5 text-[#65736B] ml-2 shrink-0 hidden sm:block" />
          {periods.map((p) => {
            const isActive = selectedPeriod === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#355858] text-white font-semibold shadow-sm'
                    : 'text-[#65736B] hover:text-[#293732] hover:bg-[#EAECE6]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Core Metrics 6-Card Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              style={{ backgroundColor: c.bg, borderColor: c.borderColor }}
              className="rounded-2xl p-4 border shadow-[0_2px_8px_rgba(41,55,50,0.03)] flex flex-col justify-between transition-all hover:translate-y-[-1px] hover:shadow-md group relative"
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <span className="text-[11px] font-medium text-[#65736B] uppercase tracking-wider leading-tight">
                  {c.title}
                </span>
                <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" style={{ color: c.color }} />
              </div>

              <div>
                <div
                  className="font-mono font-bold text-2xl sm:text-3xl tracking-tight"
                  style={{ color: c.color }}
                >
                  {c.value}
                </div>
                <p className="text-[10px] text-[#65736B] mt-1 leading-snug line-clamp-2">
                  {c.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

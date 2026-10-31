'use client';

import React, { useState, useTransition } from 'react';
import { 
  Search, AlertTriangle, Building2, 
  Clock, RefreshCw, ChevronRight,
  ShieldAlert, CheckCircle2
} from 'lucide-react';
import { IssueDrawer, type DeskIssueItem } from './IssueDrawer';
import { RepairWindowBadge } from './RepairWindowBadge';
import { Status, Category, Band } from '@prisma/client';
import { formatPriority } from '@/lib/priority';
import { formatDateIST } from '@/lib/time/ist';

interface DeskQueueProps {
  initialIssues: DeskIssueItem[];
  agencies: Array<{ id: string; code: string; name: string }>;
  wards?: Array<{ id: string; code: string; name: string }>;
}

const BAND_PRIORITY: Record<Band, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function DeskQueue({ initialIssues, agencies, wards = [] }: DeskQueueProps) {
  const [issues, setIssues] = useState<DeskIssueItem[]>(initialIssues);
  const [selectedIssue, setSelectedIssue] = useState<DeskIssueItem | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [agencyFilter, setAgencyFilter] = useState<string>('ALL');
  const [wardFilter, setWardFilter] = useState<string>('ALL');
  const [slaBreachedOnly, setSlaBreachedOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, startTransition] = useTransition();

  const fetchFilteredIssues = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
    if (agencyFilter !== 'ALL') params.set('agencyId', agencyFilter);
    if (wardFilter !== 'ALL') params.set('wardId', wardFilter);
    if (slaBreachedOnly) params.set('slaBreached', 'true');
    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    try {
      const res = await fetch(`/api/desk/queue?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues);
      }
    } catch (err) {
      console.error('Failed to fetch filtered queue', err);
    }
  };

  const handleApplyFilters = () => {
    startTransition(() => {
      fetchFilteredIssues();
    });
  };

  const handleActionComplete = (updatedIssue?: DeskIssueItem) => {
    if (updatedIssue) {
      setIssues((prev) => {
        const updated = prev.map((item) =>
          item.id === updatedIssue.id ? { ...item, ...updatedIssue } : item
        );
        // Maintain PI band then PI sort
        updated.sort((a, b) => {
          const bandA = BAND_PRIORITY[a.bandOverride || a.band] || 0;
          const bandB = BAND_PRIORITY[b.bandOverride || b.band] || 0;
          if (bandB !== bandA) return bandB - bandA;
          return b.priority - a.priority;
        });
        return updated;
      });
      setSelectedIssue((prev) => (prev ? { ...prev, ...updatedIssue } : null));
    } else {
      fetchFilteredIssues();
    }
  };

  // Group or calculate stats
  const criticalCount = issues.filter(
    (i) => (i.bandOverride || i.band) === 'CRITICAL'
  ).length;
  const highCount = issues.filter(
    (i) => (i.bandOverride || i.band) === 'HIGH'
  ).length;
  const breachedCount = issues.filter((i) => i.slaBreached).length;

  return (
    <div className="space-y-6">
      {/* Stats header pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-white/50 uppercase tracking-wider block">
              Total In Queue
            </span>
            <span className="text-2xl font-bold font-mono text-white">{issues.length}</span>
          </div>
          <Building2 className="w-6 h-6 text-cyan-400" />
        </div>

        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-red-300 uppercase tracking-wider block">
              Critical Band
            </span>
            <span className="text-2xl font-bold font-mono text-red-400">{criticalCount}</span>
          </div>
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-amber-300 uppercase tracking-wider block">
              High Band
            </span>
            <span className="text-2xl font-bold font-mono text-amber-400">{highCount}</span>
          </div>
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>

        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-rose-300 uppercase tracking-wider block">
              SLA Breached
            </span>
            <span className="text-2xl font-bold font-mono text-rose-400">{breachedCount}</span>
          </div>
          <Clock className="w-6 h-6 text-rose-400" />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Status filter */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50 block mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Statuses</option>
              {Object.values(Status).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50 block mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Categories</option>
              {Object.values(Category).map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Agency filter */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50 block mb-1">
              Agency
            </label>
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Agencies</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name} ({agency.code})
                </option>
              ))}
            </select>
          </div>

          {/* Ward filter (if available) */}
          {wards.length > 0 && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/50 block mb-1">
                Ward
              </label>
              <select
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Wards</option>
                {wards.map((ward) => (
                  <option key={ward.id} value={ward.id}>
                    {ward.name} ({ward.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search box */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50 block mb-1">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search address or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-cyan-500"
              />
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Action bar for filters */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-white/70">
            <input
              type="checkbox"
              checked={slaBreachedOnly}
              onChange={(e) => setSlaBreachedOnly(e.target.checked)}
              className="rounded bg-white/5 border-white/20 text-rose-500 focus:ring-0"
            />
            Show SLA Breached Only
          </label>

          <button
            onClick={handleApplyFilters}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Apply Filters
          </button>
        </div>
      </div>

      {/* Queue list */}
      <div className="space-y-3">
        {issues.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-cyan-400 mx-auto" />
            <h4 className="text-sm font-bold text-white font-mono uppercase">Queue is empty</h4>
            <p className="text-xs font-mono text-white/40">
              No issues matching current filters.
            </p>
          </div>
        ) : (
          issues.map((issue) => {
            const pri = formatPriority(issue.priority);
            const effectiveBand = issue.bandOverride || issue.band || pri.band;
            const bandColor =
              effectiveBand === 'CRITICAL'
                ? 'border-red-500/40 text-red-400 bg-red-500/10'
                : effectiveBand === 'HIGH'
                ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                : effectiveBand === 'MEDIUM'
                ? 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10'
                : 'border-slate-500/40 text-slate-400 bg-slate-500/10';

            return (
              <div
                key={issue.id}
                onClick={() => setSelectedIssue(issue)}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.08] transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left side: Band & Category & Address */}
                <div className="flex items-start gap-4">
                  <div
                    className={`px-3 py-2 rounded-xl text-center font-mono font-bold border ${bandColor}`}
                  >
                    <span className="block text-[10px] tracking-wider uppercase">
                      {effectiveBand}
                    </span>
                    <span className="text-base">{pri.scoreFormatted}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        {issue.category.replace(/_/g, ' ')}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-white">
                        {issue.status}
                      </span>
                      {issue.slaBreached && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          SLA BREACHED
                        </span>
                      )}
                      {issue.isSeed && (
                        <span data-testid="seed-tag" className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          SEED
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-white/50">
                      {issue.address && issue.address.trim() && issue.address.toLowerCase() !== 'bengaluru' && !issue.address.toLowerCase().includes('pending') && !issue.address.includes('Report Location')
                        ? issue.address
                        : `Near ${issue.lat.toFixed(4)}, ${issue.lng.toFixed(4)}`}
                    </p>
                    <div className="pt-1.5">
                      {issue.bestRepairWindow ? (
                        <RepairWindowBadge
                          issueId={issue.id}
                          variant="card"
                          initialResult={{
                            issueId: issue.id,
                            basis: (issue.bestRepairWindow.basis as any) || 'estimated',
                            sampleCount: issue.bestRepairWindow.sampleCount || 0,
                            bestWindow: {
                              start: issue.bestRepairWindow.start,
                              end: issue.bestRepairWindow.end,
                              score: issue.bestRepairWindow.score,
                              display: issue.bestRepairWindow.display || `${issue.bestRepairWindow.start} - ${issue.bestRepairWindow.end}`,
                              dayOfWeek: (issue.bestRepairWindow as any).dayOfWeek || '',
                              timeRange: (issue.bestRepairWindow as any).timeRange || '',
                              expectedCongestion: (issue.bestRepairWindow as any).expectedCongestion ?? (issue.bestRepairWindow as any).delayRatio ?? 0.1,
                              delayRatio: (issue.bestRepairWindow as any).delayRatio ?? (issue.bestRepairWindow as any).expectedCongestion ?? 0.1,
                              condition: issue.bestRepairWindow.condition || issue.bestRepairWindow.reason,
                              basis: (issue.bestRepairWindow.basis as any) || 'estimated',
                              sampleCount: issue.bestRepairWindow.sampleCount || 0,
                              factors: (issue.bestRepairWindow as any).factors || { trafficScore: 80, weatherScore: 100, surroundingsScore: 100, crewScore: 90 },
                              explanation: (issue.bestRepairWindow as any).explanation || '',
                              laneClosure: (issue.bestRepairWindow as any).laneClosure,
                              dayType: (issue.bestRepairWindow as any).dayType,
                            } as any,
                            windows: [],
                            allSlots: [],
                            displayText: issue.bestRepairWindow.display || '',
                          }}
                        />
                      ) : (
                        <RepairWindowBadge issueId={issue.id} variant="card" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Agency, Handoffs, SLA countdown, Arrow */}
                <div className="flex items-center gap-4 text-xs font-mono self-end md:self-center">
                  <div className="text-right space-y-0.5">
                    <div className="flex items-center gap-1.5 justify-end text-white/80">
                      <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{issue.agency?.name || 'Unassigned'}</span>
                      {issue.handoffCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {issue.handoffCount} {issue.handoffCount === 1 ? 'handoff' : 'handoffs'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 justify-end text-white/40 text-[11px]">
                      <Clock className="w-3 h-3" />
                      <span>Due: {formatDateIST(issue.slaDueAt)}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-white/30" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Slide-over issue drawer */}
      <IssueDrawer
        issue={selectedIssue}
        agencies={agencies}
        onClose={() => setSelectedIssue(null)}
        onActionComplete={handleActionComplete}
      />
    </div>
  );
}

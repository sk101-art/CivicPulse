'use client';

import React, { useState, useTransition, useMemo, useEffect, useCallback } from 'react';
import { 
  Search, AlertTriangle, Building2, 
  Clock, RefreshCw, ChevronRight,
  ShieldAlert, CheckCircle2, SlidersHorizontal, Eye,
  MapPin, Inbox, Loader2
} from 'lucide-react';
import { IssueDrawer, type DeskIssueItem } from './IssueDrawer';
import { RepairWindowBadge } from './RepairWindowBadge';
import { Status, Category, Band } from '@prisma/client';
import { formatPriority } from '@/lib/priority';
import { useGeoContext } from '@/context/GeoContext';

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

function formatIssueId(id: string): string {
  if (id.startsWith('CP-')) return id;
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `CP-${digits.slice(-4)}`;
  }
  return `CP-${id.slice(0, 4).toUpperCase()}`;
}

function formatLocationLabel(address?: string | null, lat?: number, lng?: number): string {
  if (!address || address.toLowerCase() === 'bengaluru' || address.toLowerCase().includes('pending') || address.includes('Report Location')) {
    if (lat && lng) return `Near ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    return 'Ward Sector';
  }
  const parts = address.split(',');
  return parts.slice(0, 2).join(', ').trim();
}

function calculateSlaRemaining(slaDueAt: string | Date, slaBreached: boolean): string {
  if (slaBreached) return 'Breached';
  const now = new Date().getTime();
  const due = new Date(slaDueAt).getTime();
  const diffHours = Math.round((due - now) / (1000 * 60 * 60));
  if (diffHours < 0) return 'Breached';
  if (diffHours < 24) return `${Math.max(1, diffHours)}h`;
  const days = Math.round(diffHours / 24);
  return `${days}d`;
}

export function DeskQueue({ initialIssues, agencies, wards = [] }: DeskQueueProps) {
  const { currentWard } = useGeoContext();

  const [issues, setIssues] = useState<DeskIssueItem[]>(initialIssues);
  const [selectedIssue, setSelectedIssue] = useState<DeskIssueItem | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [agencyFilter, setAgencyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, startTransition] = useTransition();

  // Fetch filtered issues from API using currentWard and filters
  const fetchFilteredIssues = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
    if (agencyFilter !== 'ALL') params.set('agencyId', agencyFilter);

    // Apply authoritative ward from global context
    if (currentWard && currentWard.code !== 'ALL' && currentWard.id !== 'zone-all') {
      params.set('wardId', currentWard.id || currentWard.code);
    }

    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    try {
      const res = await fetch(`/api/desk/queue?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
      }
    } catch (err) {
      console.error('Failed to fetch filtered queue', err);
    }
  }, [statusFilter, categoryFilter, agencyFilter, currentWard, searchQuery]);

  // Re-fetch automatically whenever currentWard changes
  useEffect(() => {
    startTransition(() => {
      fetchFilteredIssues();
    });
  }, [currentWard, fetchFilteredIssues]);

  // Keep Operations Queue synced with new citizen reports/updates across tabs and sessions
  useEffect(() => {
    const syncQueue = () => {
      if (document.visibilityState === 'visible') {
        void fetchFilteredIssues();
      }
    };
    window.addEventListener('focus', syncQueue);
    document.addEventListener('visibilitychange', syncQueue);
    const interval = window.setInterval(syncQueue, 15000);
    return () => {
      window.removeEventListener('focus', syncQueue);
      document.removeEventListener('visibilitychange', syncQueue);
      window.clearInterval(interval);
    };
  }, [fetchFilteredIssues]);

  const displayIssues = useMemo(() => {
    let list = [...issues];
    
    // Client-side quick filter
    if (statusFilter !== 'ALL') {
      list = list.filter(i => i.status === statusFilter);
    }
    if (categoryFilter !== 'ALL') {
      list = list.filter(i => i.category === categoryFilter);
    }
    if (agencyFilter !== 'ALL') {
      list = list.filter(i => i.agencyId === agencyFilter || i.agency?.id === agencyFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i => 
        (i.address && i.address.toLowerCase().includes(q)) ||
        i.id.toLowerCase().includes(q) ||
        (i.category && i.category.toLowerCase().includes(q))
      );
    }

    return list;
  }, [issues, statusFilter, categoryFilter, agencyFilter, searchQuery]);

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

  // Live Metrics counts for the currently selected ward
  const totalOpen = displayIssues.filter(i => i.status !== Status.VERIFIED_FIXED && i.status !== Status.REJECTED).length;
  const criticalCount = displayIssues.filter(i => (i.bandOverride || i.band) === 'CRITICAL' || (i.bandOverride || i.band) === 'HIGH').length;
  const inProgressCount = displayIssues.filter(i => i.status === Status.IN_PROGRESS).length;
  const breachedCount = displayIssues.filter(i => i.slaBreached).length;

  return (
    <div className="space-y-6">
      {/* 4 Raised Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Open Issues */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#293732] tracking-tight">
            {totalOpen}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            Open Tickets ({currentWard?.wardLabel || 'Ward'})
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#527B7A]" />
        </div>

        {/* Critical / High */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#B76F60] tracking-tight">
            {criticalCount}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            High / Critical Priority
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#B76F60]" />
        </div>

        {/* In Progress */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#355858] tracking-tight">
            {inProgressCount}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            Active in Field
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#527B7A]" />
        </div>

        {/* SLA Breaches */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#B68B63] tracking-tight">
            {breachedCount}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            SLA Breaches
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#B68B63]" />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#FFFFFF] rounded-2xl p-4 border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.04)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] transition-all cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="OPEN">Open / Reported</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="CLAIMED_FIXED">Claimed Fixed</option>
              <option value="VERIFIED_FIXED">Verified Fixed</option>
              <option value="DISPUTED">Disputed</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] transition-all cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="POTHOLES">Potholes</option>
              <option value="DRAINAGE">Drainage</option>
              <option value="STREETLIGHTS">Streetlights</option>
              <option value="TRASH">Garbage / Trash</option>
              <option value="SIDEWALKS">Sidewalks</option>
              <option value="TRAFFIC_SIGNS">Traffic Signs</option>
              <option value="ROAD_CUT">Road Cut</option>
              <option value="OTHER">Other</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
          </div>

          {/* Agency Dropdown */}
          <div className="relative">
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] transition-all cursor-pointer"
            >
              <option value="ALL">All Agencies</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.code} • {agency.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
          </div>

          {/* Geographical Context Pill Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs font-semibold text-[#293732]">
            <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
            <span>Scope: {currentWard?.fullName || 'Full Jurisdiction'}</span>
          </div>
        </div>

        {/* Search input with recessed styling */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search address or issue ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl pl-8 pr-3 py-2 text-xs font-sans text-[#293732] placeholder:text-[#929B92] shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
          />
          <Search className="w-3.5 h-3.5 text-[#929B92] absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Swiss-Grid Operations Ledger Table */}
      <div className="bg-[#FFFFFF] rounded-2xl border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DDDCD3] bg-[#FAF9F5] text-[#65736B] font-semibold select-none">
                <th className="py-3 px-4 w-28">Issue ID</th>
                <th className="py-3 px-4 w-24">Category</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 w-28">Priority Index</th>
                <th className="py-3 px-4 w-28">Status</th>
                <th className="py-3 px-4 w-24">SLA Clock</th>
                <th className="py-3 px-4 w-20 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDDCD3]/60 font-medium text-[#293732]">
              {displayIssues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#65736B] bg-[#FAF9F5]/40">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Inbox className="w-8 h-8 text-[#929B92]" />
                      <div className="font-semibold text-[#293732]">
                        No issues found in {currentWard?.wardLabel || 'selected ward'}
                      </div>
                      <p className="text-xs text-[#65736B] max-w-sm">
                        There are no active municipal issues matching the current filters in this geographical scope.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayIssues.map((issue) => {
                  const statusStyles: Record<string, string> = {
                    OPEN: "bg-[#EFF3F6] text-[#718F9E] border-[#D4E0E7]",
                    ASSIGNED: "bg-[#F3F4F1] text-[#65736B] border-[#DDDCD3]",
                    IN_PROGRESS: "bg-[#FBF5EB] text-[#B68B63] border-[#F2E2C9]",
                    CLAIMED_FIXED: "bg-[#EAF2F0] text-[#527B7A] border-[#D0E2DF]",
                    VERIFIED_FIXED: "bg-[#EBF3ED] text-[#537C60] border-[#CDE3D2]",
                    DISPUTED: "bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]",
                  };

                  const currentBand = issue.bandOverride || issue.band;
                  const bandStyles: Record<string, string> = {
                    CRITICAL: "bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]",
                    HIGH: "bg-[#FDF6ED] text-[#B68B63] border-[#F4E3CB]",
                    MEDIUM: "bg-[#F9FAF8] text-[#65736B] border-[#DDDCD3]",
                    LOW: "bg-[#FAF9F5] text-[#929B92] border-[#E5E9E3]",
                  };

                  return (
                    <tr
                      key={issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      className="hover:bg-[#FAF9F5] transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#355858]">
                        {formatIssueId(issue.id)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-[#293732]">
                          {(issue.category || 'OTHER').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="truncate max-w-xs sm:max-w-md font-sans text-[#293732]">
                          {formatLocationLabel(issue.address, issue.lat, issue.lng)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${bandStyles[currentBand] || bandStyles.LOW}`}>
                            {currentBand}
                          </span>
                          <span className="font-mono text-xs text-[#65736B]">
                            {typeof issue.priority === 'number' ? issue.priority.toFixed(1) : issue.priority}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyles[issue.status] || statusStyles.OPEN}`}>
                          {issue.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <div className="space-y-1">
                          <span className={issue.slaBreached ? "text-[#B76F60] font-bold" : "text-[#65736B]"}>
                            {calculateSlaRemaining(issue.slaDueAt, issue.slaBreached)}
                          </span>
                          {issue.bestRepairWindow && (() => {
                            const rw = issue.bestRepairWindow as any;
                            const rwResult = rw.bestWindow
                              ? rw
                              : {
                                  bestWindow: rw,
                                  basis: rw.basis || 'estimated',
                                  sampleCount: rw.sampleCount || 0,
                                  windows: [rw],
                                  allSlots: [rw],
                                };
                            return (
                              <RepairWindowBadge
                                issueId={issue.id}
                                variant="card"
                                initialResult={rwResult}
                              />
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIssue(issue);
                          }}
                          className="p-1 rounded-lg text-[#929B92] group-hover:text-[#527B7A] group-hover:bg-[#E5E9E3] transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-Over Drawer for Selected Issue */}
      {selectedIssue && (
        <IssueDrawer
          issue={selectedIssue}
          agencies={agencies}
          onClose={() => setSelectedIssue(null)}
          onActionComplete={handleActionComplete}
        />
      )}
    </div>
  );
}

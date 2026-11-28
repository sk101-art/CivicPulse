'use client';

import React, { useState, useTransition, useMemo, useEffect, useCallback } from 'react';
import { 
  Search, AlertTriangle, ChevronRight, MapPin, Inbox
} from 'lucide-react';
import { IssueDrawer, type DeskIssueItem } from './IssueDrawer';
import { RepairWindowBadge } from './RepairWindowBadge';
import { Status, Band } from '@prisma/client';
import { useGeoContext } from '@/context/GeoContext';
import { subscribeIssueUpdates } from '@/lib/map/statusPresentation';

interface DeskQueueProps {
  initialIssues: DeskIssueItem[];
  agencies: Array<{ id: string; code: string; name: string }>;
  wards?: Array<{ id: string; code: string; name: string }>;
  initialLoadError?: string | null;
}

const BAND_PRIORITY: Record<Band, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const QUEUE_GRID_COLUMNS =
  'grid grid-cols-[88px_minmax(108px,0.9fr)_minmax(150px,1.25fr)_minmax(124px,0.85fr)_minmax(122px,0.85fr)_minmax(290px,2.1fr)_42px] items-center';

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-[#EFF3F6] text-[#718F9E] border-[#D4E0E7]',
  ASSIGNED: 'bg-[#F3F4F1] text-[#65736B] border-[#DDDCD3]',
  IN_PROGRESS: 'bg-[#FBF5EB] text-[#B68B63] border-[#F2E2C9]',
  CLAIMED_FIXED: 'bg-[#EAF2F0] text-[#527B7A] border-[#D0E2DF]',
  VERIFIED_FIXED: 'bg-[#EBF3ED] text-[#537C60] border-[#CDE3D2]',
  DISPUTED: 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]',
};

const BAND_STYLES: Record<string, string> = {
  CRITICAL: 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]',
  HIGH: 'bg-[#FDF6ED] text-[#B68B63] border-[#F4E3CB]',
  MEDIUM: 'bg-[#F9FAF8] text-[#65736B] border-[#DDDCD3]',
  LOW: 'bg-[#FAF9F5] text-[#929B92] border-[#E5E9E3]',
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

function getSlaStatusInfo(slaDueAt: string | Date, slaBreached: boolean, status?: Status): {
  label: string;
  remainingText: string;
  colorClass: string;
  dotClass: string;
} {
  if (status === Status.VERIFIED_FIXED) {
    return {
      label: 'Closed',
      remainingText: 'Verified fixed',
      colorClass: 'text-[#537C60]',
      dotClass: 'bg-[#537C60]',
    };
  }
  if (status === Status.REJECTED) {
    return {
      label: 'Closed',
      remainingText: 'Rejected',
      colorClass: 'text-[#65736B]',
      dotClass: 'bg-[#929B92]',
    };
  }

  const now = Date.now();
  const due = new Date(slaDueAt).getTime();
  const diffHours = Math.round((due - now) / (1000 * 60 * 60));

  if (slaBreached || diffHours < 0) {
    const overdueH = Math.abs(diffHours);
    const detail = overdueH >= 24 ? `${Math.round(overdueH / 24)}d overdue` : `${Math.max(1, overdueH)}h overdue`;
    return {
      label: 'Breached',
      remainingText: detail,
      colorClass: 'text-[#B76F60]',
      dotClass: 'bg-[#B76F60]',
    };
  }

  if (diffHours <= 12) {
    return {
      label: 'At Risk',
      remainingText: `${Math.max(1, diffHours)}h left`,
      colorClass: 'text-[#B68B63]',
      dotClass: 'bg-[#B68B63]',
    };
  }

  const remainingText = diffHours < 24 ? `${diffHours}h left` : `${Math.round(diffHours / 24)}d left`;
  return {
    label: 'Within SLA',
    remainingText,
    colorClass: 'text-[#537C60]',
    dotClass: 'bg-[#537C60]',
  };
}

export function DeskQueue({ initialIssues, agencies, wards = [], initialLoadError = null }: DeskQueueProps) {
  const { currentWard, availableWards } = useGeoContext();

  const [issues, setIssues] = useState<DeskIssueItem[]>(initialIssues);
  const [selectedIssue, setSelectedIssue] = useState<DeskIssueItem | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(initialLoadError);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [agencyFilter, setAgencyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [, startTransition] = useTransition();

  const wardLookup = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const w of wards) map.set(w.id, w);
    for (const w of availableWards) {
      if (!map.has(w.id)) map.set(w.id, { id: w.id, code: w.code, name: w.name });
    }
    return map;
  }, [wards, availableWards]);

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
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setFetchError(errBody?.message || errBody?.error || 'Failed to load Operations Queue records.');
        return;
      }
      const data = await res.json();
      setFetchError(null);
      setIssues(data.issues || []);
    } catch (err) {
      console.error('Failed to fetch filtered queue', err);
      setFetchError('Network error while loading Operations Queue. Please retry.');
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
    const unsubscribe = subscribeIssueUpdates(() => {
      void fetchFilteredIssues();
    });
    window.addEventListener('focus', syncQueue);
    document.addEventListener('visibilitychange', syncQueue);
    const interval = window.setInterval(syncQueue, 15000);
    return () => {
      unsubscribe();
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
        formatIssueId(i.id).toLowerCase().includes(q) ||
        (i.category && i.category.toLowerCase().includes(q))
      );
    }

    return list.map((item) => {
      const rawWardId = (item as { wardId?: string | null }).wardId;
      if (!item.ward && rawWardId && wardLookup.has(rawWardId)) {
        return { ...item, ward: wardLookup.get(rawWardId) };
      }
      return item;
    });
  }, [issues, statusFilter, categoryFilter, agencyFilter, searchQuery, wardLookup]);

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

  // Live Metrics counts for the currently selected ward (active issues only for priority/SLA)
  const activeIssues = displayIssues.filter(i => i.status !== Status.VERIFIED_FIXED && i.status !== Status.REJECTED);
  const totalOpen = activeIssues.length;
  const criticalCount = activeIssues.filter(i => (i.bandOverride || i.band) === 'CRITICAL' || (i.bandOverride || i.band) === 'HIGH').length;
  const inProgressCount = activeIssues.filter(i => i.status === Status.IN_PROGRESS).length;
  const breachedCount = activeIssues.filter(i => i.slaBreached).length;

  return (
    <div className="space-y-6">
      {/* 4 Raised Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Open Issues */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#293732] tracking-tight">
            {fetchError ? '—' : totalOpen}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            Open Tickets ({currentWard?.wardLabel || 'Ward'})
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#527B7A]" />
        </div>

        {/* Critical / High */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#B76F60] tracking-tight">
            {fetchError ? '—' : criticalCount}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            High / Critical Priority
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#B76F60]" />
        </div>

        {/* In Progress */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#355858] tracking-tight">
            {fetchError ? '—' : inProgressCount}
          </div>
          <div className="text-xs font-medium text-[#65736B] mt-1">
            Active in Field
          </div>
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#527B7A]" />
        </div>

        {/* SLA Breaches */}
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.04)] relative overflow-hidden transition-all hover:shadow-md">
          <div className="text-3xl lg:text-4xl font-display font-bold text-[#B68B63] tracking-tight">
            {fetchError ? '—' : breachedCount}
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
              <option value="CONFIRMED">Confirmed</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="CLAIMED_FIXED">Claimed Fixed</option>
              <option value="DISPUTED">Disputed</option>
              <option value="REOPENED_IN_WARRANTY">Reopened (Warranty)</option>
              <option value="VERIFIED_FIXED">Verified Fixed</option>
              <option value="REJECTED">Rejected</option>
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
              <option value="WATERLOGGING">Waterlogging</option>
              <option value="STREETLIGHTS">Streetlights</option>
              <option value="TRASH">Garbage / Trash</option>
              <option value="SIDEWALKS">Sidewalks</option>
              <option value="FOOTPATH">Footpath</option>
              <option value="TRAFFIC_SIGNS">Traffic Signs</option>
              <option value="ROAD_CUT">Road Cut</option>
              <option value="TREE_FALL">Tree Fall</option>
              <option value="GRAFFITI">Graffiti</option>
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

      {/* Error Banner (never silently treat failed API calls as 0 records) */}
      {fetchError && (
        <div className="p-3.5 rounded-2xl bg-[#FBF1EF] border border-[#EAC8C1] text-[#B76F60] text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={handleApplyFilters}
            className="px-3 py-1 rounded-lg bg-white border border-[#EAC8C1] text-[#B76F60] font-semibold hover:bg-[#FAF9F5] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Swiss-Grid Operations Ledger Table */}
      <div className="bg-[#FFFFFF] rounded-2xl border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] overflow-hidden">
        {/* Desktop & Tablet Aligned Grid */}
        <div className="hidden md:block overflow-x-auto w-full">
          <div className="min-w-[924px] w-full text-left text-xs">
            {/* Table Header */}
            <div
              role="row"
              className={`${QUEUE_GRID_COLUMNS} border-b border-[#DDDCD3] bg-[#FAF9F5] text-[#65736B] font-semibold select-none`}
            >
              <div className="py-3 px-2.5 lg:px-3 whitespace-nowrap">Issue ID</div>
              <div className="py-3 px-2.5 lg:px-3 whitespace-nowrap">Category</div>
              <div className="py-3 px-2.5 lg:px-3 whitespace-nowrap">Location</div>
              <div className="py-3 px-2.5 lg:px-3 whitespace-nowrap">Priority Index</div>
              <div className="py-3 px-2.5 lg:px-3 whitespace-nowrap">Status</div>
              <div className="py-3 px-2.5 lg:px-3 whitespace-nowrap">SLA Clock</div>
              <div className="py-3 px-1 text-center whitespace-nowrap">Action</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-[#DDDCD3]/60 font-medium text-[#293732]">
              {displayIssues.length === 0 ? (
                <div className="py-12 text-center text-[#65736B] bg-[#FAF9F5]/40">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Inbox className="w-8 h-8 text-[#929B92]" />
                    <div className="font-semibold text-[#293732]">
                      {fetchError ? 'Queue results unavailable' : `No issues found in ${currentWard?.wardLabel || 'selected ward'}`}
                    </div>
                    <p className="text-xs text-[#65736B] max-w-sm">
                      {fetchError ? 'The live issue query failed. Use Retry above to load current results.' : 'There are no active municipal issues matching the current filters in this geographical scope.'}
                    </p>
                  </div>
                </div>
              ) : (
                displayIssues.map((issue) => {
                  const currentBand = issue.bandOverride || issue.band;
                  const displayIssueId = formatIssueId(issue.id);
                  const locationText = formatLocationLabel(issue.address, issue.lat, issue.lng);
                  const slaInfo = getSlaStatusInfo(issue.slaDueAt, issue.slaBreached, issue.status);
                  const rwResult = issue.bestRepairWindow ?? null;

                  return (
                    <div
                      key={issue.id}
                      role="row"
                      onClick={() => setSelectedIssue(issue)}
                      className={`${QUEUE_GRID_COLUMNS} min-h-[84px] hover:bg-[#FAF9F5] transition-colors cursor-pointer group`}
                    >
                      {/* 1. Issue ID */}
                      <div className="py-2.5 px-2.5 lg:px-3 flex items-center min-w-0 font-mono font-bold text-[#355858]">
                        <span
                          title={issue.id}
                          className={displayIssueId.length > 10 ? 'break-words leading-tight' : 'whitespace-nowrap'}
                        >
                          {displayIssueId}
                        </span>
                      </div>

                      {/* 2. Category */}
                      <div className="py-2.5 px-2.5 lg:px-3 flex items-center min-w-0">
                        <span
                          title={(issue.category || 'OTHER').replace(/_/g, ' ')}
                          className="font-medium text-[#293732] truncate"
                        >
                          {(issue.category || 'OTHER').replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* 3. Location */}
                      <div className="py-2.5 px-2.5 lg:px-3 flex items-center min-w-0">
                        <div
                          title={issue.address || locationText}
                          className="line-clamp-2 font-sans text-[#293732] leading-snug break-words"
                        >
                          {locationText}
                        </div>
                      </div>

                      {/* 4. Priority Index */}
                      <div className="py-2.5 px-2.5 lg:px-3 flex items-center min-w-0">
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                              BAND_STYLES[currentBand] || BAND_STYLES.LOW
                            }`}
                          >
                            {currentBand}
                          </span>
                          <span className="font-mono text-xs font-medium text-[#65736B] tabular-nums">
                            {typeof issue.priority === 'number' ? issue.priority.toFixed(1) : issue.priority}
                          </span>
                        </div>
                      </div>

                      {/* 5. Status */}
                      <div className="py-2.5 px-2.5 lg:px-3 flex items-center min-w-0">
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            STATUS_STYLES[issue.status] || STATUS_STYLES.OPEN
                          }`}
                        >
                          {issue.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* 6. SLA Clock */}
                      <div className="py-2.5 px-2.5 lg:px-3 flex items-center min-w-0">
                        <div className="w-full flex flex-col justify-center gap-1.5 min-w-0">
                          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${slaInfo.dotClass}`} />
                            <span className={`font-semibold whitespace-nowrap ${slaInfo.colorClass}`}>
                              {slaInfo.label}
                            </span>
                            <span className="font-mono text-[11px] text-[#65736B] whitespace-nowrap">
                              · {slaInfo.remainingText}
                            </span>
                          </div>
                          {rwResult ? (
                            <RepairWindowBadge
                              issueId={issue.id}
                              variant="card"
                              initialResult={rwResult}
                            />
                          ) : (
                            <div className="w-full rounded-lg bg-[#FAF9F5] border border-[#E5E9E3] px-2.5 py-1.5 text-[11px] leading-tight text-[#65736B] font-sans">
                              No repair window available
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 7. Action */}
                      <div className="py-2.5 px-1 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIssue(issue);
                          }}
                          aria-label={`Inspect ${displayIssueId}`}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#929B92] group-hover:text-[#527B7A] group-hover:bg-[#E5E9E3] transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Mobile Compact Issue Cards */}
        <div className="md:hidden divide-y divide-[#DDDCD3]/60 text-xs font-medium text-[#293732]">
          {displayIssues.length === 0 ? (
            <div className="py-12 px-4 text-center text-[#65736B] bg-[#FAF9F5]/40">
              <div className="flex flex-col items-center justify-center space-y-2">
                <Inbox className="w-8 h-8 text-[#929B92]" />
                <div className="font-semibold text-[#293732]">
                  {fetchError ? 'Queue results unavailable' : `No issues found in ${currentWard?.wardLabel || 'selected ward'}`}
                </div>
                <p className="text-xs text-[#65736B] max-w-sm">
                  {fetchError ? 'The live issue query failed. Use Retry above to load current results.' : 'There are no active municipal issues matching the current filters in this geographical scope.'}
                </p>
              </div>
            </div>
          ) : (
            displayIssues.map((issue) => {
              const currentBand = issue.bandOverride || issue.band;
              const displayIssueId = formatIssueId(issue.id);
              const locationText = formatLocationLabel(issue.address, issue.lat, issue.lng);
              const slaInfo = getSlaStatusInfo(issue.slaDueAt, issue.slaBreached, issue.status);
              const rwResult = issue.bestRepairWindow ?? null;

              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className="p-4 space-y-3 hover:bg-[#FAF9F5] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-[#355858]">
                          {displayIssueId}
                        </span>
                        <span className="text-[#929B92]">·</span>
                        <span className="font-medium text-[#293732] truncate">
                          {(issue.category || 'OTHER').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div
                        title={issue.address || locationText}
                        className="text-xs text-[#65736B] line-clamp-2 leading-snug"
                      >
                        {locationText}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIssue(issue);
                      }}
                      aria-label={`Inspect ${displayIssueId}`}
                      className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg text-[#929B92] bg-[#FAF9F5] border border-[#DDDCD3] hover:text-[#527B7A]"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          BAND_STYLES[currentBand] || BAND_STYLES.LOW
                        }`}
                      >
                        {currentBand}
                      </span>
                      <span className="font-mono text-xs font-medium text-[#65736B] tabular-nums">
                        {typeof issue.priority === 'number' ? issue.priority.toFixed(1) : issue.priority}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        STATUS_STYLES[issue.status] || STATUS_STYLES.OPEN
                      }`}
                    >
                      {issue.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-[#DDDCD3]/50">
                    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${slaInfo.dotClass}`} />
                      <span className={`font-semibold ${slaInfo.colorClass}`}>{slaInfo.label}</span>
                      <span className="font-mono text-[11px] text-[#65736B]">
                        · {slaInfo.remainingText}
                      </span>
                    </div>
                    {rwResult ? (
                      <RepairWindowBadge
                        issueId={issue.id}
                        variant="card"
                        initialResult={rwResult}
                      />
                    ) : (
                      <div className="w-full rounded-lg bg-[#FAF9F5] border border-[#E5E9E3] px-2.5 py-1.5 text-[11px] leading-tight text-[#65736B] font-sans">
                        No repair window available
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Slide-Over Drawer for Selected Issue */}
      {selectedIssue && (
        <IssueDrawer
          key={selectedIssue.id}
          issue={selectedIssue}
          agencies={agencies}
          onClose={() => setSelectedIssue(null)}
          onActionComplete={handleActionComplete}
        />
      )}
    </div>
  );
}

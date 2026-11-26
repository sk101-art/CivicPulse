'use client';

import React, { useState, useTransition, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  X,
  Search,
  ExternalLink,
  RotateCcw,
  Loader2,
  Inbox,
  FileCheck2,
  Layers,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  UserCheck,
  ArrowRightLeft,
} from 'lucide-react';
import type { ClaimGapGroupStats } from '@/lib/issues/claimGap';
import type { ClaimGapSummary, ClaimIssueItem } from '@/lib/issues/claimGapData';
import { formatDateIST, formatDateTimeIST } from '@/lib/time/ist';
import { SearchableWardSelect } from '@/components/layout/SearchableWardSelect';
import { notifyIssueUpdated, subscribeIssueUpdates } from '@/lib/map/statusPresentation';

interface FilterOptions {
  corporations: Array<{ id: string; code: string; name: string; shortName: string }>;
  wards: Array<{ id: string; code: string; name: string; corporationId: string | null }>;
  agencies: Array<{ id: string; code: string; name: string }>;
}

interface ClaimGapDashboardProps {
  initialByWard: ClaimGapGroupStats[];
  initialByDesk: ClaimGapGroupStats[];
  initialRecords?: ClaimIssueItem[];
  initialSummary?: ClaimGapSummary;
  initialFilterOptions?: FilterOptions;
  initialPeriod: number;
  isStaffView?: boolean;
}

type TabType = 'disputed' | 'reopened' | 'verified' | 'pending' | 'all' | 'scorecard';

const CATEGORIES = [
  'POTHOLES',
  'DRAINAGE',
  'WATERLOGGING',
  'STREETLIGHTS',
  'SIDEWALKS',
  'FOOTPATH',
  'TRAFFIC_SIGNS',
  'ROAD_CUT',
  'TREE_FALL',
  'GRAFFITI',
  'TRASH',
  'OTHER',
];

const REASSIGN_REASONS = [
  'Repair quality unsatisfactory',
  'Contractor failed to meet requirements',
  'SLA breach',
  'Insufficient repair evidence',
  'Original agency unavailable',
  'Repeated repair failure',
  'Incorrect original assignment',
  'Other',
];

interface PersonnelOption {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
}

function outcomeBadge(outcome: ClaimIssueItem['outcome']) {
  switch (outcome) {
    case 'FIXED':
      return { label: 'Verified Fixed', cls: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]' };
    case 'NOT_FIXED':
      return { label: 'Disputed', cls: 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]' };
    case 'REOPENED':
      return { label: 'Reopened', cls: 'bg-[#FDF7F0] text-[#B68B63] border-[#F2DFCA]' };
    default:
      return { label: 'Awaiting Verification', cls: 'bg-[#F0F5F8] text-[#718F9E] border-[#D4E2E9]' };
  }
}

export function ClaimGapDashboard({
  initialByWard,
  initialByDesk,
  initialRecords = [],
  initialSummary,
  initialFilterOptions,
  initialPeriod,
  isStaffView = false,
}: ClaimGapDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('disputed');
  const [period, setPeriod] = useState<number>(initialPeriod);
  const [view, setView] = useState<'ward' | 'desk'>('ward');

  const [byWard, setByWard] = useState<ClaimGapGroupStats[]>(initialByWard);
  const [byDesk, setByDesk] = useState<ClaimGapGroupStats[]>(initialByDesk);
  const [records, setRecords] = useState<ClaimIssueItem[]>(initialRecords);
  const [summary, setSummary] = useState<ClaimGapSummary>(
    initialSummary ?? {
      totalClaims: initialRecords.length,
      verified: initialRecords.filter((r) => r.outcome === 'FIXED').length,
      disputed: initialRecords.filter((r) => r.outcome === 'NOT_FIXED').length,
      reopened: initialRecords.filter((r) => r.outcome === 'REOPENED').length,
      awaitingVerification: initialRecords.filter((r) => r.outcome === 'PENDING').length,
      claimGapRate: 0,
    }
  );
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(
    initialFilterOptions ?? { corporations: [], wards: [], agencies: [] }
  );

  // Filters
  const [corpFilter, setCorpFilter] = useState('ALL');
  const [wardFilter, setWardFilter] = useState('ALL');
  const [agencyFilter, setAgencyFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedRecord, setSelectedRecord] = useState<ClaimIssueItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [personnels, setPersonnels] = useState<PersonnelOption[]>([]);

  const [reviewMode, setReviewMode] = useState<'reopen' | 'reassign' | 'inspector' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Reassign Work Order state
  const [reassignAgencyId, setReassignAgencyId] = useState('');
  const [reassignAgencySearch, setReassignAgencySearch] = useState('');
  const [reassignPersonnelId, setReassignPersonnelId] = useState('');
  const [reassignPersonnelSearch, setReassignPersonnelSearch] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignOtherReason, setReassignOtherReason] = useState('');
  const [reassignNotes, setReassignNotes] = useState('');
  const [reassignConfirming, setReassignConfirming] = useState(false);

  // Dispatch Senior Inspector state
  const [inspectorId, setInspectorId] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');

  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const requestSeqRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isStaffView || !selectedRecord) return;
    fetch('/api/personnels?status=ELIGIBLE', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (Array.isArray(list)) {
          setPersonnels(list.filter((p: PersonnelOption) => p.active));
        }
      })
      .catch(() => {});
  }, [isStaffView, selectedRecord]);

  // Keep open detail modal synchronized with refreshed Claim Gap records
  useEffect(() => {
    if (!selectedRecord) return;
    const fresh = records.find((r) => r.id === selectedRecord.id);
    if (fresh) {
      setSelectedRecord(fresh);
    }
  }, [records, selectedRecord?.id]);

  const openRecordDetail = (rec: ClaimIssueItem) => {
    setSelectedRecord(rec);
    setLightboxIndex(null);
    setFailedImages({});
    setReviewMode(null);
    setActionNotice(null);
    setActionNote('');
    setReassignAgencyId(rec.agency?.id || filterOptions.agencies[0]?.id || '');
    setReassignAgencySearch('');
    setReassignPersonnelId('');
    setReassignPersonnelSearch('');
    setReassignReason('');
    setReassignOtherReason('');
    setReassignNotes('');
    setReassignConfirming(false);
    setInspectorId('');
    setInspectorNotes('');
  };

  const fetchClaimGap = useCallback(
    (overrides?: {
      days?: number;
      corp?: string;
      ward?: string;
      agency?: string;
      category?: string;
      search?: string;
    }) => {
      const days = overrides?.days ?? period;
      const corp = overrides?.corp ?? corpFilter;
      const ward = overrides?.ward ?? wardFilter;
      const agency = overrides?.agency ?? agencyFilter;
      const category = overrides?.category ?? categoryFilter;
      const search = overrides?.search ?? searchQuery;

      const seq = ++requestSeqRef.current;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsFetching(true);
      setFetchError(null);

      startTransition(async () => {
        try {
          const params = new URLSearchParams({ days: String(days) });
          if (corp !== 'ALL') params.set('corporationId', corp);
          if (ward !== 'ALL') params.set('wardId', ward);
          if (agency !== 'ALL') params.set('agencyId', agency);
          if (category !== 'ALL') params.set('category', category);
          if (search.trim()) params.set('search', search.trim());

          const res = await fetch(`/api/claim-gap?${params.toString()}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (seq !== requestSeqRef.current) return;

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson?.error?.message || `Failed to load Claim Gap (${res.status})`);
          }

          const data = await res.json();
          if (seq !== requestSeqRef.current) return;

          setByWard(data.byWard || []);
          setByDesk(data.byDesk || []);
          setRecords(data.records || []);
          if (data.summary) setSummary(data.summary);
          if (data.filterOptions) setFilterOptions(data.filterOptions);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (seq !== requestSeqRef.current) return;
          setFetchError(err instanceof Error ? err.message : 'Unable to retrieve Claim Gap records.');
        } finally {
          if (seq === requestSeqRef.current) {
            setIsFetching(false);
          }
        }
      });
    },
    [period, corpFilter, wardFilter, agencyFilter, categoryFilter, searchQuery]
  );

  // Auto-refresh Claim Gap when an issue is claimed, verified, disputed, reassigned, or reopened
  useEffect(() => {
    const unsubscribe = subscribeIssueUpdates(() => {
      fetchClaimGap();
    });
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchClaimGap();
      }
    };
    window.addEventListener('focus', handleVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleVisibility);
    };
  }, [fetchClaimGap]);

  const disputedRecords = records.filter((r) => r.outcome === 'NOT_FIXED');
  const reopenedRecords = records.filter((r) => r.outcome === 'REOPENED');
  const verifiedRecords = records.filter((r) => r.outcome === 'FIXED');
  const pendingRecords = records.filter((r) => r.outcome === 'PENDING');

  const tabRecords =
    activeTab === 'disputed'
      ? disputedRecords
      : activeTab === 'reopened'
        ? reopenedRecords
        : activeTab === 'verified'
          ? verifiedRecords
          : activeTab === 'pending'
            ? pendingRecords
            : records;

  const activeScorecardList = (view === 'ward' ? byWard : byDesk).filter(
    (item) => !(item.id === 'unassigned' && item.claimed === 0)
  );

  const handleReopenWorkOrder = async (issueId: string) => {
    if (!actionNote.trim()) {
      setActionNotice({ ok: false, text: 'Please enter a written reason note before reopening a work order.' });
      return;
    }
    setActionBusy(true);
    setActionNotice(null);
    try {
      const rec = selectedRecord;
      const actionType = rec?.status === 'REJECTED' ? 'REOPEN' : 'SET_STATUS';
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          ...(actionType === 'SET_STATUS' ? { targetStatus: 'REOPENED_IN_WARRANTY' } : {}),
          note: `Reopen Work Order (Penalty): ${actionNote.trim()}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to reopen work order.');
      }
      setActionNotice({ ok: true, text: 'Work order reopened and logged to audit trail.' });
      setActionNote('');
      setReviewMode(null);
      notifyIssueUpdated(issueId);
      fetchClaimGap();
    } catch (err) {
      setActionNotice({ ok: false, text: err instanceof Error ? err.message : 'Unable to reopen work order.' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!selectedRecord) return;
    if (!reassignAgencyId) {
      setActionNotice({ ok: false, text: 'Please select a target agency.' });
      return;
    }
    const effectiveReason = reassignReason === 'Other' ? reassignOtherReason.trim() : reassignReason.trim();
    if (!effectiveReason) {
      setActionNotice({ ok: false, text: 'A mandatory reassignment reason is required.' });
      return;
    }
    setActionBusy(true);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/issues/${selectedRecord.id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId: reassignAgencyId,
          personnelId: reassignPersonnelId || undefined,
          reason: reassignReason,
          otherReason: reassignReason === 'Other' ? reassignOtherReason.trim() : undefined,
          note: reassignNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Work order reassignment failed.');
      }
      setActionNotice({ ok: true, text: 'Work order reassigned and audit trail updated.' });
      setReassignConfirming(false);
      setReviewMode(null);
      notifyIssueUpdated(selectedRecord.id);
      fetchClaimGap();
    } catch (err) {
      setActionNotice({ ok: false, text: err instanceof Error ? err.message : 'Reassignment failed.' });
      setReassignConfirming(false);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDispatchInspector = async () => {
    if (!selectedRecord || !inspectorId) {
      setActionNotice({ ok: false, text: 'Please select an active Senior Inspector.' });
      return;
    }
    setActionBusy(true);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/issues/${selectedRecord.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personnelId: inspectorId,
          note: inspectorNotes.trim()
            ? `Senior Inspector dispatched: ${inspectorNotes.trim()}`
            : 'Senior Inspector dispatched for independent field verification',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to dispatch inspector.');
      }
      setActionNotice({ ok: true, text: 'Senior Inspector dispatched and logged.' });
      setReviewMode(null);
      notifyIssueUpdated(selectedRecord.id);
      fetchClaimGap();
    } catch (err) {
      setActionNotice({ ok: false, text: err instanceof Error ? err.message : 'Failed to dispatch inspector.' });
    } finally {
      setActionBusy(false);
    }
  };

  const overviewCards = [
    { label: 'Total Repair Claims', value: summary.totalClaims, icon: Layers, tone: 'text-[#293732] bg-[#FAF9F5] border-[#DDDCD3]' },
    { label: 'Verified Repairs', value: summary.verified, icon: CheckCircle2, tone: 'text-[#537C60] bg-[#EFF6F1] border-[#CFE4D4]' },
    { label: 'Disputed Repairs', value: summary.disputed, icon: XCircle, tone: 'text-[#B76F60] bg-[#FBF1EF] border-[#EAC8C1]' },
    { label: 'Reopened Issues', value: summary.reopened, icon: RotateCcw, tone: 'text-[#B68B63] bg-[#FDF7F0] border-[#F2DFCA]' },
    { label: 'Awaiting Verification', value: summary.awaitingVerification, icon: FileCheck2, tone: 'text-[#718F9E] bg-[#F0F5F8] border-[#D4E2E9]' },
    {
      label: 'Overall Claim Gap Rate',
      value: summary.totalClaims === 0 ? 'Insufficient Data' : `${summary.claimGapRate}%`,
      icon: AlertTriangle,
      tone: 'text-[#355858] bg-[#E5E9E3] border-[#DDDCD3]',
    },
  ];

  const availableWardsForCorp =
    corpFilter === 'ALL'
      ? filterOptions.wards
      : filterOptions.wards.filter((w) => w.corporationId === corpFilter);

  return (
    <div className="space-y-6">
      {/* Overview Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {overviewCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-2xl p-4 border shadow-xs ${c.tone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[#65736B] leading-tight">{c.label}</span>
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold">{c.value}</div>
            </div>
          );
        })}
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-[#DDDCD3] shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[#929B92] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchClaimGap();
              }}
              placeholder="Search by Issue ID, location, ward, or agency..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl text-[#293732] focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30"
            />
          </div>

          {/* Date Period Pills */}
          <div className="flex items-center gap-1 p-1 bg-[#E9ECE6] rounded-xl border border-[#DDDCD3]">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setPeriod(d);
                  fetchClaimGap({ days: d });
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  period === d
                    ? 'bg-white text-[#293732] shadow-xs'
                    : 'text-[#65736B] hover:text-[#293732]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fetchClaimGap()}
            disabled={isPending || isFetching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending || isFetching ? 'animate-spin' : ''}`} />
            <span>{isFetching ? 'Loading...' : 'Apply'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <select
            value={corpFilter}
            onChange={(e) => {
              const nextCorp = e.target.value;
              setCorpFilter(nextCorp);
              setWardFilter('ALL');
              fetchClaimGap({ corp: nextCorp, ward: 'ALL' });
            }}
            aria-label="Filter by City Corporation"
            className="px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-[#293732]"
          >
            <option value="ALL">All City Corporations</option>
            {filterOptions.corporations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <SearchableWardSelect
            wards={availableWardsForCorp.map((w) => ({
              id: w.id,
              code: w.code,
              name: w.name,
              corporationName:
                filterOptions.corporations.find((c) => c.id === w.corporationId)?.name ?? null,
            }))}
            value={wardFilter}
            onChange={(nextWard) => {
              setWardFilter(nextWard);
              fetchClaimGap({ ward: nextWard });
            }}
            allOptionLabel="All Wards"
            ariaLabel="Filter by Ward"
          />

          <select
            value={agencyFilter}
            onChange={(e) => {
              const nextAgency = e.target.value;
              setAgencyFilter(nextAgency);
              fetchClaimGap({ agency: nextAgency });
            }}
            aria-label="Filter by Agency"
            className="px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-[#293732]"
          >
            <option value="ALL">All Agencies</option>
            {filterOptions.agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              const nextCat = e.target.value;
              setCategoryFilter(nextCat);
              fetchClaimGap({ category: nextCat });
            }}
            aria-label="Filter by Category"
            className="px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-[#293732]"
          >
            <option value="ALL">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* API Error Banner */}
      {fetchError && (
        <div
          role="alert"
          className="bg-[#FBF1EF] border border-[#EAC8C1] text-[#B76F60] rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3"
        >
          <span>{fetchError}</span>
          <button
            type="button"
            onClick={() => fetchClaimGap()}
            className="px-3 py-1 rounded-lg bg-white border border-[#EAC8C1] font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDDCD3] pb-4">
        <div className="bg-[#E9ECE6] p-1 rounded-2xl flex flex-wrap items-center gap-1 shadow-inner border border-[#DDDCD3]">
          {[
            { id: 'disputed' as const, label: `Disputed (${disputedRecords.length})` },
            { id: 'reopened' as const, label: `Reopened (${reopenedRecords.length})` },
            { id: 'verified' as const, label: `Verified (${verifiedRecords.length})` },
            { id: 'pending' as const, label: `Awaiting Verification (${pendingRecords.length})` },
            { id: 'all' as const, label: `All Records (${records.length})` },
            { id: 'scorecard' as const, label: `Ward Scorecard (${activeScorecardList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#FFFFFF] text-[#293732] shadow-[0_2px_6px_rgba(41,55,50,0.08)] border border-[#DDDCD3]'
                  : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'scorecard' && (
          <div className="flex items-center gap-1 p-1 bg-[#E9ECE6] rounded-xl border border-[#DDDCD3]">
            <button
              type="button"
              onClick={() => setView('ward')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                view === 'ward' ? 'bg-white text-[#293732] shadow-xs' : 'text-[#65736B]'
              }`}
            >
              By Ward
            </button>
            <button
              type="button"
              onClick={() => setView('desk')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                view === 'desk' ? 'bg-white text-[#293732] shadow-xs' : 'text-[#65736B]'
              }`}
            >
              By Desk
            </button>
          </div>
        )}
      </div>

      {/* ISSUE-LEVEL LEDGER TABS */}
      {activeTab !== 'scorecard' && (
        <div className="bg-white rounded-2xl border border-[#DDDCD3] shadow-xs overflow-hidden">
          {tabRecords.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Inbox className="w-8 h-8 text-[#929B92] mx-auto" />
              <div className="text-sm font-semibold text-[#293732]">
                No {activeTab === 'all' ? 'repair claim' : activeTab} records in this {period}-day window
              </div>
              <p className="text-xs text-[#65736B]">
                Adjust the date range or filters above to inspect other repair lifecycle records.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF9F5] border-b border-[#DDDCD3] text-[#65736B] font-mono uppercase text-[10px]">
                    <th className="py-3 px-4">Issue</th>
                    <th className="py-3 px-4">Location &amp; Ward</th>
                    <th className="py-3 px-4">Agency / Contractor</th>
                    <th className="py-3 px-4">Claimed</th>
                    <th className="py-3 px-4">Outcome</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDDCD3]/60">
                  {tabRecords.map((rec) => {
                    const badge = outcomeBadge(rec.outcome);
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => openRecordDetail(rec)}
                        className="hover:bg-[#FAF9F5] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-[#355858]">{rec.code}</div>
                          <div className="text-[11px] text-[#65736B]">{rec.category.replace(/_/g, ' ')}</div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-medium text-[#293732] truncate">{rec.location}</div>
                          <div className="text-[11px] text-[#65736B] truncate">
                            {rec.ward
                              ? `Ward ${rec.ward.wardNumber ?? rec.ward.code} · ${rec.ward.name}`
                              : 'Unassigned Ward'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#293732]">
                            {rec.agency?.name || rec.claimActorName}
                          </div>
                          {rec.contractorName && (
                            <div className="text-[11px] text-[#65736B]">{rec.contractorName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#65736B]">
                          {formatDateIST(rec.claimedAt)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-xs font-semibold text-[#527B7A] hover:underline">
                            Review →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* WARD / DESK SCORECARD TAB */}
      {activeTab === 'scorecard' && (
        <div className="bg-white rounded-2xl border border-[#DDDCD3] shadow-xs overflow-hidden">
          {activeScorecardList.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-[#929B92] mx-auto" />
              <div className="text-sm font-semibold text-[#293732]">
                Insufficient Data for Scorecard
              </div>
              <p className="text-xs text-[#65736B]">
                No repair claims recorded matching the selected filters and {period}-day window.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF9F5] border-b border-[#DDDCD3] text-[#65736B] font-mono uppercase text-[10px]">
                    <th className="py-3 px-4">{view === 'ward' ? 'Ward' : 'Agency / Desk'}</th>
                    <th className="py-3 px-4 text-right">Claims Filed</th>
                    <th className="py-3 px-4 text-right">Verified</th>
                    <th className="py-3 px-4 text-right">Disputed</th>
                    <th className="py-3 px-4 text-right">Reopened</th>
                    <th className="py-3 px-4 text-right">Claim Gap Rate</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDDCD3]/60">
                  {activeScorecardList.map((row) => (
                    <tr key={row.id} className="hover:bg-[#FAF9F5]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#293732]">{row.name}</div>
                        {row.code && (
                          <div className="text-[10px] font-mono text-[#65736B]">{row.code}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">{row.claimed}</td>
                      <td className="py-3 px-4 text-right font-mono text-[#537C60]">{row.verified}</td>
                      <td className="py-3 px-4 text-right font-mono text-[#B76F60]">{row.disputed}</td>
                      <td className="py-3 px-4 text-right font-mono text-[#B68B63]">{row.reopened}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {row.claimed > 0 ? `${row.disputedPercentage}%` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.statusLabel === 'High Claim Gap'
                              ? 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]'
                              : row.statusLabel === 'Watch'
                                ? 'bg-[#FDF7F0] text-[#B68B63] border-[#F2DFCA]'
                                : row.statusLabel === 'Compliant'
                                  ? 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]'
                                  : 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]'
                          }`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ISSUE DETAIL & EVIDENCE REVIEW DRAWER */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[1300] flex justify-end bg-[#293732]/30 backdrop-blur-[1px]">
          <div className="w-full max-w-2xl bg-[#F3F2EB] h-full overflow-y-auto shadow-2xl border-l border-[#DDDCD3] p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-[#DDDCD3] pb-4">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase">
                  {selectedRecord.code} · {selectedRecord.category.replace(/_/g, ' ')}
                </div>
                <h2 className="font-display font-bold text-xl text-[#293732] mt-0.5">
                  {selectedRecord.location}
                </h2>
                <p className="text-xs text-[#65736B] mt-1">
                  {selectedRecord.ward
                    ? `Ward ${selectedRecord.ward.wardNumber ?? selectedRecord.ward.code} · ${selectedRecord.ward.name}${selectedRecord.ward.corporationName ? ` (${selectedRecord.ward.corporationName})` : ''}`
                    : 'Unassigned Ward'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-2 rounded-xl bg-white border border-[#DDDCD3] text-[#65736B] hover:text-[#293732] cursor-pointer"
                aria-label="Close detail drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Horizontal Three-Column Evidence Comparison */}
            {(() => {
              const evidenceColumns = [
                {
                  key: 'original',
                  label: 'Original Defect',
                  typeBadge: 'REPORT',
                  statusText: 'Citizen Submitted',
                  url: selectedRecord.originalPhotoUrl,
                  date: selectedRecord.originalDate,
                },
                {
                  key: 'claim',
                  label: 'Agency Repair Claim',
                  typeBadge: 'CLAIM_FIX',
                  statusText: selectedRecord.claimActorName,
                  url: selectedRecord.claimPhotoUrl,
                  date: selectedRecord.claimedAt,
                },
                {
                  key: 'verification',
                  label: 'Citizen Verification',
                  typeBadge: 'AUDIT',
                  statusText: outcomeBadge(selectedRecord.outcome).label,
                  url: selectedRecord.verificationPhotoUrl,
                  date:
                    selectedRecord.verifiedAt ||
                    selectedRecord.disputedAt ||
                    selectedRecord.reopenedAt,
                },
              ];

              const selectedAgencyObj = filterOptions.agencies.find((a) => a.id === reassignAgencyId);
              const selectedPersonnelObj = personnels.find((p) => p.id === reassignPersonnelId);
              const filteredAgencies = filterOptions.agencies.filter((a) => {
                if (!reassignAgencySearch.trim()) return true;
                const q = reassignAgencySearch.toLowerCase();
                return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
              });
              const filteredPersonnels = personnels.filter((p) => {
                if (!reassignPersonnelSearch.trim()) return true;
                const q = reassignPersonnelSearch.toLowerCase();
                return p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q);
              });

              return (
                <>
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#65736B]">
                      Horizontal Evidence Comparison
                    </div>
                    <div className="overflow-x-auto pb-1">
                      <div className="grid grid-cols-3 min-w-[600px] md:min-w-0 gap-3">
                        {evidenceColumns.map((ev, idx) => {
                          const canPreview = Boolean(ev.url && !failedImages[ev.key]);
                          return (
                            <div
                              key={ev.key}
                              className="bg-white rounded-xl p-2.5 border border-[#DDDCD3] flex flex-col justify-between space-y-2"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[11px] font-semibold text-[#293732] truncate">
                                    {ev.label}
                                  </span>
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#E9ECE6] text-[#355858] shrink-0">
                                    {ev.typeBadge}
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#65736B] truncate">{ev.statusText}</div>
                              </div>

                              <button
                                type="button"
                                disabled={!canPreview}
                                onClick={() => canPreview && setLightboxIndex(idx)}
                                className="group relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-[#E9ECE6] border border-[#DDDCD3]/70 flex items-center justify-center cursor-pointer disabled:cursor-default"
                              >
                                {canPreview ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={ev.url!}
                                      alt={ev.label}
                                      onError={() =>
                                        setFailedImages((prev) => ({ ...prev, [ev.key]: true }))
                                      }
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                    <span className="absolute bottom-1.5 right-1.5 p-1 rounded-md bg-white/90 text-[#293732] opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
                                      <ZoomIn className="w-3.5 h-3.5" />
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-[#929B92] px-2 text-center">
                                    {ev.url ? 'Image failed to load' : 'Evidence unavailable'}
                                  </span>
                                )}
                              </button>

                              <div className="text-[10px] font-mono text-[#65736B] truncate">
                                {ev.date ? formatDateTimeIST(ev.date) : 'Timestamp pending'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 2. Metadata & Findings */}
                  <div className="bg-white rounded-2xl p-4 border border-[#DDDCD3] space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-[#E9ECE6]">
                      <span className="text-[#65736B]">Assigned Agency / Desk</span>
                      <span className="font-semibold text-[#293732]">
                        {selectedRecord.agency?.name || selectedRecord.claimActorName}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E9ECE6]">
                      <span className="text-[#65736B]">Responsible Personnel</span>
                      <span className="font-medium text-[#293732]">
                        {selectedRecord.assignedPersonnel || 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E9ECE6]">
                      <span className="text-[#65736B]">Contractor / Tender</span>
                      <span className="font-mono text-[#293732]">
                        {selectedRecord.contractorName || '—'}{' '}
                        {selectedRecord.tenderId ? `(${selectedRecord.tenderId})` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E9ECE6]">
                      <span className="text-[#65736B]">Current Status</span>
                      <span className="font-mono font-semibold text-[#355858]">
                        {selectedRecord.status}
                      </span>
                    </div>
                    {selectedRecord.disputeReason && (
                      <div className="pt-1 text-[#B76F60]">
                        <span className="font-semibold">Citizen Auditor Finding:</span>{' '}
                        {selectedRecord.disputeReason}
                      </div>
                    )}
                    {selectedRecord.reopenReason && (
                      <div className="pt-1 text-[#B68B63]">
                        <span className="font-semibold">Reopen Reason:</span>{' '}
                        {selectedRecord.reopenReason}
                      </div>
                    )}
                  </div>

                  {/* 3. Review & Act (Three Independent Operations) */}
                  {isStaffView && (
                    <div className="bg-white rounded-2xl p-4 border border-[#DDDCD3] space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-[#355858]">
                          Review &amp; Act
                        </div>
                        <Link
                          href={`/issue/${selectedRecord.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#527B7A] hover:underline"
                        >
                          <span>Full Issue Ledger</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReviewMode(reviewMode === 'reopen' ? null : 'reopen');
                            setActionNotice(null);
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#B76F60] hover:bg-[#A05B4D] text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen Work Order</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReviewMode(reviewMode === 'reassign' ? null : 'reassign');
                            setReassignConfirming(false);
                            setActionNotice(null);
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white hover:bg-[#E5E9E3]/60 text-[#355858] border border-[#527B7A] text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-[#527B7A]" />
                          <span>Reassign Work Order</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReviewMode(reviewMode === 'inspector' ? null : 'inspector');
                            setActionNotice(null);
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Dispatch Senior Inspector</span>
                        </button>
                      </div>

                      {actionNotice && (
                        <div
                          className={`text-xs px-3 py-2 rounded-xl border ${
                            actionNotice.ok
                              ? 'bg-[#EFF6F1] border-[#CFE4D4] text-[#537C60]'
                              : 'bg-[#FBF1EF] border-[#EAC8C1] text-[#B76F60]'
                          }`}
                        >
                          {actionNotice.text}
                        </div>
                      )}

                      {/* Action 1: Reopen Work Order (Penalty) */}
                      {reviewMode === 'reopen' && (
                        <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#EAC8C1] space-y-3 text-xs">
                          <div className="font-semibold text-[#B76F60]">
                            Reopen Work Order (Penalty / Warranty)
                          </div>
                          <textarea
                            rows={2}
                            value={actionNote}
                            onChange={(e) => setActionNote(e.target.value)}
                            placeholder="Enter contractual/warranty reopening reason..."
                            className="w-full rounded-xl border border-[#DDDCD3] bg-white px-3 py-2 text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReviewMode(null)}
                              className="px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleReopenWorkOrder(selectedRecord.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-[#B76F60] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {actionBusy ? 'Reopening...' : 'Confirm Reopen'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action 2: Reassign Repair Work Order */}
                      {reviewMode === 'reassign' && (
                        <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#527B7A]/50 space-y-3.5 text-xs">
                          <div className="font-display font-bold text-sm text-[#293732]">
                            Reassign Repair Work Order
                          </div>

                          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-white border border-[#DDDCD3] text-[11px]">
                            <div>
                              <span className="text-[#65736B]">Current Agency:</span>{' '}
                              <span className="font-semibold text-[#293732]">
                                {selectedRecord.agency?.name || 'Unassigned'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#65736B]">Current Personnel:</span>{' '}
                              <span className="font-semibold text-[#293732]">
                                {selectedRecord.assignedPersonnel || 'Unassigned'}
                              </span>
                            </div>
                          </div>

                          {!reassignConfirming ? (
                            <>
                              {/* Searchable Agency */}
                              <div className="space-y-1.5">
                                <label className="font-semibold text-[#293732] block">
                                  New Agency / Contractor *
                                </label>
                                <input
                                  type="text"
                                  value={reassignAgencySearch}
                                  onChange={(e) => setReassignAgencySearch(e.target.value)}
                                  placeholder="Search registered agencies..."
                                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                                />
                                <select
                                  value={reassignAgencyId}
                                  onChange={(e) => setReassignAgencyId(e.target.value)}
                                  aria-label="New Agency"
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                                >
                                  <option value="">-- Select Eligible Agency --</option>
                                  {filteredAgencies.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.code} · {a.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Searchable Responsible Personnel (Optional) */}
                              <div className="space-y-1.5">
                                <label className="font-semibold text-[#293732] block">
                                  Responsible Personnel (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={reassignPersonnelSearch}
                                  onChange={(e) => setReassignPersonnelSearch(e.target.value)}
                                  placeholder="Search active municipal personnel..."
                                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                                />
                                <select
                                  value={reassignPersonnelId}
                                  onChange={(e) => setReassignPersonnelId(e.target.value)}
                                  aria-label="Responsible Personnel"
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                                >
                                  <option value="">-- Agency-level Assignment Only --</option>
                                  {filteredPersonnels.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} — {p.role}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Mandatory Reassignment Reason */}
                              <div className="space-y-1.5">
                                <label className="font-semibold text-[#293732] block">
                                  Reassignment Reason *
                                </label>
                                <select
                                  value={reassignReason}
                                  onChange={(e) => setReassignReason(e.target.value)}
                                  aria-label="Reassignment Reason"
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                                >
                                  <option value="">-- Select Mandatory Reason --</option>
                                  {REASSIGN_REASONS.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                                {reassignReason === 'Other' && (
                                  <input
                                    type="text"
                                    value={reassignOtherReason}
                                    onChange={(e) => setReassignOtherReason(e.target.value)}
                                    placeholder="Specify reassignment reason..."
                                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                                  />
                                )}
                              </div>

                              <textarea
                                rows={2}
                                value={reassignNotes}
                                onChange={(e) => setReassignNotes(e.target.value)}
                                placeholder="Additional operational notes (optional)..."
                                className="w-full px-3 py-2 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                              />

                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReviewMode(null)}
                                  className="px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !reassignAgencyId ||
                                    !reassignReason ||
                                    (reassignReason === 'Other' && !reassignOtherReason.trim())
                                  }
                                  onClick={() => setReassignConfirming(true)}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#527B7A] text-white font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Review Reassignment
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="p-3 rounded-xl bg-white border border-[#527B7A] space-y-2">
                              <div className="font-bold text-[#293732]">Reassignment Summary</div>
                              <div>
                                <span className="text-[#65736B]">Issue:</span>{' '}
                                <span className="font-mono font-semibold">{selectedRecord.code}</span>
                              </div>
                              <div>
                                <span className="text-[#65736B]">Previous agency:</span>{' '}
                                {selectedRecord.agency?.name || 'Unassigned'}
                              </div>
                              <div>
                                <span className="text-[#65736B]">New agency:</span>{' '}
                                <span className="font-semibold text-[#355858]">
                                  {selectedAgencyObj?.name || '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#65736B]">Responsible personnel:</span>{' '}
                                {selectedPersonnelObj
                                  ? `${selectedPersonnelObj.name} (${selectedPersonnelObj.role})`
                                  : 'Agency-level only'}
                              </div>
                              <div>
                                <span className="text-[#65736B]">Reason:</span>{' '}
                                {reassignReason === 'Other' ? reassignOtherReason : reassignReason}
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => setReassignConfirming(false)}
                                  className="px-3 py-1.5 rounded-lg bg-[#F3F2EB] border border-[#DDDCD3] cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleConfirmReassign()}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#355858] text-white font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  {actionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  <span>Confirm Reassignment</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action 3: Dispatch Senior Inspector */}
                      {reviewMode === 'inspector' && (
                        <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#355858]/40 space-y-3 text-xs">
                          <div className="font-semibold text-[#355858]">
                            Dispatch Senior Inspector
                          </div>
                          <select
                            value={inspectorId}
                            onChange={(e) => setInspectorId(e.target.value)}
                            aria-label="Select Senior Inspector"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#DDDCD3] text-xs"
                          >
                            <option value="">-- Select Active Inspector --</option>
                            {personnels.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} — {p.role}
                              </option>
                            ))}
                          </select>
                          <textarea
                            rows={2}
                            value={inspectorNotes}
                            onChange={(e) => setInspectorNotes(e.target.value)}
                            placeholder="Inspection instructions..."
                            className="w-full rounded-xl border border-[#DDDCD3] bg-white px-3 py-2 text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReviewMode(null)}
                              className="px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy || !inspectorId}
                              onClick={() => void handleDispatchInspector()}
                              className="px-3.5 py-1.5 rounded-lg bg-[#355858] text-white font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {actionBusy ? 'Dispatching...' : 'Confirm Dispatch'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Audit Trail Timeline */}
                  <div className="bg-white rounded-2xl p-4 border border-[#DDDCD3] space-y-2.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#65736B]">
                      Audit Trail Timeline
                    </div>
                    <div className="space-y-2">
                      {selectedRecord.timeline.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-start justify-between gap-2 text-xs border-b border-[#E9ECE6] pb-2 last:border-0"
                        >
                          <div>
                            <div className="font-semibold text-[#293732]">
                              {t.action.replace(/_/g, ' ')}
                              {t.toStatus ? ` → ${t.toStatus}` : ''}
                            </div>
                            {t.note && <div className="text-[11px] text-[#65736B]">{t.note}</div>}
                          </div>
                          <span className="text-[10px] font-mono text-[#65736B] shrink-0">
                            {formatDateTimeIST(t.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Evidence Lightbox Modal */}
                  {lightboxIndex !== null && evidenceColumns[lightboxIndex]?.url && (
                    <div
                      className="fixed inset-0 z-[1400] bg-[#293732]/85 flex items-center justify-center p-4"
                      onClick={() => setLightboxIndex(null)}
                    >
                      <div
                        className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden border border-[#DDDCD3] shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDDCD3] bg-[#FAF9F5]">
                          <div>
                            <div className="text-xs font-semibold text-[#293732]">
                              {evidenceColumns[lightboxIndex].label} ({evidenceColumns[lightboxIndex].typeBadge})
                            </div>
                            <div className="text-[11px] font-mono text-[#65736B]">
                              {evidenceColumns[lightboxIndex].date
                                ? formatDateTimeIST(evidenceColumns[lightboxIndex].date)
                                : 'Timestamp pending'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(null)}
                            aria-label="Close evidence preview"
                            className="p-1.5 rounded-lg bg-white border border-[#DDDCD3] text-[#65736B] hover:text-[#293732] cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="bg-[#E9ECE6] flex items-center justify-center max-h-[70vh] overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={evidenceColumns[lightboxIndex].url!}
                            alt={evidenceColumns[lightboxIndex].label}
                            className="max-h-[70vh] w-auto object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAF9F5] border-t border-[#DDDCD3] text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxIndex((prev) =>
                                prev === null ? null : (prev + 2) % 3
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>Previous</span>
                          </button>
                          <span className="font-mono text-[#65736B]">
                            {lightboxIndex + 1} / 3
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxIndex((prev) =>
                                prev === null ? null : (prev + 1) % 3
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] cursor-pointer"
                          >
                            <span>Next</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

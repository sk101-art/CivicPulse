'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getInitials } from '@/lib/format/avatar';
import { formatDateIST } from '@/lib/time/ist';
import { TIER_THRESHOLDS, nextTierProgress } from '@/lib/citizen/statsPure';
import { MAP_STATUS_META } from '@/lib/map/statusPresentation';
import {
  Home,
  ChevronRight,
  Award,
  Edit3,
  FileText,
  ShieldCheck,
  X,
  Check,
  Settings,
  Search,
  Loader2,
  AlertTriangle,
  Inbox,
  ArrowRight,
  Trophy,
} from 'lucide-react';

export interface ProfileReportItem {
  id: string;
  issueId: string;
  category: string;
  title: string;
  location: string;
  status: string;
  createdAt: string;
  createdAtLabel: string;
}

export interface CitizenProfileViewProps {
  initialTab?: 'reports' | 'leaderboard';
  user: {
    name: string | null;
    email: string | null;
    createdAt?: Date | string | null;
  };
  profile: {
    reputation: number;
    tier: string;
    reportsFiled: number | null;
    verifiedFixedCount: number | null;
    verificationsCount: number | null;
  };
  initialReports: ProfileReportItem[];
  initialTotalReports: number;
  leaderboard: Array<{
    rank: number;
    name: string;
    tier: string;
    reputation: number;
    isUser: boolean;
  }>;
  myRank: number | null;
  dataUnavailable?: boolean;
}

const TIER_LABELS: Record<string, string> = {
  CITIZEN: 'Civic Member',
  CONTRIBUTOR: 'Civic Contributor',
  GUARDIAN: 'Civic Guardian',
  AMBASSADOR: 'Civic Ambassador',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'CLAIMED_FIXED', label: 'Repair Claimed — Awaiting Verification' },
  { value: 'VERIFIED_FIXED', label: 'Verified Fixed' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'REOPENED_IN_WARRANTY', label: 'Reopened' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

function getReportStatusBadge(status: string) {
  if (status === 'REJECTED') {
    return {
      label: 'Rejected',
      badgeBg: '#FBF1EF',
      badgeText: '#B76F60',
      badgeBorder: '#EAC8C1',
    };
  }
  const meta = MAP_STATUS_META[status];
  if (meta) {
    return {
      label: meta.label,
      badgeBg: meta.badgeBg,
      badgeText: meta.badgeText,
      badgeBorder: meta.badgeBorder,
    };
  }
  return {
    label: status.replace(/_/g, ' '),
    badgeBg: '#F3F4F1',
    badgeText: '#65736B',
    badgeBorder: '#DDDCD3',
  };
}

export function CitizenProfileView({
  user,
  profile,
  initialReports,
  initialTotalReports,
  leaderboard,
  myRank,
  dataUnavailable = false,
  initialTab = 'reports',
}: CitizenProfileViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'reports' | 'leaderboard'>(initialTab);

  // Identity & Edit Profile state
  const [savedName, setSavedName] = useState<string>(user.name?.trim() || '');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draftName, setDraftName] = useState<string>(user.name?.trim() || '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Report History pagination, search & filter state
  const [reports, setReports] = useState<ProfileReportItem[]>(initialReports);
  const [totalReports, setTotalReports] = useState<number | null>(initialTotalReports);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(initialReports.length < (initialTotalReports ?? 0));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loadingReports, setLoadingReports] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const didMountFilterRef = useRef(false);

  const effectiveDisplayName =
    savedName || user.email?.split('@')[0] || 'Citizen';
  const memberSinceLabel = user.createdAt
    ? formatDateIST(user.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  // Real tier & progression from statsPure.ts (matching CivicContributionCard)
  const actualPoints = Math.max(0, Math.floor(profile.reputation ?? 0));
  const progress = nextTierProgress(actualPoints);
  const resolvedTier =
    profile.tier && TIER_LABELS[profile.tier] ? profile.tier : progress.tier;
  const displayTier = TIER_LABELS[resolvedTier] || 'Civic Member';
  const currentThreshold =
    TIER_THRESHOLDS.find((t) => t.tier === progress.tier)?.min ?? 0;
  const nextThreshold = progress.next
    ? TIER_THRESHOLDS.find((t) => t.tier === progress.next)?.min ?? null
    : null;
  const nextTierLabel = progress.next ? TIER_LABELS[progress.next] : null;

  const fetchReports = useCallback(
    async (opts: { targetPage: number; append: boolean; q: string; status: string }) => {
      if (opts.append) {
        setLoadingMore(true);
      } else {
        setLoadingReports(true);
      }
      setReportsError(null);

      try {
        const params = new URLSearchParams();
        params.set('page', String(opts.targetPage));
        params.set('limit', '15');
        if (opts.q.trim()) params.set('q', opts.q.trim());
        if (opts.status !== 'ALL') params.set('status', opts.status);

        const res = await fetch(`/api/citizen/reports?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || 'Failed to load report history.');
        }

        const data = await res.json();
        const items: ProfileReportItem[] = data.items || [];
        setReports((prev) => (opts.append ? [...prev, ...items] : items));
        setTotalReports(data.total ?? items.length);
        setPage(opts.targetPage);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        setReportsError(
          err instanceof Error ? err.message : 'Unable to load report history.'
        );
      } finally {
        setLoadingReports(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void fetchReports({
        targetPage: 1,
        append: false,
        q: searchQuery,
        status: statusFilter,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, fetchReports]);

  const handleOpenEditModal = () => {
    setDraftName(savedName || effectiveDisplayName);
    setSaveError(null);
    setEditModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (trimmed.length < 2) {
      setSaveError('Display name must be at least 2 characters.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/citizen/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to update profile.');
      }

      setSavedName(data.user?.name || trimmed);
      setEditModalOpen(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1040px] mx-auto w-full">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-[#65736B] font-medium">
          <Link
            href="/citizen/dashboard"
            className="flex items-center gap-1 hover:text-[#293732] transition-colors"
          >
            <Home className="w-3.5 h-3.5 text-[#527B7A]" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-[#929B92]" />
          <span className="text-[#293732] font-semibold">My Profile</span>
        </div>

        {/* Title */}
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
            My Profile
          </h1>
        </div>

        {/* ── SECTION A: IDENTITY AND STATISTICS ── */}
        <div className="bg-white rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
          {dataUnavailable && <p role="status" className="rounded-xl border border-[#F4E3CB] bg-[#FDF6ED] px-3 py-2 text-xs text-[#8A6846]">Profile statistics could not be loaded. Refresh this page to try again.</p>}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-white shadow-[0_4px_12px_rgba(41,55,50,0.12)] shrink-0 bg-[#D4E3DF] text-[#355858] font-display font-semibold text-2xl flex items-center justify-center select-none">
                {getInitials(effectiveDisplayName, user.email)}
              </div>

              <div className="space-y-0.5 min-w-0">
                <h2
                  data-testid="profile-display-name"
                  className="font-semibold text-lg sm:text-xl text-[#293732] truncate"
                >
                  {effectiveDisplayName}
                </h2>
                {user.email && (
                  <p className="text-xs font-mono text-[#65736B] truncate">
                    {user.email}
                  </p>
                )}
                <p className="text-xs sm:text-sm text-[#65736B]">
                  Citizen • Member since {memberSinceLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="px-4 py-2 rounded-xl bg-white hover:bg-[#F3F2EB] border border-[#DDDCD3] text-xs sm:text-sm font-semibold text-[#293732] shadow-sm flex items-center gap-2 cursor-pointer transition-all active:translate-y-px"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Edit Profile</span>
              </button>

              <Link
                href="/citizen/settings"
                className="px-4 py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-xs sm:text-sm font-semibold text-[#293732] shadow-sm flex items-center gap-2 transition-all"
              >
                <Settings className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Settings</span>
              </Link>
            </div>
          </div>

          {/* 4 Real Statistic Boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-2">
            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div
                data-testid="stat-reports"
                className="font-display font-bold text-2xl sm:text-3xl text-[#293732]"
              >
                {dataUnavailable ? '—' : profile.reportsFiled ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium">Reports</div>
            </div>

            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div
                data-testid="stat-verified-fixed"
                className="font-display font-bold text-2xl sm:text-3xl text-[#537C60]"
              >
                {dataUnavailable ? '—' : profile.verifiedFixedCount ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium">Verified Fixed</div>
            </div>

            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div
                data-testid="stat-verifications"
                className="font-display font-bold text-2xl sm:text-3xl text-[#293732]"
              >
                {dataUnavailable ? '—' : profile.verificationsCount ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium">Verifications</div>
            </div>

            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div
                data-testid="stat-points"
                className="font-display font-bold text-2xl sm:text-3xl text-[#355858]"
              >
                {dataUnavailable ? '—' : actualPoints.toLocaleString()}
              </div>
              <div className="text-xs text-[#65736B] font-medium">
                Contribution Points
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION B: CONTRIBUTION AND VERIFICATION ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Contributor Tier & Real Progress */}
          <div className="lg:col-span-2 bg-white rounded-[24px] p-6 sm:p-7 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858]">
                  <Award className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm sm:text-base text-[#293732]">
                  {dataUnavailable ? 'Contribution data unavailable' : displayTier}
                </h3>
              </div>

              <span className="font-mono text-xs font-semibold text-[#65736B]">
                {dataUnavailable ? '—' : nextThreshold !== null
                  ? `${actualPoints.toLocaleString()} / ${nextThreshold.toLocaleString()} pts`
                  : `${actualPoints.toLocaleString()} pts`}
              </span>
            </div>

            {!dataUnavailable && <div className="h-3 w-full bg-[#E9ECE6] rounded-full overflow-hidden p-0.5 border border-[#DDDCD3] shadow-[inset_0_1px_2px_rgba(41,55,50,0.08)]">
              <div
                className="h-full bg-[#355858] rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${progress.pct}%` }}
              />
            </div>}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#65736B]">
              <span>
                {dataUnavailable ? 'Contribution progress unavailable' : `${displayTier} (${currentThreshold.toLocaleString()} pts)`}
              </span>
              <span className="font-medium text-[#355858]">
                {dataUnavailable ? 'Contribution progress unavailable' : nextTierLabel
                  ? `${progress.pointsToNext.toLocaleString()} pts to ${nextTierLabel}`
                  : 'Highest contributor tier reached'}
              </span>
              {nextTierLabel && nextThreshold !== null && (
                <span>
                  {nextTierLabel} ({nextThreshold.toLocaleString()} pts)
                </span>
              )}
            </div>
          </div>

          {/* Compact Verification Activity Summary */}
          <div className="bg-white rounded-[24px] p-6 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858] shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="font-semibold text-sm text-[#293732]">
                  Verification Activity
                </h3>
                <p className="text-xs text-[#65736B]">
                {dataUnavailable ? '—' : profile.verificationsCount ?? '—'}{' '}
                  {profile.verificationsCount === 1
                    ? 'repair verification submitted'
                    : 'repair verifications submitted'}
                </p>
              </div>
            </div>

            <Link
              href="/citizen/audit"
              className="inline-flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-xs font-semibold text-[#355858] transition-colors"
            >
              <span>View in Repair Verification</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── SECTION C: ACTIVITY TABS (2 TABS ONLY) ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-[#65736B] border border-[#DDDCD3]'
              }`}
            >
              Report History ({dataUnavailable ? '—' : totalReports ?? '—'})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-[#65736B] border border-[#DDDCD3]'
              }`}
            >
              Leaderboard
            </button>
          </div>

          {/* Tab 1: Complete Paginated Report History */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {/* Search and Status Filter Bar */}
              <div className="bg-white rounded-2xl p-4 border border-[#DDDCD3] flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#65736B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search reports by location, category, or issue ID..."
                    aria-label="Search report history"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs sm:text-sm text-[#293732] focus:bg-white focus:border-[#527B7A] outline-none"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter reports by status"
                  className="px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs sm:text-sm text-[#293732] focus:bg-white focus:border-[#527B7A] outline-none"
                >
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {loadingReports ? (
                <div className="bg-white rounded-2xl p-10 border border-[#DDDCD3] flex flex-col items-center justify-center gap-2 text-xs sm:text-sm text-[#65736B]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#527B7A]" />
                  <span>Loading report history...</span>
                </div>
              ) : reportsError ? (
                <div className="bg-[#FBF1EF] rounded-2xl p-5 border border-[#EAC8C1] flex items-center justify-between gap-3 text-xs sm:text-sm text-[#B76F60]">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{reportsError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void fetchReports({
                        targetPage: 1,
                        append: false,
                        q: searchQuery,
                        status: statusFilter,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#EAC8C1] text-xs font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : reports.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 border border-[#DDDCD3] text-center space-y-2">
                  <Inbox className="w-8 h-8 text-[#929B92] mx-auto" />
                  <p className="text-sm font-semibold text-[#293732]">
                    {searchQuery.trim() || statusFilter !== 'ALL'
                      ? 'No reports match your search or filter'
                      : 'No reports submitted yet'}
                  </p>
                  <p className="text-xs text-[#65736B] max-w-md mx-auto">
                    {searchQuery.trim() || statusFilter !== 'ALL'
                      ? 'Try clearing your search query or selecting All Statuses.'
                      : 'When you report or confirm a civic issue, your full history will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => {
                    const badge = getReportStatusBadge(report.status);
                    return (
                      <Link
                        key={report.issueId}
                        href={`/issue/${report.issueId}`}
                        className="bg-white rounded-[22px] p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03)] hover:border-[#527B7A] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858] shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>

                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E5E9E3] text-[#355858] font-semibold">
                                {report.category.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[11px] font-mono text-[#929B92]">
                                #{report.issueId.slice(0, 8)}
                              </span>
                            </div>
                            <h4 className="font-semibold text-xs sm:text-sm text-[#293732] truncate">
                              {report.title}
                            </h4>
                            <p className="text-xs text-[#65736B] truncate">
                              {report.location}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                          <span
                            style={{
                              backgroundColor: badge.badgeBg,
                              color: badge.badgeText,
                              borderColor: badge.badgeBorder,
                            }}
                            className="px-3 py-1 rounded-full text-xs font-semibold border"
                          >
                            {badge.label}
                          </span>
                          <span className="text-xs font-mono text-[#929B92]">
                            {report.createdAtLabel}
                          </span>
                        </div>
                      </Link>
                    );
                  })}

                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() =>
                          void fetchReports({
                            targetPage: page + 1,
                            append: true,
                            q: searchQuery,
                            status: statusFilter,
                          })
                        }
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-[#FAF9F5] border border-[#DDDCD3] text-xs font-semibold text-[#293732] cursor-pointer disabled:opacity-50"
                      >
                        {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Load More Reports</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Real City-Wide Leaderboard */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-3">
              {!dataUnavailable && myRank !== null && (
                <div className="bg-[#EAF2F0] rounded-2xl px-4 py-3 border border-[#D0E2DF] flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2 font-semibold text-[#293732]">
                    <Trophy className="w-4 h-4 text-[#355858]" />
                    <span>Your city-wide rank</span>
                  </div>
                  <span className="font-mono font-bold text-[#355858]">
                    #{myRank} • {actualPoints.toLocaleString()} pts
                  </span>
                </div>
              )}

              {leaderboard.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 border border-[#DDDCD3] text-center space-y-2">
                  <Trophy className="w-8 h-8 text-[#929B92] mx-auto" />
                  <p className="text-sm font-semibold text-[#293732]">
                    No leaderboard rankings yet
                  </p>
                  <p className="text-xs text-[#65736B]">
                    Citizens appear on the city-wide leaderboard as they earn contribution points.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {leaderboard.map((item) => (
                    <div
                      key={`${item.rank}-${item.name}`}
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                        item.isUser
                          ? 'bg-[#EAF2F0]/80 border-[#527B7A] shadow-sm'
                          : 'bg-white border-[#DDDCD3]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            item.rank === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : item.rank === 2
                              ? 'bg-slate-100 text-slate-700 border border-slate-300'
                              : item.rank === 3
                              ? 'bg-[#355858] text-white shadow-sm'
                              : 'bg-[#F3F2EB] text-[#65736B]'
                          }`}
                        >
                          {item.rank}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-[#293732] truncate">
                              {item.name}
                            </span>
                            {item.isUser && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#355858] text-white">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#65736B]">
                            {TIER_LABELS[item.tier] || item.tier}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-display font-bold text-sm sm:text-base text-[#355858]">
                          {item.reputation.toLocaleString()}
                        </span>
                        <span className="text-xs text-[#65736B] ml-1">pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT PROFILE MODAL ── */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#293732]/60 backdrop-blur-sm p-4 flex flex-col justify-center items-center overflow-y-auto">
          <form
            onSubmit={handleSaveProfile}
            className="w-full max-w-md bg-white border border-[#DDDCD3] rounded-[26px] p-6 sm:p-7 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <h3 className="font-display font-semibold text-base sm:text-lg text-[#293732]">
                Edit Profile
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                disabled={isSaving}
                aria-label="Close edit profile"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#65736B] hover:text-[#293732] hover:bg-[#F3F2EB] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="profile-display-name-input"
                  className="text-xs font-semibold text-[#293732] block mb-1.5"
                >
                  Display Name
                </label>
                <input
                  id="profile-display-name-input"
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={80}
                  required
                  className="w-full px-4 py-2.5 bg-[#F6F7F4] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all shadow-[inset_0_2px_4px_rgba(41,55,50,0.04)]"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-email-input"
                  className="text-xs font-semibold text-[#293732] block mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="profile-email-input"
                  type="email"
                  disabled
                  value={user.email ?? ''}
                  placeholder="No email address on file"
                  className="w-full px-4 py-2.5 bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl text-sm text-[#65736B] cursor-not-allowed"
                />
                <p className="text-[11px] text-[#929B92] mt-1">
                  Email is locked to your authenticated municipal identity.
                </p>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-[#FBF1EF] border border-[#EAC8C1] text-xs text-[#B76F60]">
                  {saveError}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-3 rounded-xl bg-[#355858] hover:bg-[#3E6966] text-white font-semibold text-sm shadow-[0_4px_12px_rgba(53,88,88,0.25)] flex items-center justify-center gap-2 cursor-pointer transition-all active:translate-y-px disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default CitizenProfileView;

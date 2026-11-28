'use client';

import React, { useState } from 'react';
import { Status, Category } from '@prisma/client';
import Link from 'next/link';
import {
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Inbox,
  Plus,
  Loader2,
  AlertCircle,
  ImageOff,
} from 'lucide-react';
import { useReports } from '@/hooks/useReports';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { formatDateTimeIST } from '@/lib/time/ist';

// Evidence URLs come from runtime uploads whose storage host is configured per environment.
/* eslint-disable @next/next/no-img-element */

export interface HomeReportItem {
  id: string;
  issueId?: string;
  title: string;
  category: Category | string;
  status: Status | string;
  createdAt: Date | string;
  address: string | null;
  priorityScore: number;
  voteCount?: number;
  commentCount?: number;
  latitude: number;
  longitude: number;
  isSeed?: boolean;
  photoUrl?: string | null;
}

interface ActiveReportsProps {
  initialReports: HomeReportItem[];
  eligibleAuditCount?: number;
  isAuditEligible?: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case Status.IN_PROGRESS:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF2F0] text-[#527B7A] border border-[#D0E2DF]">
          In Progress
        </span>
      );
    case Status.ASSIGNED:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F0F2EE] text-[#65736B] border border-[#DDDCD3]">
          Assigned
        </span>
      );
    case Status.CLAIMED_FIXED:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF2F0] text-[#527B7A] border border-[#D0E2DF]">
          Repair Claimed
        </span>
      );
    case Status.VERIFIED_FIXED:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
          Verified Fixed
        </span>
      );
    case Status.REOPENED_IN_WARRANTY:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDF6ED] text-[#B68B63] border border-[#F4E3CB]">
          Reopened
        </span>
      );
    case Status.DISPUTED:
    case Status.REJECTED:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBF1EF] text-[#B76F60] border border-[#EAC8C1]">
          {status === Status.DISPUTED ? 'Disputed' : 'Rejected'}
        </span>
      );
    default:
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F4F6F2] text-[#65736B] border border-[#DDDCD3]">
          Under Review
        </span>
      );
  }
}

export function ActiveReports({
  initialReports,
  eligibleAuditCount = 0,
  isAuditEligible = true,
}: ActiveReportsProps) {
  const { isOnline, pendingCount, syncReports } = useOfflineSync();
  const { reports, error: reportsError } = useReports({
    endpoint: '/api/reports?mine=true',
    initialData: initialReports,
    autoRefresh: 30000,
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSyncNow = async () => {
    if (!isOnline) {
      setSyncError('You are currently offline. Connect to the internet to sync.');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncReports();
    } catch {
      setSyncError('Failed to synchronize queued reports. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const displayMyReports = (reports.length > 0 ? reports : initialReports).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Conditional Offline Sync Banner */}
      {pendingCount > 0 && (
        <div
          data-testid="offline-sync-banner"
          className="p-3.5 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] text-[#B68B63] text-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#B68B63] animate-pulse shrink-0" />
              <span>
                {pendingCount} offline report{pendingCount > 1 ? 's' : ''} queued locally
              </span>
            </div>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-3 py-1 rounded-lg bg-white border border-[#DDDCD3] text-[#293732] font-semibold text-xs shadow-sm hover:bg-[#FAF9F5] disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {isSyncing && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
          {syncError && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#B76F60]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{syncError}</span>
            </div>
          )}
        </div>
      )}

      {/* Primary Card: My Recent Reports */}
      <div
        data-testid="my-recent-reports-card"
        className="bg-white rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-4"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#DDDCD3]/60 pb-3">
          <div>
            <h2 className="font-display font-semibold text-lg text-[#293732] tracking-tight">
              My Recent Reports
            </h2>
            <p className="text-xs text-[#65736B]">
              Latest infrastructure issues submitted from your account.
            </p>
          </div>

          <Link
            href="/citizen/profile"
            className="text-xs font-semibold text-[#527B7A] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {reportsError && displayMyReports.length === 0 ? (
          <div className="p-6 text-center bg-[#FBF1EF] rounded-xl border border-[#EAC8C1] text-xs text-[#B76F60] space-y-1">
            <AlertCircle className="w-5 h-5 mx-auto" />
            <div>Unable to refresh your recent reports right now.</div>
          </div>
        ) : displayMyReports.length === 0 ? (
          <div
            data-testid="my-reports-empty"
            className="p-8 text-center bg-[#F6F7F4] rounded-xl border border-dashed border-[#DDDCD3] text-xs text-[#65736B] space-y-3"
          >
            <Inbox className="w-6 h-6 text-[#929B92] mx-auto" />
            <div className="space-y-1">
              <div className="font-semibold text-[#293732]">No reports submitted yet</div>
              <p>Report a civic defect in your neighbourhood to track municipal action here.</p>
            </div>
            <Link
              href="/citizen/report"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#355858] text-white font-semibold text-xs hover:bg-[#2E5453] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Report an Issue</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#E9ECE6]">
            {displayMyReports.map((report) => {
              const categoryKey = String(report.category || 'OTHER').toUpperCase();
              const categoryLabel = categoryKey.replace(/_/g, ' ');
              const dateStr = report.createdAt ? formatDateTimeIST(report.createdAt) : '';

              return (
                <Link
                  key={report.id}
                  href={`/citizen/report/${report.id}`}
                  className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4 group hover:bg-[#FAF9F5] -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-13 h-13 rounded-xl overflow-hidden border border-[#DDDCD3] shrink-0 relative bg-[#E9ECE6] flex items-center justify-center">
                      {report.photoUrl ? <><span className="sr-only">Evidence photo attached</span><img src={report.photoUrl} alt="" aria-hidden="true" className="w-full h-full object-cover" /></> : <ImageOff className="w-5 h-5 text-[#929B92]" aria-label="No evidence photo attached" />}
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#527B7A] shrink-0">
                          {categoryLabel}
                        </span>
                      </div>
                      <h4 className="font-semibold text-sm text-[#293732] truncate group-hover:text-[#355858] transition-colors">
                        {report.title}
                      </h4>
                      <div className="text-xs text-[#65736B] truncate">
                        {report.address || 'Location unavailable'}
                        {dateStr ? ` • ${dateStr}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="hidden sm:inline-block">
                      {getStatusBadge(String(report.status))}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#929B92] group-hover:text-[#293732] transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Compact Repair Verification Shortcut */}
      <div
        data-testid="repair-verification-shortcut"
        className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858] shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-semibold text-base text-[#293732] tracking-tight">
                Repair Verification
              </h3>
              <span
                data-testid="eligible-audit-count"
                className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#E5E9E3] text-[#355858] border border-[#C2D7D1]"
              >
                {eligibleAuditCount} eligible
              </span>
            </div>
            <p className="text-xs text-[#65736B] mt-0.5">
              {!isAuditEligible
                ? 'Verification eligibility activates once your account meets audit standing.'
                : eligibleAuditCount > 0
                  ? `${eligibleAuditCount} claimed municipal repair${eligibleAuditCount === 1 ? ' is' : 's are'} ready for your independent ground check.`
                  : 'No claimed repairs currently queued for your verification.'}
            </p>
          </div>
        </div>

        <Link
          href="/citizen/audit"
          className="px-3.5 py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0 cursor-pointer"
        >
          <span>Open Verification</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#527B7A]" />
        </Link>
      </div>
    </div>
  );
}

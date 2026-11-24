'use client';

import React, { useState } from 'react';
import { Status, Category } from '@prisma/client';
import Link from 'next/link';
import { ChevronRight, Clock, MapPin, ArrowRight, ShieldCheck, Inbox } from 'lucide-react';
import { useReports } from '@/hooks/useReports';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { formatDateIST } from '@/lib/time/ist';
import { useGeoContext } from '@/context/GeoContext';

interface ReportItem {
  id: string;
  issueId?: string;
  title: string;
  category: Category | string;
  status: Status | string;
  createdAt: Date;
  address: string | null;
  priorityScore: number;
  voteCount: number;
  commentCount: number;
  latitude: number;
  longitude: number;
  isSeed?: boolean;
}

interface ActiveReportsProps {
  initialReports: ReportItem[];
}

const categoryPlaceholders: Record<string, string> = {
  POTHOLES: '/images/evidence-pothole-clean.jpg',
  DRAINAGE: '/images/evidence-drainage-clean.jpg',
  WATERLOGGING: '/images/evidence-drainage-clean.jpg',
  STREETLIGHTS: '/images/evidence-streetlight-clean.jpg',
  SIDEWALKS: '/images/placeholders/demo-evidence-sidewalks.jpg',
  FOOTPATH: '/images/placeholders/demo-evidence-sidewalks.jpg',
  TRAFFIC_SIGNS: '/images/placeholders/demo-evidence-traffic_signs.jpg',
  ROAD_CUT: '/images/placeholders/demo-evidence-road_cut.jpg',
  TREE_FALL: '/images/placeholders/demo-evidence-other.jpg',
  GRAFFITI: '/images/placeholders/demo-evidence-graffiti.jpg',
  TRASH: '/images/placeholders/demo-evidence-trash.jpg',
  OTHER: '/images/placeholders/demo-evidence-other.jpg',
};

function getPriorityBadge(score: number) {
  if (score >= 0.7) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBF1EF] text-[#B76F60] border border-[#EAC8C1]">
        High
      </span>
    );
  }
  if (score >= 0.4) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDF6ED] text-[#B68B63] border border-[#F4E3CB]">
        Medium
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F0F2EE] text-[#65736B] border border-[#DDDCD3]">
      Low
    </span>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'IN_PROGRESS':
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF2F0] text-[#527B7A] border border-[#D0E2DF]">
          In Progress
        </span>
      );
    case 'ASSIGNED':
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F0F2EE] text-[#65736B] border border-[#DDDCD3]">
          Assigned
        </span>
      );
    case 'CLAIMED_FIXED':
    case 'VERIFIED_FIXED':
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
          Resolved
        </span>
      );
    case 'DISPUTED':
    case 'REJECTED':
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBF1EF] text-[#B76F60] border border-[#EAC8C1]">
          {status === 'DISPUTED' ? 'Disputed' : 'Rejected'}
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

export function ActiveReports({ initialReports }: ActiveReportsProps) {
  const { currentWard, wardData } = useGeoContext();
  const { pendingCount, syncReports } = useOfflineSync();
  const { reports } = useReports({
    endpoint: '/api/reports?mine=true',
    initialData: initialReports,
    autoRefresh: 30000,
  });

  const [activeTab, setActiveTab] = useState<'my_reports' | 'ward_community'>('ward_community');

  // Citizen personal reports
  const displayMyReports = reports.length > 0 ? reports.slice(0, 4) : initialReports.slice(0, 4);

  // Ward community issues
  const displayWardIssues = wardData.issues.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Offline Sync Banner if any */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] text-[#B68B63] text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#B68B63] animate-pulse" />
            <span>{pendingCount} offline report{pendingCount > 1 ? 's' : ''} queued locally</span>
          </div>
          <button
            onClick={() => syncReports()}
            className="px-3 py-1 rounded-lg bg-white border border-[#DDDCD3] text-[#293732] font-semibold text-xs shadow-sm hover:bg-[#FAF9F5]"
          >
            Sync Now
          </button>
        </div>
      )}

      {/* Main Issues Card with Ward vs Personal Tabs */}
      <div className="bg-white rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-4">
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD3]/60 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('ward_community')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'ward_community'
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'text-[#65736B] hover:text-[#293732] hover:bg-[#FAF9F5]'
              }`}
            >
              {currentWard?.wardLabel || 'Ward'} Community Issues ({wardData.issues.length})
            </button>

            <button
              onClick={() => setActiveTab('my_reports')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'my_reports'
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'text-[#65736B] hover:text-[#293732] hover:bg-[#FAF9F5]'
              }`}
            >
              My Reports ({displayMyReports.length})
            </button>
          </div>

          <Link
            href={activeTab === 'ward_community' ? '/citizen/map' : '/citizen/profile'}
            className="text-xs font-semibold text-[#527B7A] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>{activeTab === 'ward_community' ? 'View Ward Map' : 'View History'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Tab 1: Ward Community Issues */}
        {activeTab === 'ward_community' && (
          <div>
            {wardData.isLoading ? (
              <div className="p-8 text-center text-xs text-[#65736B]">
                Loading issues for {currentWard?.fullName || 'selected ward'}...
              </div>
            ) : displayWardIssues.length === 0 ? (
              <div className="p-8 text-center bg-[#F6F7F4] rounded-xl border border-dashed border-[#DDDCD3] text-xs text-[#65736B] space-y-1">
                <Inbox className="w-6 h-6 text-[#929B92] mx-auto mb-1" />
                <div className="font-semibold text-[#293732]">No active issues in {currentWard?.wardLabel || 'this ward'}</div>
                <div>This geographical area is currently clear of reported defects.</div>
              </div>
            ) : (
              <div className="divide-y divide-[#E9ECE6]">
                {displayWardIssues.map((issue) => {
                  const imageSrc = categoryPlaceholders[issue.category.toUpperCase()] || '/images/pothole-clean-evidence.jpg';
                  return (
                    <Link
                      key={issue.id}
                      href={`/issue/${issue.id}`}
                      className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4 group hover:bg-[#FAF9F5] -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-13 h-13 rounded-xl overflow-hidden border border-[#DDDCD3] shrink-0 relative bg-[#E9ECE6]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageSrc}
                            alt={issue.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <h4 className="font-semibold text-sm text-[#293732] truncate group-hover:text-[#355858] transition-colors">
                            {issue.title}
                          </h4>
                          <div className="text-xs text-[#65736B] truncate flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-[#527B7A] shrink-0" />
                            <span>{issue.location}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline-block">
                          {getStatusBadge(issue.status)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#929B92] group-hover:text-[#293732] transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Personal Reports */}
        {activeTab === 'my_reports' && (
          <div>
            {displayMyReports.length === 0 ? (
              <div className="p-8 text-center bg-[#F6F7F4] rounded-xl border border-dashed border-[#DDDCD3] text-xs text-[#65736B]">
                No personal reports submitted yet. Tap &quot;Report an Issue&quot; above to submit an infrastructure issue.
              </div>
            ) : (
              <div className="divide-y divide-[#E9ECE6]">
                {displayMyReports.map((report) => {
                  const imageSrc = categoryPlaceholders[String(report.category).toUpperCase()] || '/images/placeholders/demo-evidence-other.jpg';
                  const dateStr = formatDateIST(report.createdAt);

                  return (
                    <Link
                      key={report.id}
                      href={`/citizen/report/${report.id}`}
                      className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4 group hover:bg-[#FAF9F5] -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-13 h-13 rounded-xl overflow-hidden border border-[#DDDCD3] shrink-0 relative bg-[#E9ECE6]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageSrc}
                            alt={report.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <h4 className="font-semibold text-sm text-[#293732] truncate group-hover:text-[#355858] transition-colors">
                            {report.title}
                          </h4>
                          <div className="text-xs text-[#65736B] truncate">
                            {report.address || 'Bengaluru'} • {dateStr}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden sm:flex items-center gap-2">
                          {getPriorityBadge(report.priorityScore)}
                          {getStatusBadge(String(report.status))}
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#929B92] group-hover:text-[#293732] transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Repair Verification Tasks Card */}
      <div className="bg-white rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E5E9E3] flex items-center justify-center text-[#527B7A]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base text-[#293732] tracking-tight">
                {currentWard?.wardLabel || 'Ward'} Verification Tasks
              </h3>
              <p className="text-xs text-[#65736B]">
                Independent ground audits to verify claimed municipal fixes.
              </p>
            </div>
          </div>

          <Link
            href="/citizen/audit"
            className="text-xs font-semibold text-[#527B7A] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Open Ledger Audits</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {wardData.audits.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs text-[#65736B] flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[#527B7A] shrink-0" />
            <span>No pending repair audits currently awaiting verification in {currentWard?.wardLabel || 'this ward'}.</span>
          </div>
        ) : (
          <div className="divide-y divide-[#E9ECE6]">
            {wardData.audits.slice(0, 3).map((audit) => (
              <Link
                key={audit.id}
                href="/citizen/audit"
                className="py-2.5 flex items-center justify-between gap-3 hover:bg-[#FAF9F5] rounded-xl px-2 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#293732] truncate">
                    {audit.title}
                  </div>
                  <div className="text-[11px] text-[#65736B] truncate">
                    {audit.location}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF] shrink-0">
                  Inspect Fix
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

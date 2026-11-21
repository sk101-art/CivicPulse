'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Home, 
  ChevronRight, 
  User, 
  MapPin, 
  Award, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  Trophy, 
  FileText, 
  ShieldCheck, 
  ExternalLink,
  X,
  Check
} from 'lucide-react';

export interface CitizenProfileViewProps {
  user: {
    name: string | null;
    email: string | null;
    createdAt?: Date | string;
  };
  profile: {
    reputation: number;
    tier: string;
    reportsFiled?: number;
    verificationsCount?: number;
  };
  reports: Array<{
    id: string;
    category: string;
    title: string;
    location: string;
    status: string;
    statusLabel: string;
    createdAt: string;
  }>;
  verifications: Array<{
    id: string;
    title: string;
    location: string;
    verdict: string;
    verdictLabel: string;
    xpEarned: number;
    submittedAt: string;
  }>;
  leaderboard: Array<{
    rank: number;
    name: string;
    tier: string;
    reputation: number;
    isUser: boolean;
  }>;
}

const DEFAULT_REPORTS = [
  {
    id: 'CP-2025-0184',
    category: 'POTHOLES',
    title: 'Pothole on MG Road',
    location: 'MG Road, Ward 12',
    status: 'VERIFIED_FIXED',
    statusLabel: 'Resolved',
    createdAt: 'Mar 10, 2025',
  },
  {
    id: 'CP-2025-0185',
    category: 'STREETLIGHTS',
    title: 'Streetlight Outage',
    location: 'Lake View St, Ward 8',
    status: 'ASSIGNED',
    statusLabel: 'Assigned',
    createdAt: 'Mar 8, 2025',
  },
  {
    id: 'CP-2025-0186',
    category: 'DRAINAGE',
    title: 'Drainage Blocked',
    location: 'East Park Rd, Ward 12',
    status: 'UNDER_REVIEW',
    statusLabel: 'Under Review',
    createdAt: 'Mar 6, 2025',
  },
];

const DEFAULT_VERIFICATIONS = [
  {
    id: 'VER-01',
    title: 'Pothole Repair Verification',
    location: 'MG Road, Ward 12',
    verdict: 'INTACT',
    verdictLabel: 'Verified Fixed',
    xpEarned: 25,
    submittedAt: 'Mar 10, 2025',
  },
  {
    id: 'VER-02',
    title: 'Streetlight Inspection',
    location: 'Lake View St, Ward 8',
    verdict: 'DAMAGED',
    verdictLabel: 'Disputed (Unfixed)',
    xpEarned: 25,
    submittedAt: 'Mar 8, 2025',
  },
];

const DEFAULT_LEADERBOARD = [
  { rank: 1, name: 'Priya Sharma', tier: 'Level 4 • Ambassador', reputation: 2150, isUser: false },
  { rank: 2, name: 'Vikram Mehta', tier: 'Level 4 • Guardian', reputation: 1840, isUser: false },
  { rank: 3, name: 'Ananya Das', tier: 'Level 3 • Contributor', reputation: 1280, isUser: true },
  { rank: 4, name: 'Rajesh Kumar', tier: 'Level 2 • Citizen', reputation: 940, isUser: false },
  { rank: 5, name: 'Siddharth Rao', tier: 'Level 2 • Citizen', reputation: 810, isUser: false },
];

export function CitizenProfileView({
  user,
  profile,
  reports: propReports,
  verifications: propVerifications,
  leaderboard: propLeaderboard,
}: CitizenProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'reports' | 'verifications' | 'leaderboard'>('reports');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user.name || 'Ananya Das');

  const reports = propReports && propReports.length > 0 ? propReports : DEFAULT_REPORTS;
  const verifications = propVerifications && propVerifications.length > 0 ? propVerifications : DEFAULT_VERIFICATIONS;
  const leaderboard = propLeaderboard && propLeaderboard.length > 0 ? propLeaderboard : DEFAULT_LEADERBOARD;

  const currentPoints = profile.reputation || 1280;
  const nextLevelThreshold = 1500;
  const progressPercent = Math.min(100, Math.round((currentPoints / nextLevelThreshold) * 100));

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1040px] mx-auto w-full">
        
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-[#65736B] font-medium">
          <Link href="/citizen/dashboard" className="flex items-center gap-1 hover:text-[#293732] transition-colors">
            <Home className="w-3.5 h-3.5 text-[#527B7A]" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-[#929B92]" />
          <span className="text-[#293732] font-semibold">My Profile</span>
        </div>

        {/* Editorial Title (Matching Image 1 Row 2 Col 4) */}
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
            My Profile
          </h1>
        </div>

        {/* ── TOP SECTION: USER IDENTITY & 4 STAT BOXES ── */}
        <div className="bg-white rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
          
          {/* Identity Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-white shadow-[0_4px_12px_rgba(41,55,50,0.12)] shrink-0 bg-[#E5E9E3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/avatar-ananya.jpg"
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-0.5">
                <h2 className="font-semibold text-lg sm:text-xl text-[#293732]">
                  {displayName}
                </h2>
                <p className="text-xs sm:text-sm text-[#65736B]">
                  Citizen • Member since Mar 2025
                </p>
              </div>
            </div>

            {/* Edit Profile Action */}
            <div>
              <button
                type="button"
                onClick={() => setEditModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-[#F3F2EB] border border-[#DDDCD3] text-xs sm:text-sm font-semibold text-[#293732] shadow-sm flex items-center gap-2 cursor-pointer transition-all active:translate-y-px"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>

          {/* 4 Raised Stat Boxes in a Row (Matching Mockup) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-2">
            {/* Box 1: Reports Submitted */}
            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div className="font-display font-bold text-2xl sm:text-3xl text-[#293732]">
                {profile.reportsFiled || 24}
              </div>
              <div className="text-xs text-[#65736B] font-medium">
                Reports
              </div>
            </div>

            {/* Box 2: Verifications */}
            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div className="font-display font-bold text-2xl sm:text-3xl text-[#293732]">
                {profile.verificationsCount || 17}
              </div>
              <div className="text-xs text-[#65736B] font-medium">
                Verifications
              </div>
            </div>

            {/* Box 3: Resolved */}
            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div className="font-display font-bold text-2xl sm:text-3xl text-[#293732]">
                9
              </div>
              <div className="text-xs text-[#65736B] font-medium">
                Resolved
              </div>
            </div>

            {/* Box 4: Contribution Points */}
            <div className="bg-[#F9FAF8] rounded-2xl p-4 border border-[#E5E9E3] space-y-1 text-center sm:text-left shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div className="font-display font-bold text-2xl sm:text-3xl text-[#355858]">
                {currentPoints.toLocaleString()}
              </div>
              <div className="text-xs text-[#65736B] font-medium">
                Contribution Points
              </div>
            </div>
          </div>

        </div>

        {/* ── MIDDLE SECTION: CIVIC CONTRIBUTOR LEVEL PROGRESS ── */}
        <div className="bg-white rounded-[24px] p-6 sm:p-7 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858]">
                <Award className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm sm:text-base text-[#293732]">
                Civic Contributor – Level 3
              </h3>
            </div>

            <span className="font-mono text-xs font-semibold text-[#65736B]">
              {currentPoints.toLocaleString()} / {nextLevelThreshold.toLocaleString()} pts
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 w-full bg-[#E9ECE6] rounded-full overflow-hidden p-0.5 border border-[#DDDCD3] shadow-[inset_0_1px_2px_rgba(41,55,50,0.08)]">
            <div
              className="h-full bg-[#355858] rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#65736B]">
            <span>Level 3 (1,000 pts)</span>
            <span className="font-medium text-[#355858]">220 pts to Level 4 Guardian</span>
            <span>Level 4 (1,500 pts)</span>
          </div>
        </div>

        {/* ── BOTTOM SECTION: ACTIVITY TABS ── */}
        <div className="space-y-4">
          
          {/* Tabs Bar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-[#65736B] border border-[#DDDCD3]'
              }`}
            >
              Report History ({reports.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('verifications')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'verifications'
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-[#65736B] border border-[#DDDCD3]'
              }`}
            >
              Verification History ({verifications.length})
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

          {/* Tab 1: Report History List */}
          {activeTab === 'reports' && (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white rounded-[22px] p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03)] flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858] shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <h4 className="font-semibold text-xs sm:text-sm text-[#293732] truncate">
                        {report.title}
                      </h4>
                      <p className="text-xs text-[#65736B] truncate">
                        {report.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
                      {report.statusLabel}
                    </span>
                    <span className="text-xs font-mono text-[#929B92] hidden sm:inline">
                      {report.createdAt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Verification History List */}
          {activeTab === 'verifications' && (
            <div className="space-y-3">
              {verifications.map((ver) => {
                const isFixed = ver.verdict === 'INTACT';
                return (
                  <div
                    key={ver.id}
                    className="bg-white rounded-[22px] p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03)] flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#E9ECE6] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <h4 className="font-semibold text-xs sm:text-sm text-[#293732] truncate">
                          {ver.title}
                        </h4>
                        <p className="text-xs text-[#65736B] truncate">
                          {ver.location} • <span className="font-mono">{ver.submittedAt}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        isFixed
                          ? 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]'
                          : 'bg-[#FBECE8] text-[#B76F60] border-[#F2D2CC]'
                      }`}>
                        {ver.verdictLabel}
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF]">
                        +{ver.xpEarned} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 3: Leaderboard List */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-2.5">
              {leaderboard.map((item) => (
                <div
                  key={item.rank}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                    item.isUser
                      ? 'bg-[#EAF2F0]/80 border-[#527B7A] shadow-sm'
                      : 'bg-white border-[#DDDCD3]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      item.rank === 1
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : item.rank === 2
                        ? 'bg-slate-100 text-slate-700 border border-slate-300'
                        : item.rank === 3
                        ? 'bg-[#355858] text-white shadow-sm'
                        : 'bg-[#F3F2EB] text-[#65736B]'
                    }`}>
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
                        {item.tier}
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

      </div>

      {/* ── EDIT PROFILE MODAL ── */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#293732]/60 backdrop-blur-sm p-4 flex flex-col justify-center items-center overflow-y-auto">
          <div className="w-full max-w-md bg-white border border-[#DDDCD3] rounded-[26px] p-6 sm:p-7 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <h3 className="font-display font-semibold text-base sm:text-lg text-[#293732]">
                Edit Profile
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#65736B] hover:text-[#293732] hover:bg-[#F3F2EB] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#293732] block mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#F6F7F4] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all shadow-[inset_0_2px_4px_rgba(41,55,50,0.04)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#293732] block mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email || 'ananya.das@civicpulse.org'}
                  className="w-full px-4 py-2.5 bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl text-sm text-[#65736B] cursor-not-allowed"
                />
                <p className="text-[11px] text-[#929B92] mt-1">
                  Email is locked to your authenticated municipal identity.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="w-full py-3 rounded-xl bg-[#355858] hover:bg-[#3E6966] text-white font-semibold text-sm shadow-[0_4px_12px_rgba(53,88,88,0.25)] flex items-center justify-center gap-2 cursor-pointer transition-all active:translate-y-px"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default CitizenProfileView;

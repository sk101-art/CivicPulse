'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Crosshair, 
  ShieldCheck, 
  CheckCircle2, 
  Building2, 
  AlertTriangle, 
  FileText, 
  Check, 
  ExternalLink,
  Copy,
  Layers,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export interface ReportDetailViewProps {
  id: string;
  category: string;
  categoryLabel: string;
  location: string;
  coordinates: { lat: number; lng: number };
  reportedAt: string;
  status: string;
  statusLabel: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityLabel: string;
  photoUrl?: string | null;
  reporterName?: string;
  agencyName?: string;
  notes?: string;
  backHref?: string;
}

export function ReportDetailView({
  id = 'CP-2025-0184',
  category = 'POTHOLES',
  categoryLabel = 'Pothole',
  location = 'MG Road, Ward 12',
  coordinates = { lat: 12.9716, lng: 77.5946 },
  reportedAt = 'Mar 10, 2025, 10:24 AM',
  status = 'IN_PROGRESS',
  statusLabel = 'In Progress',
  priority = 'HIGH',
  priorityLabel = 'High Priority',
  photoUrl,
  reporterName = 'Ananya Das',
  agencyName = 'Municipal Depot • Ward 12 Team',
  notes = 'Large pothole causing vehicle slowdown and hazard during evening rainfall.',
  backHref = '/citizen/dashboard',
}: ReportDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'evidence' | 'verifications'>('overview');
  const [copiedHash, setCopiedHash] = useState(false);

  // Safe technical ID formatting
  const formattedId = id.startsWith('CP-') ? id : `CP-2025-${id.slice(-4).padStart(4, '0')}`;

  const copyHash = () => {
    navigator.clipboard.writeText('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const timelineSteps = [
    {
      title: 'Reported',
      timestamp: reportedAt,
      subtitle: `Citizen: ${reporterName} (Digitally signed ECDSA P-256)`,
      status: 'completed',
    },
    {
      title: 'Assigned to Agency',
      timestamp: 'Mar 10, 2:15 PM',
      subtitle: `Origin: ${agencyName}`,
      status: 'completed',
    },
    {
      title: 'Repair Claimed',
      timestamp: 'Mar 12, 11:05 AM',
      subtitle: 'Contractor: Apex Road Infrastructure',
      status: 'completed',
    },
    {
      title: 'Awaiting Verification',
      timestamp: 'In progress',
      subtitle: 'Awaiting community ground-truth confirmation',
      status: 'current',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1040px] mx-auto w-full">
        
        {/* Breadcrumb Navigation (Matching Image 1 Row 3 Col 2: "← Reports / CP-2025-0184") */}
        <div className="flex items-center gap-2 text-xs text-[#65736B] font-medium">
          <Link 
            href={backHref}
            className="inline-flex items-center gap-1.5 hover:text-[#293732] transition-colors group cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#527B7A] group-hover:-translate-x-0.5 transition-transform" />
            <span>Reports</span>
          </Link>
          <span className="text-[#929B92]">/</span>
          <span className="font-mono font-bold text-[#293732]">{formattedId}</span>
        </div>

        {/* ── RECORD HEADER ROW ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-mono font-bold text-2xl sm:text-3xl text-[#293732] tracking-tight">
              {formattedId}
            </h1>
            <p className="text-sm sm:text-base text-[#65736B] flex items-center gap-1.5 font-medium">
              <span>{categoryLabel}</span>
              <span>•</span>
              <span>{location}</span>
            </p>
          </div>

          {/* Right Badges: Status & Priority (Matching Reference) */}
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF] shadow-sm">
              {statusLabel}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FDF2F0] text-[#B76F60] border border-[#F5D6D0] shadow-sm">
              {priorityLabel}
            </span>
          </div>
        </div>

        {/* ── 4 TABS SEGMENTED BAR (Overview / Timeline / Evidence / Verifications) ── */}
        <div className="flex items-center gap-2 pt-1 border-b border-[#DDDCD3] pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-[#355858] text-white shadow-sm'
                : 'bg-white hover:bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]'
            }`}
          >
            Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'bg-[#355858] text-white shadow-sm'
                : 'bg-white hover:bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]'
            }`}
          >
            Timeline
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('evidence')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'evidence'
                ? 'bg-[#355858] text-white shadow-sm'
                : 'bg-white hover:bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]'
            }`}
          >
            Evidence
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('verifications')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'verifications'
                ? 'bg-[#355858] text-white shadow-sm'
                : 'bg-white hover:bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]'
            }`}
          >
            Verifications
          </button>
        </div>

        {/* ── TAB 1: OVERVIEW (MATCHING IMAGE 1 ROW 3 COL 2 EXACTLY) ── */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)]">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Photo Thumbnail & Metadata Card */}
              <div className="md:col-span-5 space-y-4">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[#DDDCD3] bg-[#F6F7F4] shadow-sm relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl || '/images/pothole-clean-evidence.jpg'}
                    alt={categoryLabel}
                    className="w-full h-full object-cover"
                  />
                  {/* Viewfinder reticles */}
                  <div className="absolute inset-3 pointer-events-none">
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/90 rounded-tl" />
                    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/90 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/90 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/90 rounded-br" />
                  </div>
                </div>

                {/* Structured Metadata Box */}
                <div className="p-4 rounded-2xl bg-[#F9FAF8] border border-[#E5E9E3] space-y-2.5 text-xs">
                  <div>
                    <span className="text-[#929B92] block text-[11px]">Location</span>
                    <span className="font-semibold text-[#293732] flex items-center gap-1.5 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
                      <span>{location}</span>
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#E5E9E3]">
                    <span className="text-[#929B92] block text-[11px]">Coordinates</span>
                    <span className="font-mono font-semibold text-[#293732] flex items-center gap-1.5 mt-0.5">
                      <Crosshair className="w-3.5 h-3.5 text-[#527B7A]" />
                      <span>{coordinates.lat.toFixed(4)}° N, {coordinates.lng.toFixed(4)}° E</span>
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#E5E9E3]">
                    <span className="text-[#929B92] block text-[11px]">Reported on</span>
                    <span className="font-semibold text-[#293732] flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-[#527B7A]" />
                      <span>{reportedAt}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Progressive Status & Timeline */}
              <div className="md:col-span-7 space-y-6">
                <div>
                  <h3 className="font-display font-semibold text-base text-[#293732] mb-4">
                    Status & Operational Timeline
                  </h3>

                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#DDDCD3]">
                    {timelineSteps.map((step, idx) => {
                      const isDone = step.status === 'completed';
                      const isCurrent = step.status === 'current';

                      return (
                        <div key={idx} className="relative group">
                          {/* Dot / Icon */}
                          <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                            isDone 
                              ? 'bg-[#537C60] text-white shadow-sm'
                              : isCurrent
                              ? 'bg-[#B68B63] text-white animate-pulse shadow-sm'
                              : 'bg-[#DDDCD3] text-[#65736B]'
                          }`}>
                            {isDone ? (
                              <Check className="w-3 h-3 stroke-[3]" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
                                {step.title}
                              </h4>
                              <span className="font-mono text-[11px] text-[#65736B]">
                                {step.timestamp}
                              </span>
                            </div>
                            <p className="text-xs text-[#65736B]">
                              {step.subtitle}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Defect Notes Inset */}
                {notes && (
                  <div className="p-4 rounded-2xl bg-[#F6F7F4] border border-[#E5E9E3] space-y-1">
                    <span className="text-[11px] font-semibold text-[#65736B] uppercase tracking-wider block">
                      Citizen Notes
                    </span>
                    <p className="text-xs sm:text-sm text-[#293732] italic">
                      &ldquo;{notes}&rdquo;
                    </p>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}

        {/* ── TAB 2: DETAILED TIMELINE ── */}
        {activeTab === 'timeline' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06)] space-y-4">
            <h3 className="font-display font-semibold text-base text-[#293732]">
              Cryptographic Audit Log
            </h3>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-[#F9FAF8] border border-[#E5E9E3] flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-[#293732]">Status Changed to IN_PROGRESS</div>
                  <div className="text-[#65736B]">By Municipal Field Unit #4</div>
                </div>
                <span className="font-mono text-[#929B92]">Mar 10, 2:15 PM</span>
              </div>
              <div className="p-4 rounded-xl bg-[#F9FAF8] border border-[#E5E9E3] flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-[#293732]">Report Ingested into Civic Ledger</div>
                  <div className="text-[#65736B]">Verified with GPS Geofence & Nonce</div>
                </div>
                <span className="font-mono text-[#929B92]">Mar 10, 10:24 AM</span>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: EVIDENCE & CRYPTOGRAPHY ── */}
        {activeTab === 'evidence' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06)] space-y-5">
            <div className="flex items-center gap-2 text-[#355858]">
              <ShieldCheck className="w-5 h-5 text-[#527B7A]" />
              <h3 className="font-display font-semibold text-base sm:text-lg text-[#293732]">
                Evidence Security & Integrity
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-[#F9FAF8] border border-[#E5E9E3] space-y-1">
                <span className="text-[#65736B] block">SHA-256 Photo Hash</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-[#293732] truncate pr-2">
                    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                  </span>
                  <button
                    type="button"
                    onClick={copyHash}
                    className="p-1 hover:bg-white rounded text-[#527B7A] transition-colors cursor-pointer"
                  >
                    {copiedHash ? <Check className="w-4 h-4 text-[#537C60]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F9FAF8] border border-[#E5E9E3] space-y-1">
                <span className="text-[#65736B] block">Digital Signature (ECDSA P-256)</span>
                <span className="font-mono font-semibold text-[#293732] break-all">
                  MEQCIGw6N2b...verified_hardware_key_secp256r1
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4] text-[#537C60] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">GPS Accuracy: ± 3.2m</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4] text-[#537C60] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">Nonce Authenticated</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: COMMUNITY VERIFICATIONS ── */}
        {activeTab === 'verifications' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06)] space-y-4">
            <h3 className="font-display font-semibold text-base text-[#293732]">
              Community Ground-Truth Audits
            </h3>
            <p className="text-xs text-[#65736B]">
              Independent citizen confirmations for this repair report.
            </p>
            <div className="p-4 rounded-xl bg-[#F9FAF8] border border-[#E5E9E3] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#EAF2F0] text-[#355858] font-bold flex items-center justify-center">
                  V1
                </div>
                <div>
                  <div className="font-semibold text-[#293732]">Ground-Truth Verification Pending</div>
                  <div className="text-[#65736B]">Assigned to nearby citizen in Ward 12</div>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDF6ED] text-[#B68B63] border border-[#F5E2CD]">
                In Progress
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default ReportDetailView;

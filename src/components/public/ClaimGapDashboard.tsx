'use client';

import React, { useState, useTransition } from 'react';
import Image from 'next/image';
import { 
  Building2, Users, CheckCircle2, 
  XCircle, Clock, BarChart3, RefreshCw,
  ChevronRight, AlertTriangle, ShieldCheck,
  FileCheck, X, Check
} from 'lucide-react';
import type { ClaimGapGroupStats } from '@/lib/issues/claimGap';

interface ClaimGapDashboardProps {
  initialByWard: ClaimGapGroupStats[];
  initialByDesk: ClaimGapGroupStats[];
  initialPeriod: number;
}

type TabType = 'disputed' | 'reopened' | 'verified' | 'scorecard';

interface DisputeItem {
  id: string;
  code: string;
  location: string;
  category: string;
  originalDate: string;
  originalPhoto: string;
  claimDate: string;
  claimPhoto: string;
  verificationDate: string;
  verificationPhoto: string;
  disputeReason: string;
  status: 'Disputed' | 'Reopened' | 'Verified';
}

const SAMPLE_DISPUTES: DisputeItem[] = [
  {
    id: 'disp-1',
    code: 'CP-2025-0184',
    location: 'MG Road, Ward 12',
    category: 'Pothole',
    originalDate: 'Mar 10, 2025',
    originalPhoto: '/images/pothole-clean-evidence.jpg',
    claimDate: 'Mar 12, 2025',
    claimPhoto: '/images/pothole-clean-evidence.jpg',
    verificationDate: 'Mar 14, 2025',
    verificationPhoto: '/images/pothole-clean-evidence.jpg',
    disputeReason: 'Ground audit indicates surface depression exceeding 45mm and premature bituminous crumbling under traffic load.',
    status: 'Disputed',
  },
  {
    id: 'disp-2',
    code: 'CP-2025-0192',
    location: 'Brigade Road, Ward 12',
    category: 'Sidewalk',
    originalDate: 'Mar 08, 2025',
    originalPhoto: '/images/pothole-clean-evidence.jpg',
    claimDate: 'Mar 11, 2025',
    claimPhoto: '/images/pothole-clean-evidence.jpg',
    verificationDate: 'Mar 13, 2025',
    verificationPhoto: '/images/pothole-clean-evidence.jpg',
    disputeReason: 'Tactile paving pavers loosened and misaligned; edge curbs unsealed.',
    status: 'Disputed',
  },
  {
    id: 'disp-3',
    code: 'CP-2025-0177',
    location: 'East Park Rd, Ward 8',
    category: 'Drainage',
    originalDate: 'Mar 05, 2025',
    originalPhoto: '/images/pothole-clean-evidence.jpg',
    claimDate: 'Mar 09, 2025',
    claimPhoto: '/images/pothole-clean-evidence.jpg',
    verificationDate: 'Mar 11, 2025',
    verificationPhoto: '/images/pothole-clean-evidence.jpg',
    disputeReason: 'Culvert grate replaced but silt was not evacuated, causing immediate ponding.',
    status: 'Disputed',
  },
  {
    id: 'disp-4',
    code: 'CP-2025-0165',
    location: 'Lake View St, Ward 8',
    category: 'Streetlight',
    originalDate: 'Mar 02, 2025',
    originalPhoto: '/images/pothole-clean-evidence.jpg',
    claimDate: 'Mar 06, 2025',
    claimPhoto: '/images/pothole-clean-evidence.jpg',
    verificationDate: 'Mar 08, 2025',
    verificationPhoto: '/images/pothole-clean-evidence.jpg',
    disputeReason: 'Arm fixture wired but ballast fails intermittently during dusk sensor cycle.',
    status: 'Disputed',
  },
];

export function ClaimGapDashboard({
  initialByWard,
  initialByDesk,
  initialPeriod,
}: ClaimGapDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('disputed');
  const [period, setPeriod] = useState<number>(initialPeriod);
  const [view, setView] = useState<'ward' | 'desk'>('ward');
  const [byWard, setByWard] = useState<ClaimGapGroupStats[]>(initialByWard);
  const [byDesk, setByDesk] = useState<ClaimGapGroupStats[]>(initialByDesk);
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (newPeriod: number) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/claim-gap?days=${newPeriod}`);
        if (res.ok) {
          const data = await res.json();
          setByWard(data.byWard);
          setByDesk(data.byDesk);
        }
      } catch (err) {
        console.error('Failed to fetch claim gap', err);
      }
    });
  };

  const activeList = (view === 'ward' ? byWard : byDesk).filter(
    (item) => !(item.id === 'unassigned' && item.claimed === 0)
  );

  return (
    <div className="space-y-6">
      {/* Segmented Control Tabs (Exact match to Row 4, Col 3) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDDCD3] pb-4">
        {/* Recessed Pill Segmented Control */}
        <div className="bg-[#E9ECE6] p-1 rounded-2xl flex items-center gap-1 shadow-inner border border-[#DDDCD3]">
          <button
            type="button"
            onClick={() => setActiveTab('disputed')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'disputed'
                ? 'bg-[#FFFFFF] text-[#293732] shadow-[0_2px_6px_rgba(41,55,50,0.08)] border border-[#DDDCD3]'
                : 'text-[#65736B] hover:text-[#293732]'
            }`}
          >
            Disputed (4)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reopened')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'reopened'
                ? 'bg-[#FFFFFF] text-[#293732] shadow-[0_2px_6px_rgba(41,55,50,0.08)] border border-[#DDDCD3]'
                : 'text-[#65736B] hover:text-[#293732]'
            }`}
          >
            Reopened (2)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('verified')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'verified'
                ? 'bg-[#FFFFFF] text-[#293732] shadow-[0_2px_6px_rgba(41,55,50,0.08)] border border-[#DDDCD3]'
                : 'text-[#65736B] hover:text-[#293732]'
            }`}
          >
            Verified (18)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scorecard')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'scorecard'
                ? 'bg-[#FFFFFF] text-[#293732] shadow-[0_2px_6px_rgba(41,55,50,0.08)] border border-[#DDDCD3]'
                : 'text-[#65736B] hover:text-[#293732]'
            }`}
          >
            Ward Scorecard
          </button>
        </div>

        {/* Time period filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#65736B]">Window:</span>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => handlePeriodChange(d)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                period === d
                  ? 'bg-[#355858] text-white font-bold shadow-sm'
                  : 'bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:bg-[#E9ECE6]'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {actionNotice && (
        <div className="p-4 rounded-xl bg-[#E2EBE5] border border-[#537C60] text-[#537C60] text-xs flex items-center justify-between">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-[#537C60] hover:text-[#293732]">✕</button>
        </div>
      )}

      {/* DISPUTED TAB: Side-by-Side Verification Cards (Exact match to Row 4, Col 3) */}
      {activeTab === 'disputed' && (
        <div className="space-y-6">
          {SAMPLE_DISPUTES.map((item) => (
            <div 
              key={item.id}
              className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#DDDCD3]/60 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-mono font-bold text-[#293732]">
                      {item.code}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#FCEBE6] text-[#B76F60] border border-[#F5C7BD]">
                      {item.status}
                    </span>
                    <span className="text-xs font-medium text-[#65736B]">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#65736B]">
                    {item.location}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDispute(item)}
                  className="px-4 py-2 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#293732] hover:bg-[#F3F2EB] hover:border-[#527B7A] text-xs font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:translate-y-[1px] transition-all self-start sm:self-auto"
                >
                  Review &amp; Act
                </button>
              </div>

              {/* 3 Side-by-Side Images with Arrow Dividers (Row 4, Col 3) */}
              <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
                {/* 1. Original Defect */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#293732]">Original Defect</span>
                    <span className="font-mono text-[11px] text-[#65736B]">{item.originalDate}</span>
                  </div>
                  <div className="relative w-full h-36 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#E9ECE6]">
                    <Image
                      src={item.originalPhoto}
                      alt="Original Defect"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>

                {/* Arrow Divider */}
                <div className="hidden md:flex md:col-span-1 justify-center text-[#929B92]">
                  <ChevronRight className="w-5 h-5" />
                </div>

                {/* 2. Agency Repair Claim */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#293732]">Agency Repair Claim</span>
                    <span className="font-mono text-[11px] text-[#65736B]">{item.claimDate}</span>
                  </div>
                  <div className="relative w-full h-36 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#E9ECE6]">
                    <Image
                      src={item.claimPhoto}
                      alt="Agency Repair Claim"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>

                {/* Arrow Divider */}
                <div className="hidden md:flex md:col-span-1 justify-center text-[#929B92]">
                  <ChevronRight className="w-5 h-5" />
                </div>

                {/* 3. Citizen Verification */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#B76F60]">Citizen Verification</span>
                    <span className="font-mono text-[11px] text-[#65736B]">{item.verificationDate}</span>
                  </div>
                  <div className="relative w-full h-36 rounded-xl overflow-hidden border border-[#F5C7BD] bg-[#FCEBE6]/30">
                    <Image
                      src={item.verificationPhoto}
                      alt="Citizen Verification"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Dispute Findings Note */}
              <div className="p-3.5 bg-[#F7F8F5] border border-[#DDDCD3] rounded-xl text-xs text-[#293732] flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#B76F60] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[#293732]">Dispute Statement:</span>
                  <p className="text-[#65736B] mt-0.5">{item.disputeReason}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REOPENED TAB */}
      {activeTab === 'reopened' && (
        <div className="bg-[#FFFFFF] rounded-2xl p-8 border border-[#DDDCD3] text-center space-y-3">
          <Clock className="w-8 h-8 text-[#B68B63] mx-auto" />
          <h3 className="font-bold text-base text-[#293732]">2 Claims Reopened for Field Contractor Re-Work</h3>
          <p className="text-xs text-[#65736B] max-w-md mx-auto">
            These issues were disputed by verified citizen audits and have been sent back to the primary agency under defect liability warranty clauses.
          </p>
        </div>
      )}

      {/* VERIFIED TAB */}
      {activeTab === 'verified' && (
        <div className="bg-[#FFFFFF] rounded-2xl p-8 border border-[#DDDCD3] text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-[#537C60] mx-auto" />
          <h3 className="font-bold text-base text-[#293732]">18 Work Orders Successfully Verified Fixed</h3>
          <p className="text-xs text-[#65736B] max-w-md mx-auto">
            Citizen audits confirmed permanent repairs adhering to quality standards. Warranty clock initiated.
          </p>
        </div>
      )}

      {/* SCORECARD TAB: Ward Breakdown */}
      {activeTab === 'scorecard' && (
        <div className="bg-[#FFFFFF] rounded-2xl border border-[#DDDCD3] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#DDDCD3] bg-[#F7F8F5] flex items-center justify-between">
            <span className="text-xs font-bold text-[#293732] uppercase tracking-wider">Ward Performance Ledger</span>
            <span className="text-xs font-mono text-[#65736B]">Target Claim Gap: &lt; 15%</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F2EB]/50 border-b border-[#DDDCD3] text-[#65736B]">
                <tr>
                  <th className="p-3.5 px-5">Ward / Agency</th>
                  <th className="p-3.5 px-5">Claims Filed</th>
                  <th className="p-3.5 px-5">Disputed</th>
                  <th className="p-3.5 px-5">Claim Gap Rate</th>
                  <th className="p-3.5 px-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDDCD3]">
                {activeList.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F3F2EB]/40 transition-colors">
                    <td className="p-3.5 px-5 font-semibold text-[#293732]">{item.name}</td>
                    <td className="p-3.5 px-5 font-mono">{item.claimed}</td>
                    <td className="p-3.5 px-5 font-mono text-[#B76F60]">{item.disputed}</td>
                    <td className="p-3.5 px-5 font-mono font-bold">
                      {item.disputedPercentage.toFixed(1)}%
                    </td>
                    <td className="p-3.5 px-5 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.disputedPercentage <= 15
                          ? 'bg-[#E2EBE5] text-[#537C60]'
                          : 'bg-[#FCEBE6] text-[#B76F60]'
                      }`}>
                        {item.disputedPercentage <= 15 ? 'Compliant' : 'High Gap'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review & Act Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <div>
                <h3 className="font-display font-bold text-lg text-[#293732]">
                  Review Repair Dispute: {selectedDispute.code}
                </h3>
                <p className="text-xs text-[#65736B]">{selectedDispute.location}</p>
              </div>
              <button 
                onClick={() => setSelectedDispute(null)}
                className="w-7 h-7 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#FCEBE6]/40 border border-[#F5C7BD] rounded-xl text-[#B76F60]">
                <span className="font-bold block mb-1">Citizen Auditor Finding:</span>
                <p>{selectedDispute.disputeReason}</p>
              </div>

              <div className="p-3 bg-[#E9ECE6] rounded-xl space-y-1">
                <span className="text-[#65736B] text-[10px] uppercase font-bold block">Defect Liability Reference:</span>
                <p className="font-mono text-[#293732]">Contract Clause 17.2 — Warranty Period 180 Days</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActionNotice(`Work order for ${selectedDispute.code} reopened. Field contractor notified.`);
                  setSelectedDispute(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#B76F60] hover:bg-[#9E5B4D] text-white text-xs font-semibold shadow-sm transition-all text-center"
              >
                Reopen Work Order (Penalty)
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionNotice(`Senior inspector assigned to re-verify ${selectedDispute.code}.`);
                  setSelectedDispute(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold shadow-sm transition-all text-center"
              >
                Dispatch Senior Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

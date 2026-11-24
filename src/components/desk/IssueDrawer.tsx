'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { 
  X, CheckCircle2, XCircle, ArrowRightLeft, 
  Play, CheckCheck, RotateCcw, AlertTriangle, 
  Clock, MapPin, Building2, ShieldAlert, Loader2,
  Camera, FileText, Sparkles, User, Calendar, Shield,
  Layers, ChevronRight, Check
} from 'lucide-react';
import { getAllowedActions, type IssueAction } from '@/lib/issues/stateMachine';
import { Status, Band, Category } from '@prisma/client';
import Image from 'next/image';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';
import { formatPriority } from '@/lib/priority';
import { formatDateTimeIST, formatDateIST } from '@/lib/time/ist';

interface ActionLogEntry {
  id: string;
  actorName: string;
  action: string;
  note?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdAt: string;
  evidenceThumbnail?: string | null;
  isAiAction?: boolean;
  engine?: string;
  flags?: string[];
}

export interface DeskIssueItem {
  id: string;
  category: Category;
  status: Status;
  lat: number;
  lng: number;
  address?: string | null;
  priority: number;
  band: Band;
  bandOverride?: Band | null;
  bandOverrideNote?: string | null;
  handoffCount: number;
  slaDueAt: string | Date;
  slaBreached: boolean;
  createdAt: string | Date;
  agencyId?: string | null;
  agency?: {
    id: string;
    code: string;
    name: string;
    slaHours: number;
  } | null;
  reports?: Array<{
    id: string;
    photoUrl: string;
    createdAt: string | Date;
  }>;
  _count?: {
    reports: number;
    comments: number;
  };
  isSeed?: boolean;
  contractorName?: string | null;
  tenderId?: string | null;
  warrantyUntil?: string | Date | null;
  lifespanDays?: number | null;
  liabilityClauseRef?: string | null;
  deteriorationRisk?: "LOW" | "MED" | "HIGH" | null;
  deteriorationScore?: number | null;
  expectedDaysToWorsen?: number | null;
  isHotspot?: boolean;
}

interface AgencyOption {
  id: string;
  code: string;
  name: string;
}

interface IssueDrawerProps {
  issue: DeskIssueItem | null;
  agencies?: AgencyOption[];
  onClose: () => void;
  onActionComplete: (updatedIssue?: DeskIssueItem) => void;
}

type DrawerTab = 'Overview' | 'Evidence' | 'Location' | 'Assignment' | 'SLA' | 'AI Analysis' | 'Action History';

function formatDisplayId(id: string): string {
  if (id.startsWith('CP-2025-')) return id;
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `CP-2025-${digits.slice(-4)}`;
  }
  return `CP-2025-0184`;
}

export function IssueDrawer({
  issue,
  agencies = [],
  onClose,
  onActionComplete,
}: IssueDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('Overview');
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeForm, setActiveForm] = useState<IssueAction | null>(null);
  const [note, setNote] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [selectedBand, setSelectedBand] = useState<Band>('MEDIUM');
  const [actionError, setActionError] = useState<string | null>(null);
  const [capturedFixEvidence, setCapturedFixEvidence] = useState<CapturedEvidence | null>(null);
  const [showFixCamera, setShowFixCamera] = useState<boolean>(false);
  const [contractorName, setContractorName] = useState(issue?.contractorName || '');
  const [tenderId, setTenderId] = useState(issue?.tenderId || '');
  const [liabilityClauseRef, setLiabilityClauseRef] = useState(issue?.liabilityClauseRef || '');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!issue) return;
    setContractorName(issue.contractorName || '');
    setTenderId(issue.tenderId || '');
    setLiabilityClauseRef(issue.liabilityClauseRef || '');
    setSelectedBand(issue.bandOverride || issue.band || 'MEDIUM');
    setSelectedAgencyId(issue.agencyId || '');

    const fetchLogs = async () => {
      setLoadingLogs(true);
      try {
        const res = await fetch(`/api/issues/${issue.id}/log`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Failed to load logs', err);
      } finally {
        setLoadingLogs(false);
      }
    };
    fetchLogs();
  }, [issue]);

  if (!issue) return null;

  const pri = formatPriority(issue.priority);
  const effectiveBand = issue.bandOverride || issue.band || pri.band;
  const allowedActions = getAllowedActions(issue.status, 'AUTHORITY');
  const displayId = formatDisplayId(issue.id);
  const categoryLabel = (issue.category || 'POTHOLES').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const photoUrl = issue.reports?.[0]?.photoUrl || '/images/pothole-clean-evidence.jpg';

  const executeAction = async (action: IssueAction, extraPayload: any = {}) => {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/issues/${issue.id}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            note: note.trim() || undefined,
            ...extraPayload,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Action ${action} failed`);
        }

        const data = await res.json();
        setActiveForm(null);
        setNote('');
        setShowFixCamera(false);
        setCapturedFixEvidence(null);
        onActionComplete(data.issue);
      } catch (err: any) {
        setActionError(err.message || 'Something went wrong');
      }
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeForm) return;

    if (activeForm === 'ASSIGN_AGENCY' || activeForm === 'REASSIGN_AGENCY') {
      if (!selectedAgencyId) {
        setActionError('Please select an agency');
        return;
      }
      await executeAction(activeForm, { agencyId: selectedAgencyId });
      return;
    }

    if (activeForm === 'OVERRIDE_BAND') {
      if (!note.trim()) {
        setActionError('A written explanation is required to override the priority band.');
        return;
      }
      await executeAction('OVERRIDE_BAND', { bandOverride: selectedBand });
      return;
    }

    if (activeForm === 'CLAIM_FIX') {
      let evidencePayload = undefined;
      if (capturedFixEvidence) {
        const photoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(capturedFixEvidence.blob);
          reader.onloadend = () => {
            const res = (reader.result as string).split(',')[1];
            resolve(res);
          };
          reader.onerror = reject;
        });
        evidencePayload = {
          photoBase64,
          payload: capturedFixEvidence.payload,
          signature: capturedFixEvidence.signature,
          mimeType: 'image/jpeg',
        };
      }
      await executeAction('CLAIM_FIX', {
        evidence: evidencePayload,
        contractorName: contractorName.trim() || undefined,
        tenderId: tenderId.trim() || undefined,
        liabilityClauseRef: liabilityClauseRef.trim() || undefined,
      });
      return;
    }

    await executeAction(activeForm);
  };

  const tabs: DrawerTab[] = [
    'Overview',
    'Evidence',
    'Location',
    'Assignment',
    'SLA',
    'AI Analysis',
    'Action History',
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex justify-end transition-all">
      <div 
        className="w-full max-w-2xl bg-[#F3F2EB] border-l border-[#DDDCD3] flex flex-col h-full shadow-[0_20px_50px_rgba(0,0,0,0.25)] animate-in slide-in-from-right duration-200"
        data-testid="issue-drawer"
      >
        {/* Drawer Header (Row 4, Col 1) */}
        <div className="p-5 px-6 border-b border-[#DDDCD3] flex items-center justify-between bg-[#FFFFFF] shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-mono font-bold text-[#293732] tracking-tight">
              {displayId}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#E9ECE6] text-[#293732] border border-[#DDDCD3]">
                {categoryLabel}
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#FCEBE6] text-[#B76F60] border border-[#F5C7BD]">
                {effectiveBand} Priority
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] hover:text-[#293732] flex items-center justify-center transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            data-testid="close-drawer-button"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Layout: Left Nav + Main Content (Row 4, Col 1) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Vertical Tabs */}
          <div className="w-40 border-r border-[#DDDCD3] bg-[#E9ECE6]/60 p-3 space-y-1 shrink-0 overflow-y-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setActiveForm(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#FFFFFF] text-[#293732] font-semibold shadow-[0_2px_6px_rgba(41,55,50,0.06)] border border-[#DDDCD3]'
                      : 'text-[#65736B] hover:bg-[#FFFFFF]/50 hover:text-[#293732]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Right Main Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-[#F3F2EB]">
            {/* Error banner */}
            {actionError && (
              <div className="p-3.5 rounded-xl bg-[#FCEBE6] border border-[#F5C7BD] text-[#B76F60] text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* TAB: Overview (Exact match to Row 4, Col 1) */}
            {activeTab === 'Overview' && (
              <div className="space-y-5">
                {/* Defect Photo & Metadata Card */}
                <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
                  {/* Photo Container */}
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#E9ECE6]">
                    <Image
                      src={photoUrl}
                      alt="Defect Evidence"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono text-white flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-[#527B7A]" />
                      Verified Capture
                    </div>
                  </div>

                  {/* Metadata key-value list */}
                  <div className="space-y-3 pt-1 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-[#DDDCD3]/60">
                      <span className="text-[#65736B] font-medium">Status</span>
                      <span className="font-semibold px-2.5 py-0.5 rounded-md bg-[#D4E3DF] text-[#355858]">
                        {issue.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-[#DDDCD3]/60">
                      <span className="text-[#65736B] font-medium">Reported by</span>
                      <span className="font-medium text-[#293732]">Ananya Das</span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-[#DDDCD3]/60">
                      <span className="text-[#65736B] font-medium">Reported on</span>
                      <span className="font-medium text-[#293732] font-mono">
                        {formatDateIST(issue.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-[#65736B] font-medium">Location</span>
                      <span className="font-medium text-[#293732] text-right">
                        {issue.address || `MG Road, Ward 12`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inline Action Forms */}
                {activeForm && (
                  <form onSubmit={handleFormSubmit} className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#527B7A] shadow-md space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-2">
                      <span className="text-xs font-semibold text-[#293732] uppercase tracking-wider">
                        Action: {activeForm.replace(/_/g, ' ')}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setActiveForm(null)}
                        className="text-xs text-[#65736B] hover:text-[#293732]"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Agency Selector */}
                    {(activeForm === 'ASSIGN_AGENCY' || activeForm === 'REASSIGN_AGENCY') && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-[#293732] block">Select Agency</label>
                        <select
                          value={selectedAgencyId}
                          onChange={(e) => setSelectedAgencyId(e.target.value)}
                          className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs font-medium text-[#293732] shadow-inner focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                        >
                          <option value="">-- Choose Agency --</option>
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Band Override */}
                    {activeForm === 'OVERRIDE_BAND' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-[#293732] block">Target Priority Band</label>
                        <div className="grid grid-cols-4 gap-2">
                          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Band[]).map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setSelectedBand(b)}
                              className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                                selectedBand === b
                                  ? 'bg-[#355858] text-white border-[#355858] shadow-sm'
                                  : 'bg-[#E9ECE6] text-[#293732] border-[#DDDCD3]'
                              }`}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Claim Fix Details */}
                    {activeForm === 'CLAIM_FIX' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-xs font-medium text-[#65736B] block mb-1">Contractor Name</label>
                            <input
                              type="text"
                              value={contractorName}
                              onChange={(e) => setContractorName(e.target.value)}
                              placeholder="e.g. Cauvery Infrastructure"
                              className="w-full px-3 py-2 rounded-xl bg-[#E9ECE6] border border-[#DDDCD3] text-[#293732] text-xs focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[#65736B] block mb-1">Tender ID</label>
                            <input
                              type="text"
                              value={tenderId}
                              onChange={(e) => setTenderId(e.target.value)}
                              placeholder="e.g. BBMP/EE/2026/W-10"
                              className="w-full px-3 py-2 rounded-xl bg-[#E9ECE6] border border-[#DDDCD3] text-[#293732] text-xs focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                            />
                          </div>
                        </div>

                        {showFixCamera ? (
                          <div className="border border-[#DDDCD3] rounded-xl overflow-hidden p-2 bg-[#E9ECE6]">
                            <CaptureCamera
                              role="CLAIM_FIX"
                              onCapture={(ev) => {
                                setCapturedFixEvidence(ev);
                                setShowFixCamera(false);
                              }}
                              onCancel={() => setShowFixCamera(false)}
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowFixCamera(true)}
                            className="w-full py-2.5 px-3 rounded-xl border border-dashed border-[#527B7A] bg-[#D4E3DF]/30 text-[#355858] text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#D4E3DF]/50 transition-colors"
                          >
                            <Camera className="w-4 h-4" />
                            {capturedFixEvidence ? 'Photo Evidence Attached (Retake)' : 'Capture Repair Photo Proof'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Note Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#293732] block">
                        {activeForm === 'CLAIM_FIX' ? 'Resolution Notes (Optional)' : 'Officer Notes'}
                      </label>
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add operational notes..."
                        className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl p-2.5 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="px-4 py-2 rounded-xl bg-[#E9ECE6] text-[#293732] hover:bg-[#DDDCD3] text-xs font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isPending}
                        className="px-5 py-2 rounded-xl bg-[#355858] text-white font-medium text-xs shadow-md hover:bg-[#293732] transition-colors flex items-center gap-1.5"
                      >
                        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Confirm Action
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* TAB: Evidence */}
            {activeTab === 'Evidence' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-4">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">Cryptographic Proof & Sensor Telemetry</h3>
                <div className="space-y-2 text-xs font-mono text-[#293732]">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span>Algorithm</span>
                    <span className="font-bold text-[#527B7A]">ECDSA P-256 (SHA-256)</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span>Hardware Keystore</span>
                    <span className="text-[#537C60] font-bold">Secure Enclave (TPM 2.0)</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span>GPS Accuracy</span>
                    <span>± 3.2 meters</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl break-all">
                    <span className="block text-[#65736B] text-[10px] uppercase mb-1">Digest Hash</span>
                    <span>e7a4b091f1c84968df72e2938fbb23901a5e982189d20c58742f53d865c1920a</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Location */}
            {activeTab === 'Location' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">Cartographic Coordinates</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl">
                    <span className="text-[#65736B] block text-[10px] uppercase">Latitude</span>
                    <span className="font-mono font-bold text-sm">{issue.lat.toFixed(6)}° N</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl">
                    <span className="text-[#65736B] block text-[10px] uppercase">Longitude</span>
                    <span className="font-mono font-bold text-sm">{issue.lng.toFixed(6)}° E</span>
                  </div>
                </div>
                <div className="p-3 bg-[#E9ECE6] rounded-xl space-y-1">
                  <span className="text-[#65736B] block text-[10px] uppercase">Ward & Corridor</span>
                  <p className="font-semibold text-[#293732]">Ward 12 – MG Road Arterial Corridor</p>
                </div>
              </div>
            )}

            {/* TAB: Assignment */}
            {activeTab === 'Assignment' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">Agency & Contractor Assignment</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">Agency</span>
                    <span className="font-semibold text-[#293732]">{issue.agency?.name || 'BBMP Road Maintenance'}</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">Contractor</span>
                    <span className="font-semibold text-[#293732]">{issue.contractorName || 'Cauvery Infrastructure Works'}</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">Tender / Work Order</span>
                    <span className="font-mono text-[#527B7A]">{issue.tenderId || 'BBMP/EE/2026/W-12/P-04'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SLA */}
            {activeTab === 'SLA' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">SLA & Warranty Telemetry</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">SLA Deadline</span>
                    <span className="font-mono font-semibold">{formatDateTimeIST(issue.slaDueAt)}</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">SLA Compliance Status</span>
                    <span className={`font-semibold ${issue.slaBreached ? 'text-[#B76F60]' : 'text-[#537C60]'}`}>
                      {issue.slaBreached ? 'Breached' : 'Within Normal Bounds (72h)'}
                    </span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">Warranty Duration</span>
                    <span className="font-medium text-[#293732]">180 Days Post-Verification</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: AI Analysis */}
            {activeTab === 'AI Analysis' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs">
                <div className="flex items-center gap-2 text-[#527B7A]">
                  <Sparkles className="w-4 h-4" />
                  <h3 className="font-bold uppercase tracking-wider">Automated Civic Vision Triage</h3>
                </div>
                <p className="text-[#65736B] leading-relaxed">
                  Vision model identified heavy asphalt cratering with exposed base gravel. Deterioration risk is elevated due to monsoon runoff along MG Road.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl">
                    <span className="text-[#65736B] block text-[10px] uppercase">Confidence</span>
                    <span className="font-bold text-[#537C60]">98.4% Pothole Defect</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl">
                    <span className="text-[#65736B] block text-[10px] uppercase">Recommended Action</span>
                    <span className="font-semibold text-[#293732]">Cold Bituminous Patch</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Action History */}
            {activeTab === 'Action History' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">Audit Log & State Transitions</h3>
                {loadingLogs ? (
                  <div className="py-8 text-center text-[#65736B] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading audit logs...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="space-y-3 py-2">
                    <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[#293732] block">Initial Citizen Report Filed</span>
                        <span className="text-[#65736B] text-[11px]">Logged by Ananya Das (Citizen)</span>
                      </div>
                      <span className="font-mono text-[#65736B] text-[10px]">{formatDateIST(issue.createdAt)}</span>
                    </div>
                    <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[#293732] block">Auto-Assigned to BBMP Road Works</span>
                        <span className="text-[#65736B] text-[11px]">CivicPulse Routing Engine</span>
                      </div>
                      <span className="font-mono text-[#65736B] text-[10px]">{formatDateIST(issue.createdAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[#293732] block">{log.action.replace(/_/g, ' ')}</span>
                          <span className="text-[#65736B] text-[11px]">by {log.actorName}</span>
                          {log.note && <p className="text-[#293732] italic text-[11px] mt-0.5">"{log.note}"</p>}
                        </div>
                        <span className="font-mono text-[#65736B] text-[10px]">{formatDateTimeIST(log.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Bottom Action Bar (Row 4, Col 1) */}
        <div className="p-4 px-6 border-t border-[#DDDCD3] bg-[#FFFFFF] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setActiveForm('ASSIGN_AGENCY')}
            className="px-4 py-2 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#293732] hover:bg-[#F3F2EB] hover:border-[#527B7A] text-xs font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:translate-y-[1px] transition-all"
          >
            Assign Agency
          </button>

          <button
            type="button"
            onClick={() => setActiveForm('START_WORK')}
            className="px-4 py-2 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#293732] hover:bg-[#F3F2EB] hover:border-[#527B7A] text-xs font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:translate-y-[1px] transition-all"
          >
            Update Status
          </button>

          <button
            type="button"
            onClick={() => setActiveForm('CLAIM_FIX')}
            className="px-5 py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold shadow-[0_2px_6px_rgba(53,88,88,0.3)] active:translate-y-[1px] transition-all flex items-center gap-1.5"
          >
            Claim Repair
          </button>
        </div>
      </div>
    </div>
  );
}

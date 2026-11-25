'use client';

import React, { useEffect, useState, useTransition } from 'react';
import {
  X, AlertTriangle, Loader2, Camera, Sparkles, Shield, Users, CheckCircle2,
} from 'lucide-react';
import { getAllowedActions, type IssueAction } from '@/lib/issues/stateMachine';
import { Status, Band, Category } from '@prisma/client';
import Image from 'next/image';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';
import { formatPriority } from '@/lib/priority';
import { formatDateTimeIST, formatDateIST } from '@/lib/time/ist';
import type { RepairWindowResult } from '@/lib/traffic/repairWindow';

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

interface PersonnelOption {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
}

interface AnalystData {
  summary?: string;
  reasoning?: string;
  suggestedAction?: string;
  engine?: string;
  status?: string;
  triage?: {
    result: string;
    engine: string;
    time: string;
    flags: string[];
    status: string;
  };
  fixCheck?: {
    result: string;
    engine: string;
    time: string;
    flags: string[];
    status: string;
  };
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
  ward?: {
    id: string;
    code: string;
    name: string;
  } | null;
  assignments?: Array<{
    id: string;
    status: string;
    createdAt: string | Date;
    personnel: {
      id: string;
      name: string;
      role: string;
      contact: string;
    };
  }>;
  reports?: Array<{
    id: string;
    photoUrl: string;
    photoSha256?: string | null;
    gpsAccuracyM?: number | null;
    capturedAt?: string | Date | null;
    createdAt: string | Date;
    user?: {
      name?: string | null;
      email?: string | null;
    } | null;
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
  deteriorationRisk?: 'LOW' | 'MED' | 'HIGH' | null;
  deteriorationScore?: number | null;
  expectedDaysToWorsen?: number | null;
  isHotspot?: boolean;
  bestRepairWindow?: RepairWindowResult | null;
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

type DrawerTab =
  | 'Overview'
  | 'Evidence'
  | 'Location'
  | 'Assignment'
  | 'SLA'
  | 'AI Analysis'
  | 'Action History';

export function formatEvidenceCount(issue: { _count?: { reports?: number }; reports?: unknown[] }): string {
  const count = issue._count?.reports ?? issue.reports?.length ?? 0;
  if (count <= 0) return 'No evidence yet';
  return count === 1 ? '1 evidence report' : `${count} evidence reports`;
}

function formatDisplayId(id: string): string {
  if (id.startsWith('CP-')) return id;
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `CP-${digits.slice(-4)}`;
  }
  return `CP-${id.slice(0, 6).toUpperCase()}`;
}

const ACTION_LABELS: Record<string, string> = {
  CONFIRM: 'Confirm',
  ASSIGN_AGENCY: 'Assign Agency',
  REASSIGN_AGENCY: 'Reassign Agency',
  START_WORK: 'Start Work',
  CLAIM_FIX: 'Claim Repair',
  OVERRIDE_BAND: 'Override Band',
  REJECT: 'Reject',
  REOPEN: 'Reopen',
  REOPEN_IN_WARRANTY: 'Warranty Reopen',
};

export function IssueDrawer({
  issue,
  agencies = [],
  onClose,
  onActionComplete,
}: IssueDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('Overview');
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [analystSummary, setAnalystSummary] = useState<AnalystData | null>(null);
  const [loadingAnalyst, setLoadingAnalyst] = useState(false);
  const [personnels, setPersonnels] = useState<PersonnelOption[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState('');
  const [assigningPersonnel, setAssigningPersonnel] = useState(false);
  const [personnelNotice, setPersonnelNotice] = useState<string | null>(null);

  const [activeForm, setActiveForm] = useState<IssueAction | null>(null);
  const [note, setNote] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [selectedBand, setSelectedBand] = useState<Band>('MEDIUM');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
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
    setSelectedAgencyId(issue.agencyId || (agencies[0]?.id ?? ''));
    setSelectedPersonnelId(issue.assignments?.[0]?.personnel?.id || '');
    setActionError(null);
    setActionSuccess(null);
    setPersonnelNotice(null);
    setAnalystSummary(null);

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

    const fetchPersonnels = async () => {
      try {
        const res = await fetch('/api/personnels');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const activeList = data.filter((p: PersonnelOption) => p.active !== false);
            setPersonnels(activeList);
            if (!issue.assignments?.[0]?.personnel?.id && activeList.length > 0) {
              setSelectedPersonnelId(activeList[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load personnels', err);
      }
    };

    fetchLogs();
    fetchPersonnels();
  }, [issue, agencies]);

  // Fetch real AI assessment when AI Analysis tab is opened
  useEffect(() => {
    if (!issue || activeTab !== 'AI Analysis' || analystSummary || loadingAnalyst) return;
    let cancelled = false;
    setLoadingAnalyst(true);
    fetch(`/api/issues/${issue.id}/analyst`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setAnalystSummary(data);
        }
      })
      .catch((err) => console.error('Failed to load AI analysis:', err))
      .finally(() => {
        if (!cancelled) setLoadingAnalyst(false);
      });
    return () => {
      cancelled = true;
    };
  }, [issue, activeTab, analystSummary, loadingAnalyst]);

  if (!issue) return null;

  const pri = formatPriority(issue.priority);
  const effectiveBand = issue.bandOverride || issue.band || pri.band;
  const allowedActions = getAllowedActions(issue.status, 'AUTHORITY');
  const displayId = formatDisplayId(issue.id);
  const categoryLabel = (issue.category || 'POTHOLES')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const latestReport = issue.reports?.[0];
  const photoUrl = latestReport?.photoUrl || '/images/pothole-clean-evidence.jpg';
  const reporterDisplay =
    latestReport?.user?.name ||
    latestReport?.user?.email?.split('@')[0] ||
    'Citizen Reporter';
  const currentAssignment = issue.assignments?.[0];

  const refreshLogs = async () => {
    try {
      const res = await fetch(`/api/issues/${issue.id}/log`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  const executeAction = async (
    action: IssueAction,
    extraPayload: Record<string, unknown> = {}
  ) => {
    setActionError(null);
    setActionSuccess(null);
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

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || data.error || `Action ${action} failed`);
        }

        setActiveForm(null);
        setNote('');
        setShowFixCamera(false);
        setCapturedFixEvidence(null);
        setActionSuccess(`Action ${ACTION_LABELS[action] || action} applied.`);
        await refreshLogs();
        onActionComplete(data.issue);
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  };

  const handleAssignPersonnel = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPersonnelId) {
      setActionError('Please select a field personnel member.');
      return;
    }
    setAssigningPersonnel(true);
    setActionError(null);
    setPersonnelNotice(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personnelId: selectedPersonnelId,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to assign field personnel');
      }
      setPersonnelNotice(`Assigned to ${data.assignment?.personnel?.name || 'field personnel'}.`);
      setNote('');
      await refreshLogs();
      onActionComplete(data.issue);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign personnel');
    } finally {
      setAssigningPersonnel(false);
    }
  };

  const handleActionClick = (action: IssueAction) => {
    setActionError(null);
    setActionSuccess(null);
    if (action === 'CONFIRM' || action === 'START_WORK') {
      executeAction(action);
      return;
    }
    if (action === 'ASSIGN_AGENCY' || action === 'REASSIGN_AGENCY') {
      setSelectedAgencyId(issue.agencyId || (agencies[0]?.id ?? ''));
    }
    if (action === 'OVERRIDE_BAND') {
      setSelectedBand(effectiveBand);
    }
    setActiveTab('Overview');
    setActiveForm(action);
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
      await executeAction('OVERRIDE_BAND', { overrideBand: selectedBand });
      return;
    }

    if (activeForm === 'REJECT' || activeForm === 'REOPEN' || activeForm === 'REOPEN_IN_WARRANTY') {
      if (!note.trim()) {
        setActionError(`A written reason note is required for ${ACTION_LABELS[activeForm] || activeForm}.`);
        return;
      }
      await executeAction(activeForm);
      return;
    }

    if (activeForm === 'CLAIM_FIX') {
      if (!capturedFixEvidence) {
        setActionError('Claiming a repair requires capturing a signed on-site photo first.');
        return;
      }
      const photoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(capturedFixEvidence.blob);
        reader.onloadend = () => {
          const res = (reader.result as string).split(',')[1];
          resolve(res);
        };
        reader.onerror = reject;
      });
      await executeAction('CLAIM_FIX', {
        evidence: {
          photoBase64,
          payload: capturedFixEvidence.payload,
          signature: capturedFixEvidence.signature,
          mimeType: 'image/jpeg',
        },
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
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#F3F2EB] border-l border-[#DDDCD3] flex flex-col h-full shadow-[0_20px_50px_rgba(0,0,0,0.25)] animate-in slide-in-from-right duration-200"
        data-testid="issue-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 px-6 border-b border-[#DDDCD3] flex items-center justify-between bg-[#FFFFFF] shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
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
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] hover:text-[#293732] flex items-center justify-center transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.05)] cursor-pointer"
            data-testid="close-drawer-button"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Layout: Left Nav + Main Content */}
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
                    if (tab !== 'Overview') setActiveForm(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer ${
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
            {/* Error / Success banners */}
            {actionError && (
              <div className="p-3.5 rounded-xl bg-[#FCEBE6] border border-[#F5C7BD] text-[#B76F60] text-xs flex items-center gap-2 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
            {(actionSuccess || personnelNotice) && (
              <div className="p-3.5 rounded-xl bg-[#EBF3ED] border border-[#CDE3D2] text-[#537C60] text-xs flex items-center gap-2 animate-in fade-in duration-150">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{actionSuccess || personnelNotice}</span>
              </div>
            )}

            {/* TAB: Overview */}
            {activeTab === 'Overview' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#E9ECE6]">
                    <Image src={photoUrl} alt="Defect Evidence" fill className="object-cover" />
                    <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono text-white flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-[#527B7A]" />
                      {formatEvidenceCount(issue)}
                    </div>
                  </div>

                  <div className="space-y-3 pt-1 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-[#DDDCD3]/60">
                      <span className="text-[#65736B] font-medium">Status</span>
                      <span className="font-semibold px-2.5 py-0.5 rounded-md bg-[#D4E3DF] text-[#355858]">
                        {issue.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-[#DDDCD3]/60">
                      <span className="text-[#65736B] font-medium">Reported by</span>
                      <span className="font-medium text-[#293732]">{reporterDisplay}</span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-[#DDDCD3]/60">
                      <span className="text-[#65736B] font-medium">Assigned Personnel</span>
                      <span className="font-medium text-[#293732]">
                        {currentAssignment?.personnel
                          ? `${currentAssignment.personnel.name} (${currentAssignment.personnel.role})`
                          : 'Unassigned'}
                      </span>
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
                        {issue.address || `${issue.lat.toFixed(4)}, ${issue.lng.toFixed(4)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inline Action Forms */}
                {activeForm && (
                  <form
                    onSubmit={handleFormSubmit}
                    className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#527B7A] shadow-md space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  >
                    <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-2">
                      <span className="text-xs font-semibold text-[#293732] uppercase tracking-wider">
                        Action: {ACTION_LABELS[activeForm] || activeForm.replace(/_/g, ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="text-xs text-[#65736B] hover:text-[#293732] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    {(activeForm === 'ASSIGN_AGENCY' || activeForm === 'REASSIGN_AGENCY') && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-[#293732] block">Select Agency</label>
                        {agencies.length === 0 ? (
                          <p className="text-xs text-[#B76F60]">No agencies available in directory.</p>
                        ) : (
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
                        )}
                      </div>
                    )}

                    {activeForm === 'OVERRIDE_BAND' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-[#293732] block">Target Priority Band</label>
                        <div className="grid grid-cols-4 gap-2">
                          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Band[]).map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setSelectedBand(b)}
                              className={`py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
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
                            className="w-full py-2.5 px-3 rounded-xl border border-dashed border-[#527B7A] bg-[#D4E3DF]/30 text-[#355858] text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#D4E3DF]/50 transition-colors cursor-pointer"
                          >
                            <Camera className="w-4 h-4" />
                            {capturedFixEvidence ? 'Photo Evidence Attached (Retake)' : 'Capture Repair Photo Proof (Required)'}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#293732] block">
                        {activeForm === 'CLAIM_FIX'
                          ? 'Resolution Notes (Optional)'
                          : activeForm === 'OVERRIDE_BAND' || activeForm === 'REJECT' || activeForm === 'REOPEN' || activeForm === 'REOPEN_IN_WARRANTY'
                          ? 'Reason Note (Required)'
                          : 'Officer Notes (Optional)'}
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
                        className="px-4 py-2 rounded-xl bg-[#E9ECE6] text-[#293732] hover:bg-[#DDDCD3] text-xs font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isPending}
                        className="px-5 py-2 rounded-xl bg-[#355858] text-white font-medium text-xs shadow-md hover:bg-[#293732] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-4 animate-in fade-in duration-150">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">
                  Cryptographic Proof &amp; Sensor Telemetry
                </h3>
                <div className="space-y-2 text-xs font-mono text-[#293732]">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span>Evidence Count</span>
                    <span className="font-bold text-[#355858]">{formatEvidenceCount(issue)}</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span>Algorithm</span>
                    <span className="font-bold text-[#527B7A]">ECDSA P-256 (SHA-256)</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span>GPS Accuracy</span>
                    <span>
                      {typeof latestReport?.gpsAccuracyM === 'number'
                        ? `± ${latestReport.gpsAccuracyM.toFixed(1)} meters`
                        : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl break-all">
                    <span className="block text-[#65736B] text-[10px] uppercase mb-1">Photo SHA-256 Digest</span>
                    <span>{latestReport?.photoSha256 || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Location */}
            {activeTab === 'Location' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs animate-in fade-in duration-150">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">
                  Cartographic Coordinates
                </h3>
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
                  <span className="text-[#65736B] block text-[10px] uppercase">Ward &amp; Address</span>
                  <p className="font-semibold text-[#293732]">
                    {issue.ward ? `${issue.ward.name} (${issue.ward.code})` : 'Jurisdiction Pending'} — {issue.address || 'Coordinates recorded'}
                  </p>
                </div>
              </div>
            )}

            {/* TAB: Assignment (Agency + Personnel!) */}
            {activeTab === 'Assignment' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs">
                  <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">
                    Agency &amp; Contractor Assignment
                  </h3>
                  <div className="space-y-2">
                    <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                      <span className="text-[#65736B]">Agency</span>
                      <span className="font-semibold text-[#293732]">
                        {issue.agency?.name || 'Unassigned'}
                      </span>
                    </div>
                    <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                      <span className="text-[#65736B]">Assigned Field Personnel</span>
                      <span className="font-semibold text-[#355858]">
                        {currentAssignment?.personnel
                          ? `${currentAssignment.personnel.name} — ${currentAssignment.personnel.role}`
                          : 'Unassigned'}
                      </span>
                    </div>
                    <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                      <span className="text-[#65736B]">Contractor</span>
                      <span className="font-semibold text-[#293732]">{issue.contractorName || '—'}</span>
                    </div>
                    <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                      <span className="text-[#65736B]">Tender / Work Order</span>
                      <span className="font-mono text-[#527B7A]">{issue.tenderId || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Assign Field Personnel Card */}
                <form
                  onSubmit={handleAssignPersonnel}
                  className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs"
                >
                  <div className="flex items-center gap-2 text-[#293732]">
                    <Users className="w-4 h-4 text-[#527B7A]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Assign Field Personnel
                    </h3>
                  </div>

                  {personnels.length === 0 ? (
                    <p className="text-xs text-[#65736B]">
                      No active field personnel found. Add officers in Field Personnel directory.
                    </p>
                  ) : (
                    <>
                      <select
                        value={selectedPersonnelId}
                        onChange={(e) => setSelectedPersonnelId(e.target.value)}
                        data-testid="assign-personnel-select"
                        className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2.5 text-xs font-medium text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                      >
                        <option value="">-- Select Field Officer --</option>
                        {personnels.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.role} ({p.contact})
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        disabled={assigningPersonnel || !selectedPersonnelId}
                        data-testid="assign-personnel-submit"
                        className="w-full py-2.5 px-4 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {assigningPersonnel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{currentAssignment ? 'Reassign Field Personnel' : 'Assign Field Personnel'}</span>
                      </button>
                    </>
                  )}
                </form>
              </div>
            )}

            {/* TAB: SLA */}
            {activeTab === 'SLA' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs animate-in fade-in duration-150">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">
                  SLA &amp; Warranty Telemetry
                </h3>
                <div className="space-y-2">
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">SLA Deadline</span>
                    <span className="font-mono font-semibold">{formatDateTimeIST(issue.slaDueAt)}</span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">SLA Compliance Status</span>
                    <span className={`font-semibold ${issue.slaBreached ? 'text-[#B76F60]' : 'text-[#537C60]'}`}>
                      {issue.slaBreached ? 'Breached' : 'Within SLA Window'}
                    </span>
                  </div>
                  <div className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between">
                    <span className="text-[#65736B]">Warranty Until</span>
                    <span className="font-medium text-[#293732]">
                      {issue.warrantyUntil ? formatDateIST(issue.warrantyUntil) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: AI Analysis (Real API call) */}
            {activeTab === 'AI Analysis' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#527B7A]">
                    <Sparkles className="w-4 h-4" />
                    <h3 className="font-bold uppercase tracking-wider">AI Co-Pilot &amp; Photo Triage</h3>
                  </div>
                  {analystSummary?.engine && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#E9ECE6] text-[#355858]">
                      {analystSummary.engine}
                    </span>
                  )}
                </div>

                {loadingAnalyst ? (
                  <div className="py-8 text-center text-[#65736B] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading AI assessment...
                  </div>
                ) : analystSummary ? (
                  <div className="space-y-3">
                    <p className="text-[#293732] leading-relaxed bg-[#FAF9F5] p-3 rounded-xl border border-[#E5E9E3]">
                      {analystSummary.summary || 'Assessment recorded.'}
                    </p>
                    {analystSummary.reasoning && (
                      <div className="text-[#65736B] text-[11px]">
                        <strong className="text-[#293732]">Reasoning:</strong> {analystSummary.reasoning}
                      </div>
                    )}
                    {analystSummary.triage && (
                      <div className="p-3 bg-[#E9ECE6] rounded-xl space-y-1.5" data-testid="ai-triage-panel">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#293732]">Photo Triage (G1)</span>
                          <span className="font-mono text-[#527B7A]">{analystSummary.triage.engine}</span>
                        </div>
                        <div className="text-[#293732]">{analystSummary.triage.result}</div>
                        {analystSummary.triage.flags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {analystSummary.triage.flags.map((flag) => (
                              <span
                                key={flag}
                                className="px-2 py-0.5 rounded bg-[#FCEBE6] text-[#B76F60] border border-[#F5C7BD] text-[10px] font-semibold"
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[#65736B]">AI assessment unavailable for this issue yet.</p>
                )}
              </div>
            )}

            {/* TAB: Action History */}
            {activeTab === 'Action History' && (
              <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] space-y-3 text-xs animate-in fade-in duration-150">
                <h3 className="text-xs font-bold uppercase text-[#65736B] tracking-wider">
                  Audit Log &amp; State Transitions
                </h3>
                {loadingLogs ? (
                  <div className="py-8 text-center text-[#65736B] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading audit logs...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="py-6 text-center text-[#65736B]">
                    No state transitions or officer actions recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="p-3 bg-[#E9ECE6] rounded-xl flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-[#293732] block">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[#65736B] text-[11px]">by {log.actorName}</span>
                          {log.note && (
                            <p className="text-[#293732] italic text-[11px] mt-0.5">&quot;{log.note}&quot;</p>
                          )}
                        </div>
                        <span className="font-mono text-[#65736B] text-[10px] shrink-0">
                          {formatDateTimeIST(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Bottom Action Bar (State-Machine Driven!) */}
        <div className="p-4 px-6 border-t border-[#DDDCD3] bg-[#FFFFFF] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('Assignment');
              setActiveForm(null);
            }}
            className="px-3.5 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-[#355858] hover:border-[#527B7A] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Assign Personnel</span>
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {allowedActions.map((action) => {
              const isPrimary = action === 'CLAIM_FIX' || action === 'CONFIRM' || action === 'START_WORK';
              const isDanger = action === 'REJECT';
              return (
                <button
                  key={action}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleActionClick(action)}
                  data-testid={`action-btn-${action}`}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold active:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50 ${
                    isDanger
                      ? 'bg-[#FCEBE6] border border-[#F5C7BD] text-[#B76F60] hover:bg-[#F5C7BD]/40'
                      : isPrimary
                      ? 'bg-[#355858] hover:bg-[#293732] text-white shadow-[0_2px_6px_rgba(53,88,88,0.25)]'
                      : 'bg-[#FFFFFF] border border-[#DDDCD3] text-[#293732] hover:bg-[#F3F2EB] hover:border-[#527B7A]'
                  }`}
                >
                  {ACTION_LABELS[action] || action.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

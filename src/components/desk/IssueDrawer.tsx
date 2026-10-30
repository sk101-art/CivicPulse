'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { 
  X, CheckCircle2, XCircle, ArrowRightLeft, 
  Play, CheckCheck, RotateCcw, AlertTriangle, 
  Clock, MapPin, Building2, ShieldAlert, Loader2,
  UserCheck, Camera, FileText, Sparkles
} from 'lucide-react';
import { getAllowedActions, type IssueAction } from '@/lib/issues/stateMachine';
import { Status, Band, Category } from '@prisma/client';
import Image from 'next/image';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';
import { formatPriority } from '@/lib/priority';
import { RepairWindowBadge } from './RepairWindowBadge';
import { LiveTrafficCard } from '@/components/traffic/LiveTrafficCard';

interface ActionLogEntry {
  id: string;
  actorName: string;
  action: string;
  note?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdAt: string;
  evidenceThumbnail?: string | null;
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
  deteriorationDrivers?: Array<{ name: string; impactScore: number }> | null;
  bestRepairWindow?: {
    start: string;
    end: string;
    score: number;
    reason: string;
    basis: "live" | "estimated";
    display?: string;
    condition?: string;
    sampleCount?: number;
  } | null;
}

interface AgencyOption {
  id: string;
  code: string;
  name: string;
}

interface IssueDrawerProps {
  issue: DeskIssueItem | null;
  agencies: AgencyOption[];
  onClose: () => void;
  onActionComplete: (updatedIssue?: DeskIssueItem) => void;
}

export function IssueDrawer({
  issue,
  agencies,
  onClose,
  onActionComplete,
}: IssueDrawerProps) {
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
  const [analystSummary, setAnalystSummary] = useState<{
    summary: string;
    priorityAdjustmentRecommended: number;
    reasoning: string;
    keyRisks: string[];
    suggestedAction: string;
    engine?: string;
  } | null>(null);
  const [analystDismissed, setAnalystDismissed] = useState(false);
  const [priorityAccepted, setPriorityAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const issueId = issue?.id;

  useEffect(() => {
    if (!issueId) return;

    let isMounted = true;
    setAnalystDismissed(false);
    setPriorityAccepted(false);

    const loadLogs = async () => {
      setLoadingLogs(true);
      setActionError(null);
      setActiveForm(null);
      setNote('');
      setContractorName(issue?.contractorName || '');
      setTenderId(issue?.tenderId || '');
      setLiabilityClauseRef(issue?.liabilityClauseRef || '');

      try {
        const res = await fetch(`/api/issues/${issueId}/log`);
        const data = await res.json();
        if (isMounted && data.logs) {
          setLogs(data.logs);
        }
      } catch (err) {
        console.error('Failed to fetch action logs', err);
      } finally {
        if (isMounted) setLoadingLogs(false);
      }
    };

    const loadAnalyst = async () => {
      try {
        const res = await fetch(`/api/issues/${issueId}/analyst`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setAnalystSummary(data);
        }
      } catch {
        // Fallback gracefully
      }
    };

    void loadLogs();
    void loadAnalyst();

    return () => {
      isMounted = false;
    };
  }, [issueId, issue?.contractorName, issue?.liabilityClauseRef, issue?.tenderId]);

  if (!issue) return null;

  const pri = formatPriority(issue.priority);
  const effectiveBand = issue.bandOverride || issue.band || pri.band;
  const allowedActions = getAllowedActions(issue.status, 'AUTHORITY');

  const executeAction = async (action: IssueAction, extraPayload?: Record<string, unknown>) => {
    setActionError(null);
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to execute action');
      }

      // Refresh logs
      const logRes = await fetch(`/api/issues/${issue.id}/log`);
      const logData = await logRes.json();
      if (logData.logs) {
        setLogs(logData.logs);
      }

      setActiveForm(null);
      setNote('');
      onActionComplete(data.issue);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleActionClick = (action: IssueAction) => {
    setActionError(null);
    if (action === 'CONFIRM' || action === 'START_WORK') {
      startTransition(() => {
        executeAction(action);
      });
      return;
    }

    if (action === 'ASSIGN_AGENCY' || action === 'REASSIGN_AGENCY') {
      setSelectedAgencyId(issue.agencyId || (agencies[0]?.id ?? ''));
    }

    if (action === 'OVERRIDE_BAND') {
      setSelectedBand(effectiveBand);
    }

    setActiveForm(action);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeForm) return;

    if (activeForm === 'ASSIGN_AGENCY' || activeForm === 'REASSIGN_AGENCY') {
      if (!selectedAgencyId) {
        setActionError('Please select an agency');
        return;
      }
      startTransition(() => {
        executeAction(activeForm, { agencyId: selectedAgencyId });
      });
      return;
    }

    if (activeForm === 'OVERRIDE_BAND') {
      if (!note.trim()) {
        setActionError('A reason note is required to override band');
        return;
      }
      startTransition(() => {
        executeAction('OVERRIDE_BAND', { overrideBand: selectedBand });
      });
      return;
    }

    if (activeForm === 'REJECT' || activeForm === 'REOPEN') {
      if (!note.trim()) {
        setActionError(`A reason note is required to ${activeForm.toLowerCase()} this issue`);
        return;
      }
      startTransition(() => {
        executeAction(activeForm);
      });
      return;
    }

    if (activeForm === 'CLAIM_FIX') {
      startTransition(async () => {
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
      });
      return;
    }
  };

  const bandColor =
    effectiveBand === 'CRITICAL'
      ? 'border-red-500/30 text-red-400 bg-red-500/10'
      : effectiveBand === 'HIGH'
      ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
      : effectiveBand === 'MEDIUM'
      ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10'
      : 'border-slate-500/30 text-slate-400 bg-slate-500/10';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-[#0d1527] border-l border-white/10 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-white/10 flex items-start justify-between bg-[#131d35]">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${bandColor}`}>
                {effectiveBand} (PI: {pri.scoreFormatted})
              </span>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-semibold bg-white/10 text-white">
                {issue.status}
              </span>
              {issue.slaBreached && (
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  SLA BREACHED
                </span>
              )}
              {issue.isSeed && (
                <span data-testid="seed-tag" className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SEED
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {issue.category.replace(/_/g, ' ')}
            </h2>
            <p className="text-xs font-mono text-white/50 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              {issue.address && issue.address.trim() && issue.address.toLowerCase() !== 'bengaluru' && !issue.address.toLowerCase().includes('pending')
                ? issue.address
                : `${issue.lat.toFixed(4)}° N, ${issue.lng.toFixed(4)}° E`}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            data-testid="close-drawer-button"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Action error banner */}
          {actionError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-white/40 uppercase tracking-wider block">Assigned Agency</span>
              <div className="flex items-center gap-2 text-white font-bold">
                <Building2 className="w-4 h-4 text-cyan-400" />
                {issue.agency?.name || 'Unassigned'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-white/40 uppercase tracking-wider block">Handoff Count</span>
              <div className="flex items-center gap-2 text-white font-bold">
                <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                {issue.handoffCount} handoffs
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-white/40 uppercase tracking-wider block">SLA Due At</span>
              <div className="flex items-center gap-2 text-white">
                <Clock className="w-4 h-4 text-rose-400" />
                {new Date(issue.slaDueAt).toLocaleString()}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-white/40 uppercase tracking-wider block">Reports & Evidence</span>
              <div className="flex items-center gap-2 text-white">
                <UserCheck className="w-4 h-4 text-lime-400" />
                {issue._count?.reports || (issue.reports?.length ?? 1)} evidence report(s)
              </div>
            </div>
          </div>

          {/* Recommended Repair Windows */}
          <RepairWindowBadge issueId={issue.id} variant="drawer" />

          {/* Live Traffic Intelligence & 24h Profile */}
          <LiveTrafficCard
            issueId={issue.id}
            variant="drawer"
            dayType={(issue.bestRepairWindow as any)?.dayType}
          />

          {/* Pavement Deterioration Intelligence Panel */}
          <div data-testid="pavement-deterioration-panel" className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Pavement Deterioration Intelligence
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                issue.deteriorationRisk === 'HIGH'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : issue.deteriorationRisk === 'MED'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}>
                {issue.deteriorationRisk || 'MODERATE'} Risk ({issue.deteriorationScore ?? 45}/100)
              </span>
            </div>
            <p className="text-xs font-mono text-white/80 leading-relaxed">
              {issue.expectedDaysToWorsen
                ? `Pavement worsening expected in ~${issue.expectedDaysToWorsen} days under current moisture and heavy vehicle stresses.`
                : 'Pavement stable; standard wear cycle.'}
            </p>
            {issue.isHotspot && (
              <div className="text-[11px] font-mono text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2.5 py-1 rounded-lg">
                Chronic Hotspot: ≥3 defects recorded on this road corridor in 90 days.
              </div>
            )}
          </div>

          {/* AI Analyst Desk Co-Pilot Card */}
          {analystSummary && !analystDismissed && (
            <div data-testid="ai-analyst-card" className="p-4 rounded-xl bg-gradient-to-br from-purple-950/30 to-indigo-950/30 border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  AI Analyst Assessment
                </span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="analyst-engine-badge"
                    className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-200 text-[10px] font-mono"
                  >
                    {analystSummary.engine || "Gemini 2.5 Flash"}
                  </span>
                  {analystSummary.priorityAdjustmentRecommended !== 0 && !priorityAccepted && (
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono font-bold">
                      Rec Adj: {analystSummary.priorityAdjustmentRecommended > 0 ? `+${analystSummary.priorityAdjustmentRecommended}` : analystSummary.priorityAdjustmentRecommended}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs font-mono text-purple-100/90 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-purple-900/40">
                {analystSummary.summary}
              </p>
              <div className="text-[11px] font-mono text-white/60 space-y-0.5">
                <div>Reasoning: {analystSummary.reasoning}</div>
                <div>Action: {analystSummary.suggestedAction}</div>
              </div>
              {!priorityAccepted ? (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="accept-priority-adj-btn"
                    onClick={async () => {
                      setPriorityAccepted(true);
                      try {
                        await fetch(`/api/issues/${issue.id}/actions`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'OVERRIDE_BAND',
                            band: issue.priority + analystSummary.priorityAdjustmentRecommended >= 70 ? 'CRITICAL' : 'HIGH',
                            note: `AI Analyst priority adjustment accepted: ${analystSummary.priorityAdjustmentRecommended > 0 ? '+' : ''}${analystSummary.priorityAdjustmentRecommended} points (${analystSummary.reasoning})`,
                          }),
                        });
                        onActionComplete();
                      } catch (err) {
                        console.error('Failed to accept AI adjustment', err);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-black text-xs font-mono font-bold transition-colors"
                  >
                    Accept ({analystSummary.priorityAdjustmentRecommended > 0 ? `+${analystSummary.priorityAdjustmentRecommended}` : analystSummary.priorityAdjustmentRecommended})
                  </button>
                  <button
                    type="button"
                    data-testid="dismiss-analyst-btn"
                    onClick={() => setAnalystDismissed(true)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs font-mono transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Adjustment applied to queue
                </div>
              )}
            </div>
          )}

          {/* Evidence photo preview */}
          {issue.reports && issue.reports[0]?.photoUrl && (
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50 block">
                Latest Evidence Photo
              </span>
              <div className="relative w-full h-48 rounded-xl overflow-hidden border border-white/10 bg-black/40">
                <Image
                  src={issue.reports[0].photoUrl}
                  alt="Evidence"
                  fill
                  className="object-cover"
                  unoptimized
                />
                {issue.reports[0].photoUrl.includes("photo-missing") && (
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-rose-600/90 text-white font-mono font-bold text-[10px] uppercase tracking-wider shadow-lg">
                    Photo Missing
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Execution Form */}
          {activeForm && (
            <form
              onSubmit={handleFormSubmit}
              className="p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                  Execute: {activeForm.replace(/_/g, ' ')}
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveForm(null)}
                  className="text-xs text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {(activeForm === 'ASSIGN_AGENCY' || activeForm === 'REASSIGN_AGENCY') && (
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white/70 block">Select Agency</label>
                  <select
                    value={selectedAgencyId}
                    onChange={(e) => setSelectedAgencyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Agency --</option>
                    {agencies.map((agency) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name} ({agency.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeForm === 'OVERRIDE_BAND' && (
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white/70 block">New Priority Band</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Band[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setSelectedBand(b)}
                        className={`py-2 rounded-lg text-xs font-mono font-bold border transition-colors ${
                          selectedBand === b
                            ? 'bg-cyan-500 text-black border-cyan-400'
                            : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
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
                  <span className="text-xs font-mono text-white/70 block">
                    Signed Claim Evidence (GPS Gated)
                  </span>
                  {showFixCamera ? (
                    <div className="rounded-xl overflow-hidden border border-white/10">
                      <CaptureCamera
                        role="CLAIM_FIX"
                        targetCoords={{ lat: issue.lat, lng: issue.lng }}
                        onCapture={(ev) => {
                          setCapturedFixEvidence(ev);
                          setShowFixCamera(false);
                        }}
                        onCancel={() => setShowFixCamera(false)}
                      />
                    </div>
                  ) : capturedFixEvidence ? (
                    <div className="space-y-2">
                      <div className="relative w-full h-40 rounded-xl overflow-hidden border border-emerald-500/30">
                        <Image
                          src={capturedFixEvidence.previewUrl}
                          alt="Captured fix"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFixCamera(true)}
                        className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" /> Retake Photo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowFixCamera(true)}
                      className="w-full py-3 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Launch Camera (Within 50m of Issue)
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <div>
                      <label className="text-[11px] font-mono text-white/60 block mb-1">Contractor Name</label>
                      <input
                        type="text"
                        value={contractorName}
                        onChange={(e) => setContractorName(e.target.value)}
                        placeholder="e.g. Cauvery Infrastructure"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-white/20 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-white/60 block mb-1">Tender ID</label>
                      <input
                        type="text"
                        value={tenderId}
                        onChange={(e) => setTenderId(e.target.value)}
                        placeholder="e.g. BBMP/EE/2026/W-10"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-white/20 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-mono text-white/60 block mb-1">Defect Liability Clause Ref</label>
                      <input
                        type="text"
                        value={liabilityClauseRef}
                        onChange={(e) => setLiabilityClauseRef(e.target.value)}
                        placeholder="e.g. Clause 17.2 of GCC"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-white/20 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(activeForm === 'REJECT' ||
                activeForm === 'REOPEN' ||
                activeForm === 'OVERRIDE_BAND' ||
                activeForm === 'CLAIM_FIX') && (
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white/70 block">
                    {activeForm === 'CLAIM_FIX'
                      ? 'Resolution Note (Optional)'
                      : 'Written Reason (Required)'}
                  </label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={`Enter explanation for ${activeForm.toLowerCase()}...`}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans placeholder:text-white/30 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveForm(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs font-mono hover:bg-cyan-400 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit {activeForm.replace(/_/g, ' ')}
                </button>
              </div>
            </form>
          )}

          {/* Action Buttons Toolbar */}
          {!activeForm && (
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50 block">
                Allowed State Actions
              </span>
              <div className="flex flex-wrap gap-2.5">
                {allowedActions.includes('CONFIRM') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('CONFIRM')}
                    className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm Issue
                  </button>
                )}

                {allowedActions.includes('ASSIGN_AGENCY') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('ASSIGN_AGENCY')}
                    className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Assign Agency
                  </button>
                )}

                {allowedActions.includes('REASSIGN_AGENCY') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('REASSIGN_AGENCY')}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Reassign Agency
                  </button>
                )}

                {allowedActions.includes('START_WORK') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('START_WORK')}
                    className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Work
                  </button>
                )}

                {allowedActions.includes('CLAIM_FIX') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('CLAIM_FIX')}
                    className="px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Claim Fix
                  </button>
                )}

                {allowedActions.includes('OVERRIDE_BAND') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('OVERRIDE_BAND')}
                    className="px-4 py-2 rounded-xl bg-white/10 text-white/80 border border-white/20 hover:bg-white/20 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Override Band
                  </button>
                )}

                {allowedActions.includes('REOPEN') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('REOPEN')}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reopen Issue
                  </button>
                )}

                {allowedActions.includes('REJECT') && (
                  <button
                    disabled={isPending}
                    onClick={() => handleActionClick('REJECT')}
                    className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject Issue
                  </button>
                )}

                {issue.status === 'REOPENED_IN_WARRANTY' && (
                  <a
                    href={`/api/issues/${issue.id}/liability`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Defect Liability Package
                  </a>
                )}

                {allowedActions.length === 0 && (
                  <div className="text-xs font-mono text-white/40 italic">
                    No further desk actions permitted for status {issue.status} (Terminal state)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Log / Audit Trail ("Who did what") */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Action Log & Audit Trail
              </h3>
              {loadingLogs && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
            </div>

            {logs.length === 0 && !loadingLogs ? (
              <p className="text-xs font-mono text-white/40 italic">No action log entries found.</p>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-white/10">
                {logs.map((log) => (
                  <div key={log.id} className="relative pl-8 space-y-1">
                    <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-cyan-500/30 border-2 border-cyan-400 -translate-x-1/2" />
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-cyan-300">{log.actorName}</span>
                      <span className="text-white/40">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-xs font-mono text-white/80">
                      Action: <span className="font-bold text-white">{log.action}</span>
                      {log.fromStatus && log.toStatus && log.fromStatus !== log.toStatus && (
                        <span className="text-white/50 text-[11px] ml-1.5">
                          ({log.fromStatus} &rarr; {log.toStatus})
                        </span>
                      )}
                    </div>
                    {log.note && (
                      <p className="text-xs text-white/60 bg-white/5 p-2 rounded-lg font-sans border border-white/5">
                        &quot;{log.note}&quot;
                      </p>
                    )}
                    {log.evidenceThumbnail && (
                      <div className="pt-1">
                        <div className="relative w-24 h-16 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                          <Image
                            src={log.evidenceThumbnail}
                            alt="Log evidence"
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

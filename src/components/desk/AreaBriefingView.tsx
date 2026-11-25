'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Send,
  Loader2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  RefreshCw,
  Cpu,
  Layers,
  UserX,
  Inbox,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { useGeoContext } from '@/context/GeoContext';
import { formatTimeIST } from '@/lib/time/ist';
import type { AreaBriefingTelemetry, BriefingPeriod } from '@/lib/desk/areaBriefing';

interface ChatMessage {
  id: string;
  sender: 'user' | 'analyst';
  text: string;
  engine?: string;
}

interface WardBriefApiResponse {
  wardCode?: string;
  wardName?: string;
  headline?: string;
  summary?: string;
  brief?: string;
  recommendations?: string[];
  recommendedActions?: string[];
  engine?: string;
  telemetry?: AreaBriefingTelemetry;
}

const PERIOD_OPTIONS: Array<{ id: BriefingPeriod; label: string }> = [
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
  { id: '6m', label: 'Last 6 Months' },
  { id: 'all', label: 'All Records' },
];

const QUICK_PROMPTS = [
  'Which ward currently has the most unresolved potholes?',
  'Which issues are approaching their SLA deadline?',
  'Which areas require drainage maintenance?',
  'Which issues need immediate dispatch?',
];

export function AreaBriefingView() {
  const { currentWard, corporations } = useGeoContext();

  const [period, setPeriod] = useState<BriefingPeriod>('30d');
  const [selectedCorpId, setSelectedCorpId] = useState<string>('ALL');
  const [briefData, setBriefData] = useState<WardBriefApiResponse | null>(null);
  const [telemetry, setTelemetry] = useState<AreaBriefingTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const seqRef = useRef(0);

  const wardCode = currentWard?.code || 'ALL';
  const wardId = currentWard?.id || 'zone-all';

  const loadBriefing = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({
        wardCode,
        wardId,
        period,
      });
      if (selectedCorpId !== 'ALL' && (wardCode === 'ALL' || wardId === 'zone-all')) {
        params.set('corporationId', selectedCorpId);
      }

      const res = await fetch(`/api/desk/analyst/brief?${params.toString()}`, {
        cache: 'no-store',
      });
      if (seq !== seqRef.current) return;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Failed to load Area Briefing (${res.status})`);
      }

      const data: WardBriefApiResponse = await res.json();
      if (seq !== seqRef.current) return;

      setBriefData(data);
      if (data.telemetry) {
        setTelemetry(data.telemetry);
        setLastUpdated(`${formatTimeIST(data.telemetry.refreshedAt)} IST`);
      } else {
        setLastUpdated(`${formatTimeIST(new Date())} IST`);
      }
    } catch (err) {
      if (seq !== seqRef.current) return;
      setLoadError(err instanceof Error ? err.message : 'Unable to retrieve area briefing.');
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
      }
    }
  }, [wardCode, wardId, period, selectedCorpId]);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const handleSend = async (promptOverride?: string) => {
    const q = (promptOverride ?? query).trim();
    if (!q || isAsking) return;

    const userMsg: ChatMessage = { id: String(Date.now()), sender: 'user', text: q };
    setMessages((prev) => [...prev, userMsg]);
    if (!promptOverride) setQuery('');
    setIsAsking(true);

    try {
      const res = await fetch('/api/desk/analyst/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          message: q,
          wardId: currentWard?.id,
          wardCode: currentWard?.code,
        }),
      });

      if (!res.ok) {
        throw new Error('Analyst service temporarily unavailable.');
      }

      const data = await res.json();
      const replyText =
        data.answer ||
        data.reply ||
        data.text ||
        data.response ||
        'No operational response returned.';
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'analyst',
          text: replyText,
          engine: data.engine,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'analyst',
          text:
            err instanceof Error
              ? err.message
              : 'Operational Analyst Assistant is temporarily unavailable.',
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const kpis = telemetry?.kpis;
  const scope = telemetry?.scope;
  const maxCategoryCount = Math.max(
    1,
    ...(telemetry?.overview.categoryDistribution.map((c) => c.count) ?? [1])
  );

  const kpiCards = [
    {
      label: 'Total Active Issues',
      value: kpis?.totalActiveIssues ?? 0,
      desc: 'Unresolved civic defects in scope',
      icon: Layers,
      style: 'bg-[#FAF9F5] border-[#DDDCD3] text-[#293732]',
    },
    {
      label: 'High / Critical Priority',
      value: kpis?.highCriticalPriority ?? 0,
      desc: 'Critical & high severity hazards',
      icon: AlertTriangle,
      style: 'bg-[#FBF1EF] border-[#F3D2CC] text-[#B76F60]',
    },
    {
      label: 'Awaiting Assignment',
      value: kpis?.awaitingAssignment ?? 0,
      desc: 'No agency or officer assigned',
      icon: UserX,
      style: 'bg-[#F0F5F8] border-[#D4E2E9] text-[#718F9E]',
    },
    {
      label: 'SLA At Risk',
      value: kpis?.slaAtRisk ?? 0,
      desc: 'Due within the next 12 hours',
      icon: Clock,
      style: 'bg-[#FDF7F0] border-[#F2DFCA] text-[#B68B63]',
    },
    {
      label: 'SLA Breached',
      value: kpis?.slaBreached ?? 0,
      desc: 'Exceeded statutory SLA deadline',
      icon: ShieldAlert,
      style: 'bg-[#FBF0EF] border-[#F1CCC8] text-[#B76F60]',
    },
    {
      label: 'Recently Resolved',
      value: kpis?.recentlyResolved ?? 0,
      desc: 'Independently verified fixed',
      icon: CheckCircle2,
      style: 'bg-[#EFF6F1] border-[#CFE4D4] text-[#537C60]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 2.1 Editorial Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_2px_10px_rgba(41,55,50,0.04)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider">
              EXECUTIVE OPERATIONAL INTELLIGENCE
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#293732] tracking-tight">
              Area Briefing
            </h1>
            <p className="text-xs sm:text-sm text-[#65736B] max-w-2xl">
              A consolidated operational view of municipal issues, repair performance, geographical
              hotspots and field response priorities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            {briefData?.engine && (
              <span className="px-2.5 py-1.5 rounded-xl bg-[#E9ECE6] border border-[#DDDCD3] text-[#355858] text-[11px] font-mono inline-flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>{briefData.engine}</span>
              </span>
            )}
            <span className="px-2.5 py-1.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-[#65736B] text-[11px] font-mono">
              {lastUpdated ? `Refreshed ${lastUpdated}` : 'Live Telemetry'}
            </span>
            <button
              type="button"
              onClick={() => void loadBriefing()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Briefing</span>
            </button>
          </div>
        </div>

        {/* Scope & Reporting Period Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E9ECE6]">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E5E9E3] text-[#293732] font-semibold">
              <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>{scope?.wardName || currentWard?.fullName || 'All Assigned Wards'}</span>
            </span>
            {scope?.corporationName && (
              <span className="px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#DDDCD3] text-[#527B7A] font-medium">
                {scope.corporationName}
              </span>
            )}
            {(wardCode === 'ALL' || wardId === 'zone-all') && corporations.length > 0 && (
              <select
                value={selectedCorpId}
                onChange={(e) => setSelectedCorpId(e.target.value)}
                aria-label="Filter by City Corporation"
                className="px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#DDDCD3] text-xs text-[#293732]"
              >
                <option value="ALL">All City Corporations</option>
                {corporations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl overflow-x-auto max-w-full">
            <Calendar className="w-3.5 h-3.5 text-[#65736B] ml-2 shrink-0 hidden sm:block" />
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  period === p.id
                    ? 'bg-white text-[#293732] shadow-xs border border-[#DDDCD3]'
                    : 'text-[#65736B] hover:text-[#293732]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* API Error State (never show zeros as valid telemetry when API failed) */}
      {loadError ? (
        <div
          role="alert"
          className="bg-[#FBF1EF] border border-[#EAC8C1] text-[#B76F60] rounded-2xl p-5 flex items-center justify-between gap-4 text-xs"
        >
          <div className="space-y-0.5">
            <div className="font-bold">Unable to load operational telemetry</div>
            <div>{loadError}</div>
          </div>
          <button
            type="button"
            onClick={() => void loadBriefing()}
            className="px-3.5 py-2 rounded-xl bg-white border border-[#EAC8C1] font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : loading && !telemetry ? (
        <div className="bg-white rounded-2xl p-12 border border-[#DDDCD3] flex flex-col items-center justify-center gap-3 text-sm text-[#65736B]">
          <Loader2 className="w-6 h-6 animate-spin text-[#527B7A]" />
          <span>Loading operational telemetry and generating briefing...</span>
        </div>
      ) : (
        <>
          {/* 2.2 Operational KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={`rounded-2xl p-4 border shadow-xs flex flex-col justify-between ${card.style}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#65736B] leading-tight">
                      {card.label}
                    </span>
                    <Icon className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <div className="mt-2 font-mono text-2xl sm:text-3xl font-bold">
                    {card.value}
                  </div>
                  <div className="text-[10px] text-[#65736B] mt-1 leading-snug">{card.desc}</div>
                </div>
              );
            })}
          </div>

          {/* Main Two-Column Intelligence Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Executive Summary, Operational Overview, Dispatch Allocations */}
            <div className="lg:col-span-7 space-y-6">
              {/* Executive Briefing Summary */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#527B7A]" />
                    <h2 className="font-display font-bold text-lg text-[#293732]">
                      {briefData?.headline || 'Executive Operational Summary'}
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-[#E5E9E3] text-[#355858] border border-[#DDDCD3]">
                    Grounded Telemetry
                  </span>
                </div>

                {loading ? (
                  <div className="py-4 flex items-center gap-2 text-xs text-[#65736B]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#527B7A]" />
                    <span>Generating executive summary...</span>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-[#293732] leading-relaxed bg-[#FAF9F5] p-4 rounded-xl border border-[#E5E9E3]">
                    {briefData?.brief ||
                      briefData?.summary ||
                      'Operational telemetry loaded for the selected scope.'}
                  </p>
                )}

                {briefData?.recommendedActions && briefData.recommendedActions.length > 0 && (
                  <ul className="space-y-2 text-xs text-[#293732]">
                    {briefData.recommendedActions.map((act, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#527B7A] mt-1.5 shrink-0" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 2.3 OPERATIONAL OVERVIEW */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#355858]">
                    OPERATIONAL OVERVIEW
                  </h2>
                  <span className="text-[11px] font-mono text-[#65736B]">
                    {telemetry?.overview.totalInPeriod ?? 0} total issues in period
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                    <div className="text-[10px] text-[#65736B] uppercase">Awaiting Verification</div>
                    <div className="font-mono font-bold text-lg text-[#718F9E] mt-0.5">
                      {telemetry?.overview.awaitingVerification ?? 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                    <div className="text-[10px] text-[#65736B] uppercase">Disputed Claims</div>
                    <div className="font-mono font-bold text-lg text-[#B76F60] mt-0.5">
                      {telemetry?.overview.disputedIssues ?? 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                    <div className="text-[10px] text-[#65736B] uppercase">Reopened Issues</div>
                    <div className="font-mono font-bold text-lg text-[#B68B63] mt-0.5">
                      {telemetry?.overview.reopenedIssues ?? 0}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="text-xs font-semibold text-[#293732]">
                    Active Issue Distribution by Category
                  </div>
                  {!telemetry || telemetry.overview.categoryDistribution.length === 0 ? (
                    <div className="p-4 rounded-xl bg-[#FAF9F5] border border-dashed border-[#DDDCD3] text-xs text-[#65736B] text-center">
                      No active issues recorded in this scope and reporting period.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {telemetry.overview.categoryDistribution.slice(0, 6).map((cat) => (
                        <div key={cat.category} className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="font-medium text-[#293732]">{cat.label}</span>
                            <span className="font-mono font-semibold text-[#355858]">{cat.count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[#E9ECE6] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#527B7A]"
                              style={{ width: `${Math.max(6, (cat.count / maxCategoryCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 2.5 Recommended Dispatch Allocations */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#293732]">
                      Recommended Dispatch Allocations
                    </h2>
                    <p className="text-[11px] text-[#65736B]">
                      Data-driven suggestions (not confirmed assignments until dispatched in Operations Queue).
                    </p>
                  </div>
                  <Link
                    href="/desk/dashboard"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#527B7A] hover:text-[#355858] shrink-0"
                  >
                    <span>Open Queue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {!telemetry || telemetry.dispatchSuggestions.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#FAF9F5] border border-dashed border-[#DDDCD3] text-center text-xs text-[#65736B]">
                    No dispatch recommendations available for this scope.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {telemetry.dispatchSuggestions.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#293732]">
                              {item.wardLabel} · {item.wardName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#E5E9E3] text-[#355858]">
                              {item.category}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                item.priority === 'CRITICAL' || item.priority === 'HIGH'
                                  ? 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]'
                                  : 'bg-white text-[#65736B] border-[#DDDCD3]'
                              }`}
                            >
                              {item.priority}
                            </span>
                          </div>
                          <div className="text-[#65736B]">{item.reason}</div>
                          {item.suggestedAgency && (
                            <div className="text-[11px] text-[#527B7A] font-medium">
                              Suggested Agency: {item.suggestedAgency}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-base text-[#293732]">
                            {item.eligibleCount}
                          </div>
                          <div className="text-[10px] text-[#65736B]">eligible</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Geographical Hotspots & Operational Analyst Assistant */}
            <div className="lg:col-span-5 space-y-6">
              {/* 2.4 Geographical Hotspots */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#293732]">
                      Geographical Hotspots
                    </h2>
                    <p className="text-[11px] text-[#65736B]">
                      Spatial clusters computed from verified issue coordinates
                    </p>
                  </div>
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[#E9ECE6] text-[#355858] border border-[#DDDCD3]">
                    {telemetry?.hotspots.length ?? 0} clusters
                  </span>
                </div>

                {!telemetry || telemetry.hotspots.length === 0 ? (
                  <div className="p-8 rounded-xl bg-[#FAF9F5] border border-dashed border-[#DDDCD3] text-center space-y-1.5">
                    <Inbox className="w-7 h-7 text-[#929B92] mx-auto" />
                    <div className="text-xs font-semibold text-[#293732]">No recorded hotspots</div>
                    <p className="text-[11px] text-[#65736B]">
                      No active issue clusters exist in {scope?.wardName || 'this scope'} for the selected period.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {telemetry.hotspots.map((hs) => (
                      <div
                        key={hs.id}
                        className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-[#293732] truncate">{hs.locality}</div>
                          <div className="text-[11px] text-[#65736B] truncate">
                            {hs.wardLabel} · {hs.wardName} · {hs.dominantCategory}
                          </div>
                          <div className="text-[10px] font-mono text-[#929B92]">
                            {hs.lat.toFixed(4)}, {hs.lng.toFixed(4)}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              hs.priorityLevel === 'CRITICAL' || hs.priorityLevel === 'HIGH'
                                ? 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]'
                                : 'bg-white text-[#355858] border-[#DDDCD3]'
                            }`}
                          >
                            {hs.priorityLevel}
                          </span>
                          <div className="font-mono font-bold text-[#293732]">
                            {hs.issueCount} {hs.issueCount === 1 ? 'issue' : 'issues'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phase 4: Operational Analyst Assistant */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-xs space-y-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#355858]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#527B7A]" />
                    <span>Operational Analyst Assistant</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#65736B]">Authorized Scope</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp}
                      type="button"
                      disabled={isAsking}
                      onClick={() => void handleSend(qp)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#293732] text-left transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {qp}
                    </button>
                  ))}
                </div>

                {messages.length > 0 && (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-3 rounded-xl text-xs ${
                          m.sender === 'user'
                            ? 'bg-[#E9ECE6] text-[#293732] ml-6 border border-[#DDDCD3]'
                            : 'bg-[#EAF2F0] text-[#293732] mr-6 border border-[#C2D7D1]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold text-[#65736B]">
                            {m.sender === 'user' ? 'Desk Officer' : 'Civic Intelligence'}
                          </span>
                          {m.engine && (
                            <span className="text-[9px] font-mono text-[#527B7A]">{m.engine}</span>
                          )}
                        </div>
                        <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                  }}
                  className="relative"
                >
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Ask about SLAs, hotspots, or dispatch in ${scope?.wardName || 'your area'}...`}
                    className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-[#293732] placeholder:text-[#929B92] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                  />
                  <button
                    type="submit"
                    disabled={isAsking || !query.trim()}
                    aria-label="Send query"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-[#355858] text-white hover:bg-[#293732] disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {isAsking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

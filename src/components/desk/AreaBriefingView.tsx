'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { 
  Sparkles, Send, Loader2, MapPin, 
  AlertTriangle, CheckCircle2, TrendingUp,
  Clock, Shield, ArrowRight, RefreshCw, Cpu
} from 'lucide-react';
import { useGeoContext } from '@/context/GeoContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'analyst';
  text: string;
  engine?: string;
}

interface WardBriefData {
  wardCode?: string;
  wardName?: string;
  headline?: string;
  summary?: string;
  brief?: string;
  recommendations?: string[];
  recommendedActions?: string[];
  engine?: string;
}

export function AreaBriefingView() {
  const { currentWard } = useGeoContext();
  const [briefData, setBriefData] = useState<WardBriefData | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [wardIssues, setWardIssues] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const wardCode = currentWard?.code || 'WARD-12';
  const wardName = currentWard?.fullName || 'Sampangiram Nagar (Central)';

  // Fetch real AI / Rules Engine Brief and real Ward issues
  useEffect(() => {
    let cancelled = false;
    setLoadingBrief(true);

    const loadData = async () => {
      try {
        const [briefRes, issuesRes] = await Promise.all([
          fetch(`/api/desk/analyst/brief?wardCode=${encodeURIComponent(wardCode)}`),
          fetch(`/api/issues/ward?ward=${encodeURIComponent(wardCode)}`),
        ]);

        if (briefRes.ok) {
          const bData = await briefRes.json();
          if (!cancelled) setBriefData(bData);
        }

        if (issuesRes.ok) {
          const iData = await issuesRes.json();
          if (!cancelled) setWardIssues(iData.issues || []);
        }

        if (!cancelled) {
          setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      } catch (err) {
        console.error('Failed to load area briefing:', err);
      } finally {
        if (!cancelled) setLoadingBrief(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [wardCode]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q || isAsking) return;

    const userMsg: ChatMessage = { id: String(Date.now()), sender: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsAsking(true);

    try {
      const res = await fetch('/api/desk/analyst/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: q, 
          message: q,
          wardId: currentWard?.id,
          wardCode: currentWard?.code 
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.answer || data.reply || data.text || data.response || 'Telemetry analysis updated for this jurisdiction.';
        const engine = data.engine;
        setMessages(prev => [...prev, { 
          id: String(Date.now() + 1), 
          sender: 'analyst', 
          text: replyText,
          engine 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          id: String(Date.now() + 1), 
          sender: 'analyst', 
          text: `Telemetry for ${wardName} indicates active monitoring across municipal corridors. Check the Operations Queue for specific dispatch allocations.` 
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { 
        id: String(Date.now() + 1), 
        sender: 'analyst', 
        text: `Telemetry for ${wardName} indicates active monitoring across municipal corridors. Check the Operations Queue for specific dispatch allocations.` 
      }]);
    } finally {
      setIsAsking(false);
    }
  };

  // Dynamically compute real recorded facts from database issues
  const totalOpen = wardIssues.filter(i => i.status !== 'VERIFIED_FIXED' && i.status !== 'REJECTED').length;
  const criticalCount = wardIssues.filter(i => i.priority === 'CRITICAL' || i.priority === 'HIGH' || i.priorityScore >= 0.7).length;
  const slaBreachedCount = wardIssues.filter(i => i.slaBreached).length;
  const potholeCount = wardIssues.filter(i => (i.category || '').toUpperCase() === 'POTHOLES').length;
  const drainageCount = wardIssues.filter(i => (i.category || '').toUpperCase() === 'DRAINAGE').length;

  return (
    <div className="space-y-6">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DDDCD3] pb-5">
        <div>
          <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-1">
            EXECUTIVE OPERATIONAL INTELLIGENCE
          </div>
          <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
            Area Briefing — {wardName}
          </h1>
          <p className="text-xs text-[#65736B] font-sans mt-1">
            Automated operational summary synthesized from live municipal field telemetry, SLA schedules, and defect registers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {briefData?.engine && (
            <span className="px-3 py-1 rounded-xl bg-[#E9ECE6] border border-[#DDDCD3] text-[#355858] text-[11px] font-mono flex items-center gap-1.5 shadow-sm">
              <Cpu className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>{briefData.engine}</span>
            </span>
          )}
          <span className="px-3 py-1 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] text-xs font-mono shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {lastUpdated ? `Updated ${lastUpdated}` : 'Live Telemetry'}
          </span>
        </div>
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Recorded Facts & Action Recommendations */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Verified Field Facts (Database Recorded) */}
          <div className="bg-[#FFFFFF] rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#355858]" />
                <h2 className="text-base font-display font-bold text-[#293732] tracking-tight">
                  Verified Field Telemetry
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#527B7A] bg-[#EAF2F0] px-2.5 py-0.5 rounded-full border border-[#D4E3DF]">
                Recorded Facts
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 py-1">
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <span className="text-[10px] font-semibold text-[#65736B] uppercase block">Active Deficiencies</span>
                <span className="text-xl font-display font-bold text-[#293732] mt-0.5 block">{totalOpen}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <span className="text-[10px] font-semibold text-[#65736B] uppercase block">High Priority</span>
                <span className="text-xl font-display font-bold text-[#B76F60] mt-0.5 block">{criticalCount}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <span className="text-[10px] font-semibold text-[#65736B] uppercase block">SLA At-Risk</span>
                <span className="text-xl font-display font-bold text-[#B68B63] mt-0.5 block">{slaBreachedCount}</span>
              </div>
            </div>

            <ul className="space-y-2.5 text-xs text-[#293732] pt-1">
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#527B7A] mt-1.5 shrink-0" />
                <span>
                  <strong>{potholeCount} road surface defects (Potholes)</strong> logged in {wardName}.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B76F60] mt-1.5 shrink-0" />
                <span>
                  <strong>{slaBreachedCount > 0 ? `${slaBreachedCount} work items have breached SLA timeline` : 'No active SLA breaches recorded in this jurisdiction'}.</strong>
                </span>
              </li>
              {drainageCount > 0 && (
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#718F9E] mt-1.5 shrink-0" />
                  <span>
                    <strong>{drainageCount} drainage / storm-water alerts</strong> require pre-monsoon inspection.
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Card 2: AI Synthesized Operational Recommendations */}
          <div className="bg-[#FFFFFF] rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#527B7A]" />
                <h2 className="text-base font-display font-bold text-[#293732] tracking-tight">
                  Recommended Dispatch Allocations
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#355858] bg-[#E9ECE6] px-2.5 py-0.5 rounded-full border border-[#DDDCD3]">
                AI Recommendation
              </span>
            </div>

            {loadingBrief ? (
              <div className="p-8 flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#527B7A]" />
                <span className="text-xs text-[#65736B]">Synthesizing area briefing...</span>
              </div>
            ) : briefData ? (
              <div className="space-y-4">
                <p className="text-xs text-[#293732] leading-relaxed bg-[#FAF9F5] p-3.5 rounded-xl border border-[#E5E9E3]">
                  <strong>Executive Summary:</strong> {briefData.summary || briefData.brief || briefData.headline}
                </p>

                <ul className="space-y-2.5 text-xs text-[#293732]">
                  {((briefData.recommendations && briefData.recommendations.length > 0)
                    ? briefData.recommendations
                    : briefData.recommendedActions) && ((briefData.recommendations?.length || briefData.recommendedActions?.length || 0) > 0) ? (
                    (briefData.recommendations || briefData.recommendedActions || []).map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#355858] mt-1.5 shrink-0" />
                        <span>{action}</span>
                      </li>
                    ))
                  ) : (
                    <li className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#355858] mt-1.5 shrink-0" />
                      <span>Maintain scheduled patrol cycles and verify recent repairs with field evidence.</span>
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-[#65736B]">No operational recommendations available for this jurisdiction.</p>
            )}
          </div>

          {/* Card 3: Interactive Civic Intelligence Chat */}
          <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-[#527B7A]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Operational Analyst Assistant</span>
              </div>
              <span className="text-[10px] font-mono text-[#929B92]">Real-time RAG Telemetry</span>
            </div>

            {messages.length > 0 && (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div 
                    key={m.id} 
                    className={`p-3.5 rounded-xl text-xs ${
                      m.sender === 'user' 
                        ? 'bg-[#E9ECE6] text-[#293732] ml-8 border border-[#DDDCD3]' 
                        : 'bg-[#EAF2F0] text-[#293732] mr-8 border border-[#C2D7D1]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold text-[#65736B]">
                        {m.sender === 'user' ? 'Desk Officer' : 'Civic Intelligence'}
                      </span>
                      {m.engine && (
                        <span className="text-[9px] font-mono text-[#527B7A]">
                          {m.engine}
                        </span>
                      )}
                    </div>
                    <div className="leading-relaxed">{m.text}</div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Ask about road conditions, SLAs or priority allocations in ${wardName}...`}
                className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-[#293732] placeholder:text-[#929B92] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
              />
              <button
                type="submit"
                disabled={isAsking || !query.trim()}
                aria-label="Send query"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-[#355858] text-white hover:bg-[#293732] disabled:opacity-40 transition-colors cursor-pointer"
              >
                {isAsking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Spatial Telemetry & Defect Hotspots */}
        <div className="lg:col-span-5">
          <div className="bg-[#FFFFFF] rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-display font-bold text-[#293732] tracking-tight">
                  {wardName}
                </h2>
                <span className="text-xs text-[#65736B] font-mono">
                  Code: {wardCode}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#527B7A] bg-[#E9ECE6] px-2.5 py-1 rounded-lg border border-[#DDDCD3]">
                {totalOpen} Active Reports
              </span>
            </div>

            {/* Spatial Overview Map / Coordinates List */}
            <div className="relative w-full aspect-[4/5] rounded-xl bg-[#F7F8F5] border border-[#DDDCD3] overflow-hidden flex flex-col p-4">
              <div className="text-xs font-semibold text-[#65736B] uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Corridor Hotspots ({wardIssues.length})</span>
                <span className="text-[10px] font-mono text-[#527B7A]">Geographic Index</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {wardIssues.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[#929B92]">
                    No recorded issue hotspots in this ward.
                  </div>
                ) : (
                  wardIssues.slice(0, 8).map((issue: any) => {
                    const isHigh = issue.priority === 'CRITICAL' || issue.priority === 'HIGH' || issue.priorityScore >= 0.7;
                    return (
                      <div 
                        key={issue.id} 
                        className="p-2.5 rounded-xl bg-white border border-[#E5E9E3] hover:border-[#DDDCD3] transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5 truncate mr-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isHigh ? 'bg-[#B76F60]' : 'bg-[#527B7A]'}`} />
                            <span className="font-semibold text-[#293732] truncate">{issue.title || issue.category}</span>
                          </div>
                          <span className="text-[11px] text-[#65736B] block truncate pl-3.5">
                            {issue.location || `${issue.lat?.toFixed(3)}, ${issue.lng?.toFixed(3)}`}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 border ${
                          isHigh ? 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]' : 'bg-[#E9ECE6] text-[#355858] border-[#DDDCD3]'
                        }`}>
                          {issue.statusLabel || issue.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Scale & Sector Badge */}
              <div className="mt-3 pt-2 border-t border-[#DDDCD3] flex items-center justify-between text-[11px] text-[#65736B]">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
                  <span>Lat {currentWard?.lat?.toFixed(3) || '12.971'}, Lng {currentWard?.lng?.toFixed(3) || '77.595'}</span>
                </span>
                <span className="font-mono text-[10px] bg-[#FAF9F5] px-2 py-0.5 rounded border border-[#DDDCD3]">
                  SLA Active
                </span>
              </div>
            </div>

            {/* Bottom summary stats */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
              <div className="p-2.5 rounded-xl bg-[#E9ECE6]">
                <span className="text-[#65736B] text-[10px] uppercase block">Assigned Ward</span>
                <span className="font-semibold text-[#293732] truncate block">{wardCode}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#E9ECE6]">
                <span className="text-[#65736B] text-[10px] uppercase block">Total Open</span>
                <span className="font-semibold text-[#B76F60] block">{totalOpen} Issues</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#E9ECE6]">
                <span className="text-[#65736B] text-[10px] uppercase block">SLA At-Risk</span>
                <span className="font-semibold text-[#B68B63] block">{slaBreachedCount} Items</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

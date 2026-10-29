'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Sparkles, Send, ChevronDown, ChevronUp, Loader2, FileText, CheckCircle2 } from 'lucide-react';

interface WardBriefData {
  wardCode: string;
  wardName: string;
  headline: string;
  brief: string;
  recommendedActions: string[];
  engine?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'analyst';
  text: string;
  citedIssueIds?: string[];
  suggestedFollowups?: string[];
  engine?: string;
}

export function DeskAnalystPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [brief, setBrief] = useState<WardBriefData | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchBrief = async () => {
      setLoadingBrief(true);
      try {
        const res = await fetch('/api/desk/analyst/brief');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setBrief(data);
        } else {
          // Fallback initial brief
          if (isMounted) {
            setBrief({
              wardCode: '150',
              wardName: 'Bellandur / Pilot Corridor',
              headline: 'Morning Brief: Pavement Intelligence Active',
              brief: 'Pilot corridor traffic profiles and pavement deterioration monitoring active. Dispatch asphalt crews during recommended night repair windows.',
              recommendedActions: [
                'Inspect drainage outlets along Outer Ring Road before forecast rain.',
                'Prioritize high-delay arterial potholes in next 24h repair window.',
              ],
            });
          }
        }
      } catch {
        if (isMounted) {
          setBrief({
            wardCode: '150',
            wardName: 'Bellandur / Pilot Corridor',
            headline: 'Morning Brief: Pavement Intelligence Active',
            brief: 'Pilot corridor traffic profiles and pavement deterioration monitoring active.',
            recommendedActions: ['Monitor open critical issues on arterial segments.'],
          });
        }
      } finally {
        if (isMounted) setLoadingBrief(false);
      }
    };

    fetchBrief();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSendQuery = async (customQuery?: string) => {
    const q = (customQuery || query).trim();
    if (!q || isAsking) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: q,
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setIsAsking(true);

    try {
      const res = await fetch('/api/desk/analyst/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'analyst',
          text: data.answer,
          citedIssueIds: data.citedIssueIds,
          suggestedFollowups: data.suggestedFollowups,
          engine: data.engine,
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        const errMsg: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'analyst',
          text: 'Unable to query analyst. All priority issues remain visible in your operations queue.',
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    } catch {
      const errMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'analyst',
        text: 'Network error communicating with analyst. Rules-based queue remains available.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div
      data-testid="desk-analyst-panel"
      className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/20 via-zinc-950/60 to-indigo-950/20 overflow-hidden shadow-xl"
    >
      {/* Header Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Desk AI Analyst
              </h3>
              <span className="px-2 py-0.2 rounded-full text-[9px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Co-Pilot
              </span>
            </div>
            <p className="text-[11px] font-mono text-white/50">
              Grounded intelligence: ward briefings, pavement decay analysis, and contractor auditing
            </p>
          </div>
        </div>
        <button
          type="button"
          className="p-1 rounded-lg text-white/50 hover:text-white"
        >
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 pt-0 space-y-4 border-t border-purple-500/20">
          {/* Daily Ward Brief Card */}
          {brief && (
            <div data-testid="ward-brief-card" className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-purple-200">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {brief.headline}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/40">
                    {brief.wardCode === 'ALL' ? 'Pilot Wards' : `Ward ${brief.wardCode}`}
                  </span>
                  <span
                    data-testid="brief-engine-badge"
                    className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-200 text-[9px] font-mono font-normal"
                  >
                    {brief.engine || "Gemini 2.5 Flash"}
                  </span>
                </div>
              </div>
              <p className="text-xs font-mono text-white/80 leading-relaxed">
                {brief.brief}
              </p>
              {brief.recommendedActions && brief.recommendedActions.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block">
                    Recommended Actions
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    {brief.recommendedActions.map((action, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-white/[0.03] border border-white/5 flex items-start gap-1.5 text-white/70"
                      >
                        <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat Messages Log */}
          {messages.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto p-2 rounded-xl bg-black/30 border border-white/5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-xl text-xs font-mono ${
                    m.sender === 'user'
                      ? 'bg-cyan-950/40 border border-cyan-800/40 text-cyan-200 ml-8'
                      : 'bg-purple-950/30 border border-purple-800/40 text-purple-100 mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-white/40 mb-1">
                    <span>{m.sender === 'user' ? 'Desk Officer' : 'AI Analyst'}</span>
                    {m.sender === 'analyst' && (
                      <span
                        data-testid="chat-engine-badge"
                        className="px-1.5 py-0.2 rounded bg-purple-500/20 border border-purple-500/30 text-purple-200 text-[9px] font-mono normal-case font-normal"
                      >
                        {m.engine || "Gemini 2.5 Flash"}
                      </span>
                    )}
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                  {m.citedIssueIds && m.citedIssueIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1 border-t border-white/10">
                      <span className="text-[9px] text-white/40 uppercase">Citations:</span>
                      {m.citedIssueIds.map((id) => (
                        <a
                          key={id}
                          href={`/issue/${id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-[10px] font-bold border border-cyan-500/30"
                        >
                          #{id}
                        </a>
                      ))}
                    </div>
                  )}
                  {m.suggestedFollowups && m.suggestedFollowups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.suggestedFollowups.map((f, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSendQuery(f)}
                          className="text-[10px] text-purple-300/80 hover:text-purple-200 underline text-left"
                        >
                          → {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Interactive Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendQuery();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              data-testid="analyst-chat-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask analyst: e.g. 'Which road corridors need attention before rain hits?'"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              data-testid="analyst-chat-submit"
              disabled={isAsking || !query.trim()}
              className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-black text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              {isAsking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

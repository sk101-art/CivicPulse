'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Send, Loader2, MapPin, 
  AlertTriangle, CheckCircle2, TrendingUp,
  Clock, Shield, ArrowRight
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'analyst';
  text: string;
}

export function AreaBriefingView() {
  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

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
        body: JSON.stringify({ message: q }),
      });
      if (res.ok) {
        const data = await res.json();
        const replyText = data.reply || data.text || 'Analysis updated based on latest field telemetry in Ward 12.';
        setMessages(prev => [...prev, { id: String(Date.now() + 1), sender: 'analyst', text: replyText }]);
      } else {
        setMessages(prev => [...prev, { 
          id: String(Date.now() + 1), 
          sender: 'analyst', 
          text: 'Telemetry for Ward 12 indicates concentrated traffic wear along MG Road. Field crew deployment recommended before afternoon peak.' 
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { 
        id: String(Date.now() + 1), 
        sender: 'analyst', 
        text: 'Telemetry for Ward 12 indicates concentrated traffic wear along MG Road. Field crew deployment recommended before afternoon peak.' 
      }]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editorial Header (Row 3, Col 4) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DDDCD3] pb-5">
        <div>
          <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
            Area Briefing – Ward 12
          </h1>
          <p className="text-xs text-[#65736B] font-sans mt-1">
            A quick overview of issues and recommended actions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] text-xs font-mono shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            Updated 10:30 AM
          </span>
        </div>
      </div>

      {/* Two-Column Grid (Row 3, Col 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Key Findings & Recommended Actions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Key Findings (Exact match to Row 3, Col 4) */}
          <div className="bg-[#FFFFFF] rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
            <h2 className="text-base font-display font-bold text-[#293732] tracking-tight">
              Key Findings
            </h2>
            <ul className="space-y-2.5 text-xs text-[#293732]">
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#527B7A] mt-1.5 shrink-0" />
                <span>Potholes have increased by 28% this week.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B76F60] mt-1.5 shrink-0" />
                <span>2 locations are at risk of SLA breach.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B68B63] mt-1.5 shrink-0" />
                <span>Drainage issues reported near East Park.</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Recommended Actions (Exact match to Row 3, Col 4) */}
          <div className="bg-[#FFFFFF] rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
            <h2 className="text-base font-display font-bold text-[#293732] tracking-tight">
              Recommended Actions
            </h2>
            <ul className="space-y-2.5 text-xs text-[#293732]">
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#355858] mt-1.5 shrink-0" />
                <span>Prioritize pothole repairs on MG Road.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#355858] mt-1.5 shrink-0" />
                <span>Assign an additional field team.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#355858] mt-1.5 shrink-0" />
                <span>Review drainage status after rainfall.</span>
              </li>
            </ul>
          </div>

          {/* Card 3: Interactive Analyst Query */}
          <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#527B7A]">
              <Sparkles className="w-4 h-4" />
              <span>Civic Intelligence Query</span>
            </div>

            {messages.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div 
                    key={m.id} 
                    className={`p-3 rounded-xl text-xs ${
                      m.sender === 'user' 
                        ? 'bg-[#E9ECE6] text-[#293732] ml-6' 
                        : 'bg-[#D4E3DF]/50 text-[#355858] mr-6 border border-[#D4E3DF]'
                    }`}
                  >
                    <span className="block text-[10px] uppercase font-bold text-[#65736B] mb-0.5">
                      {m.sender === 'user' ? 'Desk Officer' : 'Civic Intelligence'}
                    </span>
                    {m.text}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask Civic Intelligence about Ward 12..."
                className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-[#293732] placeholder:text-[#929B92] shadow-inner focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
              />
              <button
                type="submit"
                disabled={isAsking || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-[#355858] text-white hover:bg-[#293732] disabled:opacity-40 transition-colors"
              >
                {isAsking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Stylized Ward 12 Cartography (Exact match to Row 3, Col 4) */}
        <div className="lg:col-span-5">
          <div className="bg-[#FFFFFF] rounded-2xl p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-bold text-[#293732] tracking-tight">
                Ward 12 Spatial Map
              </h2>
              <span className="text-[11px] font-mono text-[#527B7A] bg-[#E9ECE6] px-2 py-0.5 rounded-md">
                Sector 12-C
              </span>
            </div>

            {/* Stylized SVG Map of Ward 12 */}
            <div className="relative w-full aspect-[4/5] rounded-xl bg-[#F7F8F5] border border-[#DDDCD3] overflow-hidden flex items-center justify-center p-4">
              <svg 
                viewBox="0 0 400 500" 
                className="w-full h-full"
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Background Grid Lines (Urban cartography) */}
                <defs>
                  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E5E9E3" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="400" height="500" fill="url(#grid)" />

                {/* Ward 12 Boundary Contour */}
                <path 
                  d="M 90 80 Q 200 40 310 90 Q 360 200 330 350 Q 280 460 170 440 Q 60 400 80 250 Z" 
                  fill="#527B7A" 
                  fillOpacity="0.08" 
                  stroke="#527B7A" 
                  strokeWidth="2" 
                  strokeDasharray="4 2"
                />

                {/* Road Network Lines */}
                {/* MG Road (Arterial Main) */}
                <path 
                  d="M 70 230 C 140 220 220 235 340 220" 
                  stroke="#87917B" 
                  strokeWidth="3.5" 
                  strokeLinecap="round"
                />
                {/* Residency Road */}
                <path 
                  d="M 120 120 C 180 180 210 280 260 420" 
                  stroke="#DDDCD3" 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                />
                {/* East Park Connector */}
                <path 
                  d="M 180 160 C 260 170 300 290 320 340" 
                  stroke="#DDDCD3" 
                  strokeWidth="2" 
                  strokeLinecap="round"
                />

                {/* Road Labels */}
                <text x="140" y="215" fill="#65736B" fontSize="9" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">MG ROAD</text>
                <text x="215" y="360" fill="#65736B" fontSize="8" fontFamily="sans-serif">EAST PARK</text>

                {/* Hotspot Issue Nodes with Tooltip Rings */}
                {/* MG Road Pothole (Critical) */}
                <g className="cursor-pointer">
                  <circle cx="210" cy="228" r="14" fill="#B76F60" fillOpacity="0.2" />
                  <circle cx="210" cy="228" r="6" fill="#B76F60" stroke="#FFFFFF" strokeWidth="2" />
                  <text x="222" y="232" fill="#B76F60" fontSize="9" fontFamily="monospace" fontWeight="bold">CP-0184 (Pothole)</text>
                </g>

                {/* East Park Drainage (High) */}
                <g className="cursor-pointer">
                  <circle cx="280" cy="310" r="12" fill="#B68B63" fillOpacity="0.2" />
                  <circle cx="280" cy="310" r="5" fill="#B68B63" stroke="#FFFFFF" strokeWidth="2" />
                  <text x="292" y="314" fill="#B68B63" fontSize="9" fontFamily="monospace" fontWeight="bold">CP-0186</text>
                </g>

                {/* Lake View Streetlight (Resolved) */}
                <g className="cursor-pointer">
                  <circle cx="150" cy="150" r="10" fill="#527B7A" fillOpacity="0.2" />
                  <circle cx="150" cy="150" r="5" fill="#527B7A" stroke="#FFFFFF" strokeWidth="2" />
                  <text x="162" y="154" fill="#527B7A" fontSize="9" fontFamily="monospace" fontWeight="bold">CP-0185</text>
                </g>
              </svg>

              {/* Map Scale & Legend */}
              <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl p-2.5 border border-[#DDDCD3] flex items-center justify-between text-[10px] text-[#65736B]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#B76F60]" /> Pothole
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#B68B63]" /> Drainage
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#527B7A]" /> Light
                  </span>
                </div>
                <span className="font-mono">Scale 1:15,000</span>
              </div>
            </div>

            {/* Bottom summary stats */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
              <div className="p-2.5 rounded-xl bg-[#E9ECE6]">
                <span className="text-[#65736B] text-[10px] uppercase block">Area</span>
                <span className="font-semibold text-[#293732]">4.8 km²</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#E9ECE6]">
                <span className="text-[#65736B] text-[10px] uppercase block">Active</span>
                <span className="font-semibold text-[#B76F60]">14 Issues</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#E9ECE6]">
                <span className="text-[#65736B] text-[10px] uppercase block">Resolution</span>
                <span className="font-semibold text-[#537C60]">82% Rate</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

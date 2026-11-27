'use client';

import React from 'react';
import Link from 'next/link';
import { FileBarChart2, Lightbulb, ArrowRight, ShieldCheck, Map as MapIcon } from 'lucide-react';
import type { WardBriefingOutput } from '@/lib/intelligence/wardAnalytics';

interface Props {
  briefing: WardBriefingOutput;
  wardName: string;
  role?: 'CITIZEN' | 'AUTHORITY';
  awaitingVerificationCount?: number;
}

export function AiWardBriefingCard({
  briefing,
  wardName,
  role = 'CITIZEN',
  awaitingVerificationCount = 0,
}: Props) {
  const isCitizen = role === 'CITIZEN';

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-[#527B7A]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              {isCitizen ? 'Ward Briefing & Insights' : 'Ward Briefing & Operational Analysis'}
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            {isCitizen
              ? `Deterministic summary of verified field reports, repair timelines, and verification needs in ${wardName}.`
              : `Algorithmic synthesis of verified field reports, SLA deadlines, and contractor claim statuses for ${wardName}.`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-2.5 py-0.5 rounded-full bg-[#E5E9E3] text-[#355858] text-[10px] font-mono font-bold border border-[#C2D7D1]">
            Deterministic Analytics Grounded
          </span>
        </div>
      </div>

      {/* Two Column Layout: Measured Facts on Left, Recommended Actions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Measured Facts (Col 7) */}
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] space-y-3">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#527B7A] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#527B7A]" />
            <span>Measured Telemetry Facts</span>
          </div>

          <h3 className="font-display font-bold text-base text-[#293732] leading-snug">
            {briefing.headline}
          </h3>

          <ul className="space-y-2.5 pt-1">
            {briefing.measuredFacts.map((fact, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-[#293732] leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-[#527B7A] mt-1.5 shrink-0" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Recommendations (Col 5) */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl bg-white border border-[#DDDCD3] shadow-xs space-y-3">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#293732] flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-[#B68B63]" />
            <span>Recommended Actions</span>
          </div>

          <div className="space-y-2.5">
            {briefing.recommendedActions.map((act, idx) => {
              const isCrit = act.priority === 'CRITICAL';
              const isHigh = act.priority === 'HIGH';

              const badgeColor = isCrit
                ? 'bg-[#FAF0EE] text-[#B76F60] border-[#F3D2CC]'
                : isHigh
                ? 'bg-[#FDF7F0] text-[#B68B63] border-[#F2DFCA]'
                : 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]';

              return (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-[#E8E7DF] bg-[#FAF9F5] hover:bg-[#F2F6F5] transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border uppercase tracking-wider ${badgeColor}`}>
                      {act.priority}
                    </span>
                    <span className="text-[10px] font-mono text-[#65736B]">
                      {act.affectedCategory}
                    </span>
                  </div>
                  <h4 className="font-semibold text-xs text-[#293732] pt-0.5">
                    {act.title}
                  </h4>
                  <p className="text-[11px] text-[#65736B] leading-snug">
                    {act.reason}
                  </p>
                </div>
              );
            })}
          </div>

          {isCitizen && (
            <div className="pt-2 border-t border-[#E8E7DF] flex flex-wrap gap-2">
              {awaitingVerificationCount > 0 && (
                <Link
                  href="/citizen/audit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF2F0] hover:bg-[#D4E3DF] border border-[#C2D7D1] text-[#355858] text-xs font-semibold transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verify {awaitingVerificationCount} Claimed {awaitingVerificationCount === 1 ? 'Repair' : 'Repairs'}</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
              <Link
                href="/citizen/map"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858] text-xs font-semibold transition-colors"
              >
                <MapIcon className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Explore on Map View</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

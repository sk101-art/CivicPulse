'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { Tier } from '@prisma/client';

interface CivicContributionCardProps {
  tier?: Tier | string;
  points?: number;
  reportsCount?: number;
  verificationsCount?: number;
}

export function CivicContributionCard({
  tier = 'CONTRIBUTOR',
  points = 1280,
  reportsCount = 24,
  verificationsCount = 17,
}: CivicContributionCardProps) {
  const maxPoints = 1500;
  const progressPercent = Math.min(100, Math.round((points / maxPoints) * 100));

  const displayTier = 
    tier === 'AMBASSADOR' ? 'Civic Ambassador' :
    tier === 'GUARDIAN' ? 'Civic Guardian' : 'Civic Contributor';
  
  const displayLevel = 
    tier === 'AMBASSADOR' ? 'Level 4' :
    tier === 'GUARDIAN' ? 'Level 3' : 'Level 3';

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] relative overflow-hidden space-y-4">
      {/* Background Architectural Watermark of Capitol / Civic Hall */}
      <div className="absolute right-3 top-2 w-36 h-28 opacity-15 pointer-events-none select-none">
        <svg viewBox="0 0 200 140" fill="none" stroke="#293732" strokeWidth="1.2">
          {/* Classical Dome */}
          <path d="M75,55 C75,20 125,20 125,55 Z" fill="#DDDCD3" fillOpacity="0.4" />
          <line x1="100" y1="20" x2="100" y2="12" strokeWidth="1.5" />
          <polygon points="60,65 100,45 140,65" fill="#DDDCD3" fillOpacity="0.5" />
          <rect x="62" y="65" width="76" height="50" fill="#FFFFFF" fillOpacity="0.8" />
          {[70, 82, 94, 106, 118, 130].map((x) => (
            <line key={x} x1={x} y1="65" x2={x} y2="115" stroke="#293732" strokeWidth="1" />
          ))}
          <rect x="50" y="115" width="100" height="6" fill="#DDDCD3" />
        </svg>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="font-display font-semibold text-base text-[#293732] tracking-tight">
            Your Contribution
          </h3>
          <Info className="w-3.5 h-3.5 text-[#929B92]" />
        </div>
      </div>

      {/* Level Badge and Description */}
      <div className="flex items-center gap-3.5 pt-1 relative z-10">
        {/* Golden Medal Seal with Laurel Wreath */}
        <div className="w-13 h-13 rounded-full overflow-hidden shadow-[0_4px_10px_rgba(158,115,51,0.25)] shrink-0 bg-[#C9984E]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/seal-contributor.png"
            alt="Civic Contributor Seal"
            className="w-full h-full object-cover"
          />
        </div>

        <div>
          <h4 className="font-semibold text-sm text-[#293732] leading-tight">
            {displayTier}
          </h4>
          <span className="text-xs text-[#65736B] font-medium">
            {displayLevel}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5 pt-1 relative z-10">
        <div className="flex justify-end text-[11px] font-mono text-[#65736B]">
          <span>{points.toLocaleString()} / {maxPoints.toLocaleString()} pts</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#E9ECE6] p-0.5 shadow-[inset_0_1px_2px_rgba(41,55,50,0.1)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#527B7A] to-[#355858] transition-all duration-500 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 3 Metrics Columns */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E5E9E3] text-center relative z-10">
        <div className="p-2 rounded-xl bg-[#F6F7F4]">
          <div className="font-mono font-bold text-base text-[#293732]">{reportsCount}</div>
          <div className="text-[11px] text-[#65736B] font-medium">Reports</div>
        </div>
        <div className="p-2 rounded-xl bg-[#F6F7F4]">
          <div className="font-mono font-bold text-base text-[#293732]">{verificationsCount}</div>
          <div className="text-[11px] text-[#65736B] font-medium">Verifications</div>
        </div>
        <div className="p-2 rounded-xl bg-[#F6F7F4]">
          <div className="font-mono font-bold text-base text-[#293732]">{points.toLocaleString()}</div>
          <div className="text-[11px] text-[#65736B] font-medium">Points</div>
        </div>
      </div>
    </div>
  );
}

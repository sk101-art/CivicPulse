'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Award } from 'lucide-react';
import { Tier } from '@prisma/client';
import { TIER_THRESHOLDS, nextTierProgress } from '@/lib/citizen/statsPure';

interface CivicContributionCardProps {
  tier?: Tier | string | null;
  points?: number | null;
  hasProfile?: boolean;
  dataUnavailable?: boolean;
}

const TIER_LABELS: Record<string, string> = {
  CITIZEN: 'Civic Member',
  CONTRIBUTOR: 'Civic Contributor',
  GUARDIAN: 'Civic Guardian',
  AMBASSADOR: 'Civic Ambassador',
};

export function CivicContributionCard({
  tier,
  points,
  hasProfile = false,
  dataUnavailable = false,
}: CivicContributionCardProps) {
  const actualPoints = Math.max(0, Math.floor(points ?? 0));
  const progress = nextTierProgress(actualPoints);
  const resolvedTier = (tier && TIER_LABELS[tier] ? tier : progress.tier) as string;
  const displayTier = TIER_LABELS[resolvedTier] || 'Civic Member';
  const nextThreshold = progress.next
    ? TIER_THRESHOLDS.find((t) => t.tier === progress.next)?.min ?? null
    : null;
  const nextTierLabel = progress.next ? TIER_LABELS[progress.next] : null;

  return (
    <div
      data-testid="civic-contribution-card"
      className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] relative overflow-hidden space-y-4"
    >
      {/* Background Architectural Watermark */}
      <div className="absolute right-3 top-2 w-36 h-28 opacity-15 pointer-events-none select-none">
        <svg viewBox="0 0 200 140" fill="none" stroke="#293732" strokeWidth="1.2">
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
      <div className="flex items-center justify-between relative z-10">
        <h3 className="font-display font-semibold text-base text-[#293732] tracking-tight">
          Your Contribution
        </h3>
        <Link
          href="/citizen/profile"
          className="text-xs font-semibold text-[#527B7A] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
        >
          <span>Profile</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Tier & Points */}
      <div className="flex items-center gap-3.5 relative z-10">
        <div className="w-12 h-12 rounded-full overflow-hidden shadow-[0_4px_10px_rgba(158,115,51,0.22)] shrink-0 bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center">
          {dataUnavailable ? <Award className="w-5 h-5 text-[#527B7A]" /> : hasProfile || actualPoints > 0 ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/images/seal-contributor.png"
              alt={displayTier}
              className="w-full h-full object-cover"
            />
          ) : (
            <Award className="w-5 h-5 text-[#527B7A]" />
          )}
        </div>

        <div className="min-w-0">
          <h4 className="font-semibold text-sm text-[#293732] leading-tight">
            {dataUnavailable ? 'Contribution data unavailable' : displayTier}
          </h4>
          <span className="text-xs font-mono text-[#65736B]">
            {dataUnavailable ? '—' : `${actualPoints.toLocaleString()} pts`}
          </span>
        </div>
      </div>

      {/* Real Tier Progression Bar */}
      <div className="space-y-1.5 relative z-10">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#65736B]">
          <span>
            {dataUnavailable ? 'Contribution progress unavailable' : nextTierLabel
              ? `${progress.pointsToNext.toLocaleString()} pts to ${nextTierLabel}`
              : 'Highest contributor tier reached'}
          </span>
          {!dataUnavailable && nextThreshold !== null && (
            <span>
              {actualPoints.toLocaleString()} / {nextThreshold.toLocaleString()} pts
            </span>
          )}
        </div>
        {!dataUnavailable && <div className="w-full h-2 rounded-full bg-[#E9ECE6] p-0.5 shadow-[inset_0_1px_2px_rgba(41,55,50,0.1)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#527B7A] to-[#355858] transition-all duration-500 shadow-sm"
            style={{ width: `${progress.pct}%` }}
          />
        </div>}
      </div>
    </div>
  );
}

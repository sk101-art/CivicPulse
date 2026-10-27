'use client';

import { Tier } from '@prisma/client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ReputationCardProps {
  tier: Tier;
  points: number;
}

interface ConfettiPiece {
  id: number;
  x: number;
  delay: number;
  rot: string;
  s: string;
}

const tierConfig = {
  CITIZEN:     { color: 'var(--tier-citizen)',     glow: 'rgba(161,161,170,0.22)', label: 'Citizen',     emoji: '⬡', next: 100 },
  CONTRIBUTOR: { color: 'var(--tier-contributor)', glow: 'rgba(0,212,255,0.22)',   label: 'Contributor', emoji: '◈', next: 500 },
  GUARDIAN:    { color: 'var(--tier-guardian)',    glow: 'rgba(196,254,0,0.22)',   label: 'Guardian',    emoji: '◆', next: 1000 },
  AMBASSADOR:  { color: 'var(--tier-ambassador)',  glow: 'rgba(255,184,0,0.22)',   label: 'Ambassador',  emoji: '★', next: Infinity },
};

export function ReputationCard({ tier, points }: ReputationCardProps) {
  const cfg = tierConfig[tier];
  const nextTierKeys = Object.keys(tierConfig) as Tier[];
  const nextIdx = nextTierKeys.indexOf(tier) + 1;
  const nextTier = nextTierKeys[nextIdx] ?? tier;
  const progress = cfg.next === Infinity ? 100 : Math.min(100, (points / cfg.next) * 100);

  const [burst, setBurst] = useState(false);
  const [confetti] = useState<ConfettiPiece[]>(() =>
    Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      x: ((i * 17 + 23) % 100),
      delay: ((i * 3) % 12) * 0.01,
      rot: (((i * 29) % 140) - 70).toFixed(2),
      s: (((i * 7) % 6) * 0.1 + 0.4).toFixed(2),
    }))
  );

  useEffect(() => {
    try {
      const key = 'civicpulse:last-tier';
      const last = window.localStorage.getItem(key);
      if (last && last !== tier) {
        window.setTimeout(() => {
          setBurst(true);
          window.setTimeout(() => setBurst(false), 900);
        }, 0);
      }
      window.localStorage.setItem(key, tier);
    } catch {
      // ignore storage failures
    }
  }, [tier]);

  return (
    <div
      className="rounded-3xl p-6 md:p-8 relative overflow-hidden h-full bg-card border border-white/5"
      style={{
        borderColor: `${cfg.color}25`,
        boxShadow: `0 10px 30px -10px ${cfg.color}20`
      }}
    >
      {/* Background glow orb */}
      <div
        className="absolute -right-16 -top-16 w-48 h-48 rounded-full pointer-events-none blur-3xl transition-all duration-700"
        style={{ background: cfg.glow }}
      />

      {/* Tier burst micro-interaction on tier upgrade */}
      {burst && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              initial={{ y: 80, opacity: 0, scale: 0.2 }}
              animate={{
                y: -140,
                opacity: [0, 1, 0],
                rotate: Number(c.rot),
                scale: Number(c.s),
              }}
              transition={{ duration: 0.8, delay: c.delay, ease: 'easeOut' }}
              className="absolute text-sm font-black"
              style={{
                left: `${c.x}%`,
                bottom: 0,
                color: cfg.color,
                textShadow: `0 0 10px ${cfg.color}`,
              }}
            >
              ✦
            </motion.span>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg shadow-inner"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${cfg.color}40`,
              color: cfg.color
            }}
          >
            {cfg.emoji}
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Reputation Rank</p>
            <h3 className="font-display font-black text-xl tracking-tight text-white">{cfg.label}</h3>
          </div>
        </div>

        <div className="text-right font-mono">
          <p className="text-[10px] uppercase tracking-widest text-text-muted">Total Score</p>
          <p className="text-2xl font-black text-white tracking-tight flex items-baseline justify-end gap-1">
            {points.toLocaleString()}
            <span className="text-xs text-text-muted font-normal">PTS</span>
          </p>
        </div>
      </div>

      {/* Progress to Next Tier */}
      <div className="space-y-3 relative z-10">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-text-muted">Progress to {tierConfig[nextTier].label}</span>
          <span className="font-bold text-white tabular-nums">
            {cfg.next === Infinity ? 'MAX TIER' : `${points} / ${cfg.next}`}
          </span>
        </div>

        <div className="h-2 rounded-full overflow-hidden bg-white/5 border border-white/5 relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full relative"
            style={{ background: cfg.color }}
          >
            {/* Shimmer on progress */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]" />
          </motion.div>
        </div>

        <p className="text-[11px] text-text-muted font-mono leading-relaxed pt-1">
          {cfg.next === Infinity
            ? 'You have reached the highest civic standing. Thank you for your leadership.'
            : `${Math.max(0, cfg.next - points)} PTS needed to unlock ${tierConfig[nextTier].label} status and priority verification.`}
        </p>
      </div>

      {/* Badges / Micro-perks */}
      <div className="grid grid-cols-2 gap-2 mt-6 pt-6 border-t border-white/5 relative z-10">
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted">Vote Weight</span>
          <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
            {tier === 'AMBASSADOR' ? '3.0x' : tier === 'GUARDIAN' ? '2.0x' : tier === 'CONTRIBUTOR' ? '1.5x' : '1.0x'} Impact
          </span>
        </div>
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted">Resolution SLA</span>
          <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
            {tier === 'AMBASSADOR' || tier === 'GUARDIAN' ? 'Priority Queue' : 'Standard Queue'}
          </span>
        </div>
      </div>
    </div>
  );
}

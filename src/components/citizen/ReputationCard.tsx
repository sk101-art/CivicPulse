'use client';

import { Tier } from '@prisma/client';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

interface ReputationCardProps {
  tier: Tier;
  points: number;
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
  const [confetti, setConfetti] = useState<any[]>([]);
  useEffect(() => {
    setConfetti(Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.12,
      rot: (Math.random() * 140 - 70).toFixed(2),
      s: (Math.random() * 0.6 + 0.4).toFixed(2),
    })));
  }, []);

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
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 80% 20%, ${cfg.glow} 0%, transparent 60%)`,
        }}
      />

      {/* Decorative background text */}
      <div className="absolute -bottom-8 -right-8 pointer-events-none opacity-[0.03] select-none">
        <span className="font-display font-black text-8xl uppercase tracking-tighter leading-none">
          {cfg.label}
        </span>
      </div>

      <div className="relative space-y-5">
        {/* Confetti burst on tier upgrade */}
        {burst && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {confetti.map((c) => (
              <motion.span
                key={c.id}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: [0, 1, 0], y: [0, -10, 220] }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: c.delay }}
                className="absolute top-10"
                style={{
                  left: `${c.x}%`,
                  width: 6,
                  height: 10,
                  borderRadius: 2,
                  background: c.id % 3 === 0 ? 'var(--accent-cyan)' : c.id % 3 === 1 ? 'var(--accent-lime)' : 'var(--accent-amber)',
                  transform: `rotate(${c.rot}deg) scale(${c.s})`,
                  boxShadow: '0 0 18px rgba(255,255,255,0.06)',
                }}
              />
            ))}
          </div>
        )}

        {/* Tier badge */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Reputation Tier
            </p>
            <div className="flex items-center gap-2">
              <motion.span
                animate={burst ? { scale: [1, 1.08, 1] } : { scale: [1, 1.02, 1] }}
                transition={burst ? { duration: 0.4 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-display font-black"
                style={{ background: `${cfg.color}15`, color: cfg.color }}
              >
                {cfg.emoji}
              </motion.span>
              <span className="font-display font-black text-xl text-white tracking-tight uppercase">{cfg.label}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display font-black text-3xl" style={{ color: cfg.color }}>
              {points.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>
              Intelligence XP
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="font-mono">Progress to {tierConfig[nextTier].label}</span>
            <span className="font-mono">
              {points} / {cfg.next === Infinity ? 'MAX' : cfg.next}
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${tier === 'AMBASSADOR' ? 100 : progress}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              className="h-full rounded-full relative"
              style={{
                background: `linear-gradient(90deg, ${cfg.color}99, ${cfg.color})`,
                boxShadow: `0 0 12px ${cfg.glow}`,
              }}
            >
              {/* Shimmer */}
              <div
                className="absolute inset-0 rounded-full animate-shimmer"
                style={{ opacity: 0.6 }}
              />
            </motion.div>
          </div>

          {/* Milestone markers */}
          <div className="relative h-4">
            {[25, 50, 75].map((m) => (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${m}%` }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: progress >= m ? cfg.color : 'rgba(255,255,255,0.14)',
                    boxShadow: progress >= m ? `0 0 10px ${cfg.glow}` : 'none',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest"
            style={{
              background: `${cfg.color}10`,
              border: `1px solid ${cfg.color}25`,
              color: cfg.color,
            }}
          >
            Rank: Top 15%
          </span>
          <span
            className="px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest"
            style={{
              background: 'rgba(0,245,212,0.08)',
              border: '1px solid rgba(0,245,212,0.2)',
              color: 'var(--accent-cyan)',
            }}
          >
            2× Points Active
          </span>
        </div>
      </div>
    </div>
  );
}

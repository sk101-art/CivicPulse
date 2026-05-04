'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

import { AlertTriangle, CheckCircle2, TrendingUp, BarChart3 } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  iconName: 'AlertTriangle' | 'CheckCircle2' | 'TrendingUp' | 'BarChart3';
  accentColor: string;
  delayMs?: number;
}

const iconMap = {
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  BarChart3,
};

function parseValue(value: string | number): { target: number; suffix: string } {
  if (typeof value === 'number') return { target: value, suffix: '' };
  const trimmed = value.trim();
  const hasPercent = trimmed.endsWith('%');
  const numeric = parseFloat(trimmed.replace('%', ''));
  if (Number.isFinite(numeric)) return { target: numeric, suffix: hasPercent ? '%' : '' };
  return { target: 0, suffix: '' };
}

export function KPICard({ label, value, iconName, accentColor, delayMs = 0 }: KPICardProps) {
  const Icon = iconMap[iconName];
  const { target, suffix } = useMemo(() => parseValue(value), [value]);
  const [display, setDisplay] = useState(0);
  const [pulse, setPulse] = useState(false);
  const lastTarget = useRef<number | null>(null);

  useEffect(() => {
    // Pulse when the value changes
    if (lastTarget.current !== null && lastTarget.current !== target) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 450);
      return () => window.clearTimeout(t);
    }
    lastTarget.current = target;
  }, [target]);

  useEffect(() => {
    const from = 0;
    const to = target;
    const duration = 800;
    const start = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const shown = suffix
    ? `${Math.round(display)}${suffix}`
    : Number.isInteger(target)
      ? `${Math.round(display)}`
      : `${display.toFixed(1)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: delayMs / 1000 }}
      className="rounded-3xl p-6 relative overflow-hidden group bg-card border transition-all duration-300 w-full max-w-sm mx-auto"
      style={{
        borderColor: `${accentColor}25`,
        boxShadow: `0 10px 30px -10px ${accentColor}10`
      }}
    >
      {/* Background glow */}
      <div
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${accentColor}10 0%, transparent 70%)` }}
      />

      <div className="relative flex flex-col items-center text-center space-y-4">
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
          style={{ 
            background: `${accentColor}10`, 
            border: `1px solid ${accentColor}25`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color: accentColor }} />
        </div>

        {/* Data */}
        <div className="space-y-1">
          <div
            className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold opacity-40"
          >
            {label}
          </div>
          <div
            className="text-3xl lg:text-4xl font-display font-bold tracking-tight"
            style={{ color: accentColor, fontVariantNumeric: 'tabular-nums' }}
          >
            <motion.span
              animate={pulse ? { scale: [1, 1.05, 1] } : { scale: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'inline-block' }}
            >
              {typeof value === 'string' && !Number.isFinite(parseFloat(value)) ? value : shown}
            </motion.span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

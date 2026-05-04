'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, AlertCircle } from 'lucide-react';

interface SLATimerProps {
  createdAt: Date;
  slaHours: number;
  isResolved: boolean;
}

export function SLATimer({ createdAt, slaHours, isResolved }: SLATimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    if (isResolved) return;

    const deadline = new Date(createdAt).getTime() + slaHours * 60 * 60 * 1000;
    
    const calculate = () => {
      const now = new Date().getTime();
      const diff = deadline - now;
      
      if (diff <= 0) {
        setIsBreached(true);
        setTimeLeft(0);
      } else {
        setIsBreached(false);
        setTimeLeft(diff);
      }
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [createdAt, slaHours, isResolved]);

  if (isResolved) return null;

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const isWarning = !isBreached && timeLeft > 0 && timeLeft < 4 * 60 * 60 * 1000;
  const isCritical = !isBreached && timeLeft > 0 && timeLeft < 1 * 60 * 60 * 1000;

  const color = isBreached
    ? 'var(--accent-magenta)'
    : isCritical
      ? 'var(--accent-magenta)'
      : isWarning
        ? 'var(--accent-amber)'
        : 'var(--text-secondary)';

  const timerText = `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <motion.div
      className="flex items-center gap-2"
      animate={
        isBreached
          ? { x: [0, -2, 2, -2, 2, 0] }
          : isCritical
            ? { scale: [1, 1.06, 1] }
            : isWarning
              ? { opacity: [1, 0.82, 1] }
              : {}
      }
      transition={
        isBreached
          ? { duration: 0.5, repeat: Infinity, repeatDelay: 1.4 }
          : isCritical
            ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
            : isWarning
              ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
              : undefined
      }
    >
      <Clock className="w-3 h-3" style={{ color }} />
      <div className="flex items-center gap-2">
        <div
          className="text-[10px] font-mono font-bold tabular-nums tracking-wider"
          style={{ color }}
        >
          {timerText}
        </div>
        {isBreached && (
          <span
            className="px-2 py-0.5 rounded text-[8px] font-mono font-black uppercase tracking-widest bg-magenta/10 border border-magenta/30 text-magenta"
          >
            SLA BREACHED
          </span>
        )}
      </div>
      {isBreached && (
        <motion.div
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AlertCircle className="w-3 h-3" style={{ color: 'var(--accent-magenta)' }} />
        </motion.div>
      )}
    </motion.div>
  );
}

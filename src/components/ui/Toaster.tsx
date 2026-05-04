'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Toast, useToastStore } from '@/lib/toast';

function colorFor(variant: Toast['variant']) {
  switch (variant) {
    case 'success':
      return 'var(--accent-lime)';
    case 'warning':
      return 'var(--accent-amber)';
    case 'error':
      return 'var(--accent-magenta)';
    default:
      return 'var(--accent-electric-blue)';
  }
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const reduced = useReducedMotion();

  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const currentTimers = timers.current;
    for (const t of toasts) {
      if (currentTimers.has(t.id)) continue;
      const id = window.setTimeout(() => {
        dismiss(t.id);
        currentTimers.delete(t.id);
      }, Math.max(500, t.durationMs));
      currentTimers.set(t.id, id);
    }

    return () => {
      for (const id of currentTimers.values()) window.clearTimeout(id);
      currentTimers.clear();
    };
  }, [toasts, dismiss]);

  return (
    <div className="fixed top-6 right-6 z-[2000] w-[360px] max-w-[calc(100vw-48px)] pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const accent = colorFor(t.variant);
          return (
            <motion.div
              key={t.id}
              initial={reduced ? false : { x: 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { x: 48, opacity: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
              className="mb-3 rounded-2xl overflow-hidden pointer-events-auto"
              style={{
                background: 'rgba(21,21,24,0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 50px rgba(0,0,0,0.55)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="flex gap-3 p-4">
                <div className="w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 18px ${accent}40` }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">{t.title}</div>
                  {t.description && (
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {t.description}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

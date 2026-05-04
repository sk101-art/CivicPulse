'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { staggerContainer, fadeUp, fadeIn, scaleIn, cardHover, buttonTap } from '@/lib/framer';

// Animated counter component
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = 0;
          const duration = 1200;
          const startTime = performance.now();
          const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

const features = [
  {
    icon: '📍',
    color: 'var(--accent-cyan)',
    title: 'Precision Geocoding',
    desc: 'Automatic GPS tagging with real-time address resolution. Every report is pinpoint accurate on the city map.',
  },
  {
    icon: '🤖',
    color: 'var(--accent-magenta)',
    title: 'AI Prioritization',
    desc: 'Local AI engine (Ollama) analyzes issue severity and community impact. Critical problems bubble to the top instantly.',
  },
  {
    icon: '🛣️',
    color: 'var(--accent-amber)',
    title: 'Route Optimizer',
    desc: 'OSRM-powered real-road routing with 3-pass hazard avoidance. Field crews get the safest, most efficient path.',
  },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function LandingPage() {
  const heroLines = useMemo(
    () => [
      'THE HEARTBEAT',
      'OF CIVIC',
      'ENGAGEMENT.',
    ],
    []
  );

  const [mock, setMock] = useState(() => ({
    open: 24,
    resolved: 183,
    breaches: 3,
    efficiency: 88,
    scores: [90, 72, 45],
  }));

  useEffect(() => {
    fetch('/api/stats').then(res => res.json()).then(data => {
      if (data.error) return;
      setMock({
        open: data.open || 0,
        resolved: data.resolved || 0,
        breaches: data.breaches || 0,
        efficiency: data.efficiency || 100,
        scores: [90, 72, 45],
      });
    }).catch(console.error);
    
    // Slight fluctuation to keep the "live" dashboard feel
    const id = setInterval(() => {
      setMock((prev) => {
        const scores = prev.scores.map((s) => clamp(s + (Math.random() > 0.5 ? 1 : -1), 18, 99));
        return { ...prev, scores };
      });
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="min-h-screen font-body overflow-x-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Gradient Mesh Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          style={{
            position: 'absolute', top: '-20%', left: '-10%',
            width: '600px', height: '600px',
            background: 'radial-gradient(circle, rgba(0,245,212,0.06) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: '-20%', right: '-10%',
            width: '700px', height: '700px',
            background: 'radial-gradient(circle, rgba(255,46,99,0.05) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center font-display font-black text-sm"
            style={{ background: 'var(--accent-cyan)', color: '#0A0A0B' }}
          >
            CP
          </div>
          <span className="font-display font-bold text-lg tracking-tight">
            Civic<span style={{ color: 'var(--accent-cyan)' }}>Pulse</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {['Features', 'Process', 'For Authorities'].map(link => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(' ', '-')}`}
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'white')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              {link}
            </a>
          ))}
        </div>

        <Link href="/login">
          <motion.button
            whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(0,245,212,0.3)' }}
            whileTap={buttonTap}
            className="neon-btn neon-btn-cyan px-5 py-2.5 text-sm font-display"
          >
            Launch App
          </motion.button>
        </Link>
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative z-10 min-h-[calc(100vh-88px)] flex items-center max-w-7xl mx-auto px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center w-full">

          {/* Left — Content (3/5) */}
          <div className="lg:col-span-3 space-y-8">
            {/* Status pill */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono uppercase tracking-widest"
              style={{
                background: 'rgba(0,245,212,0.08)',
                border: '1px solid rgba(0,245,212,0.2)',
                color: 'var(--accent-cyan)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: 'var(--accent-cyan)',
                  animation: 'pulse-cyan 2s infinite',
                }}
              />
              Live City Intelligence System
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1
                className="font-display font-black leading-[1.05] tracking-tight"
                style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
              >
                {heroLines.map((line, idx) => (
                  <motion.span
                    key={line}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + idx * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="block"
                  >
                    {line === 'OF CIVIC' ? (
                      <span style={{ color: 'var(--accent-cyan)' }}>{line}</span>
                    ) : (
                      line
                    )}
                  </motion.span>
                ))}
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="text-lg max-w-xl leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              Citizens report. AI prioritizes. Authorities optimize. Together we fix
              the city — pothole by pothole, streetlight by streetlight.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-wrap gap-4"
            >
              <Link href="/login">
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: '0 0 40px rgba(0,245,212,0.3)' }}
                  whileTap={buttonTap}
                  className="neon-btn neon-btn-cyan px-8 py-4 text-base font-display"
                >
                  Join as Citizen
                </motion.button>
              </Link>
              <Link href="/login">
                <motion.button
                  whileHover={{ scale: 1.04, backgroundColor: 'rgba(0,245,212,0.08)' }}
                  whileTap={buttonTap}
                  className="neon-btn neon-btn-outline px-8 py-4 text-base font-display"
                >
                  Authority Portal
                </motion.button>
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="flex flex-wrap gap-8 pt-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              {[
                { value: 2400, suffix: '+', label: 'Issues Resolved' },
                { value: 12, suffix: 'm', label: 'Avg. Response' },
                { value: 98, suffix: '%', label: 'Satisfaction' },
              ].map(stat => (
                <div key={stat.label}>
                  <div
                    className="text-3xl font-display font-black"
                    style={{ color: 'var(--accent-cyan)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    <Counter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <div
                    className="text-xs font-mono uppercase tracking-widest mt-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — Dashboard Mockup (2/5) */}
          <motion.div
            className="lg:col-span-2 relative"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="animate-float" style={{ transformOrigin: 'center' }}>
              <div
                className="rounded-3xl p-px glow-cyan"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,245,212,0.3), rgba(0,245,212,0.05) 50%, rgba(255,46,99,0.1))',
                  transform: 'perspective(1000px) rotateY(-10deg) rotateX(6deg) rotateZ(15deg)',
                }}
              >
                <div
                  className="rounded-3xl p-6 space-y-4"
                  style={{ background: 'var(--bg-card)' }}
                >
                  {/* Mock header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      CONTROL TERMINAL
                    </span>
                    <div className="flex gap-1.5">
                      {['#FF2E63', '#FFB800', '#C4FE00'].map(c => (
                        <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                      ))}
                    </div>
                  </div>

                  {/* Mock KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'OPEN', val: String(mock.open), color: 'var(--accent-electric-blue)' },
                      { label: 'RESOLVED', val: String(mock.resolved), color: 'var(--accent-lime)' },
                      { label: 'SLA BREACH', val: String(mock.breaches), color: 'var(--accent-magenta)' },
                      { label: 'EFFICIENCY', val: `${mock.efficiency}%`, color: 'var(--accent-amber)' },
                    ].map(k => (
                      <div
                        key={k.label}
                        className="rounded-xl p-3"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {k.label}
                        </div>
                        <div className="text-2xl font-display font-black mt-1" style={{ color: k.color }}>
                          {k.val}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mock issue list */}
                  <div className="space-y-2">
                    {[
                      { title: 'Pothole Grid — MG Road', score: mock.scores[0], color: 'var(--accent-magenta)' },
                      { title: 'Broken Streetlight', score: mock.scores[1], color: 'var(--accent-amber)' },
                      { title: 'Drainage Block', score: mock.scores[2], color: 'var(--accent-electric-blue)' },
                    ].map(item => (
                      <div
                        key={item.title}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <span className="text-xs font-medium text-white/70">{item.title}</span>
                        <span
                          className="text-xs font-display font-bold"
                          style={{ color: item.color }}
                        >
                          {item.score}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Floating notification */}
                  <div
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{
                      background: 'rgba(0,245,212,0.08)',
                      border: '1px solid rgba(0,245,212,0.2)',
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse-cyan"
                      style={{ background: 'var(--accent-cyan)' }}
                    />
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                        New Issue Reported
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        Ward 12 • 200m from depot
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-8 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div
            className="inline-block text-xs font-mono uppercase tracking-[0.2em] px-4 py-1.5 rounded-full mb-4"
            style={{
              color: 'var(--accent-cyan)',
              background: 'rgba(0,245,212,0.08)',
              border: '1px solid rgba(0,245,212,0.15)',
            }}
          >
            Platform Features
          </div>
          <h2 className="font-display font-black text-4xl text-white">Built for Urban Reality</h2>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {features.map((f, idx) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={cardHover}
              className={`neon-card p-8 space-y-5 cursor-default ${
                idx % 2 === 0 ? 'md:translate-y-0' : 'md:translate-y-6'
              }`}
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = `${f.color}30`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)';
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}
              >
                {f.icon}
              </div>
              <h3 className="font-display font-bold text-xl text-white">{f.title}</h3>
              <p className="leading-relaxed text-sm" style={{ color: 'var(--text-secondary)' }}>
                {f.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── PROCESS ── */}
      <section id="process" className="relative z-10 max-w-7xl mx-auto px-8 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div
            className="inline-block text-xs font-mono uppercase tracking-[0.2em] px-4 py-1.5 rounded-full mb-4"
            style={{
              color: 'var(--accent-amber)',
              background: 'rgba(255,184,0,0.08)',
              border: '1px solid rgba(255,184,0,0.15)',
            }}
          >
            How It Works
          </div>
          <h2 className="font-display font-black text-4xl text-white">Four Steps to Resolution</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { step: '01', color: 'var(--accent-cyan)', icon: '📍', title: 'Citizen Reports', desc: 'GPS-tagged issue filed in seconds via mobile or browser' },
            { step: '02', color: 'var(--accent-magenta)', icon: '🤖', title: 'AI Scores It', desc: 'Local AI analyzes severity. Critical issues surface immediately' },
            { step: '03', color: 'var(--accent-amber)', icon: '🏛️', title: 'Authority Acts', desc: 'Department sees ranked issues and optimizes their patrol route' },
            { step: '04', color: 'var(--accent-lime)', icon: '✅', title: 'Issue Resolved', desc: 'Citizen earns XP, community sees it fixed, city gets healthier' },
          ].map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="neon-card p-6 space-y-4 relative"
            >
              <div
                className="text-5xl font-display font-black leading-none"
                style={{ color: `${s.color}20` }}
              >
                {s.step}
              </div>
              <div className="text-3xl">{s.icon}</div>
              <h3 className="font-display font-bold text-lg" style={{ color: s.color }}>
                {s.title}
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FOR AUTHORITIES ── */}
      <section id="for-authorities" className="relative z-10 max-w-7xl mx-auto px-8 py-24">
        <div
          className="rounded-3xl p-12 relative overflow-hidden"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(0,212,255,0.15)',
          }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(circle at 80% 50%, rgba(0,212,255,0.06) 0%, transparent 60%)',
            }}
          />
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div
                className="inline-block text-xs font-mono uppercase tracking-[0.2em] px-4 py-1.5 rounded-full"
                style={{
                  color: 'var(--accent-electric-blue)',
                  background: 'rgba(0,212,255,0.08)',
                  border: '1px solid rgba(0,212,255,0.2)',
                }}
              >
                For Authorities
              </div>
              <h2 className="font-display font-black text-4xl text-white">
                Command Center
                <br />
                <span style={{ color: 'var(--accent-electric-blue)' }}>Intelligence</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Real-time KPIs, AI-prioritized queues, SLA tracking, and an OSRM route optimizer
                that automatically avoids active civic hazards.
              </p>
              <Link href="/login">
                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(0,212,255,0.25)' }}
                  whileTap={buttonTap}
                  className="neon-btn px-8 py-4 text-base font-display"
                  style={{
                    background: 'var(--accent-electric-blue)',
                    color: '#0A0A0B',
                    borderRadius: 16,
                  }}
                >
                  Enter Authority Portal
                </motion.button>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Priority Queue', desc: 'AI-ranked, real-time', color: 'var(--accent-electric-blue)' },
                { label: 'Route Optimizer', desc: 'Hazard-aware OSRM', color: 'var(--accent-cyan)' },
                { label: 'SLA Tracking', desc: 'Live countdown timers', color: 'var(--accent-amber)' },
                { label: 'Map-based Filing', desc: 'Click to report issues', color: 'var(--accent-lime)' },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-2xl p-4 space-y-2"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="text-xs font-display font-bold" style={{ color: item.color }}>
                    {item.label}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t px-8 py-10 max-w-7xl mx-auto flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-display font-black text-xs"
            style={{ background: 'var(--accent-cyan)', color: '#0A0A0B' }}
          >
            CP
          </div>
          <span className="font-display font-bold text-sm text-white/40">
            CivicPulse
          </span>
        </div>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          © 2026 CivicPulse Engine • Built for Smarter Cities
        </p>
      </footer>
    </div>
  );
}

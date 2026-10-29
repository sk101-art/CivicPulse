'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, User, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { buttonTap, modalContent } from '@/lib/framer';

function FloatingField({
  label,
  name,
  type,
  value,
  onChange,
  placeholder,
  error,
  hint,
  right,
  autoComplete,
  icon: Icon
}: {
  label: string;
  name?: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  autoComplete?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'rgba(255,46,99,0.65)' : focused ? 'rgba(0,245,212,0.4)' : 'rgba(255,255,255,0.08)';
  
  return (
    <div className="space-y-2 relative z-10 w-full group">
      <div className="flex items-center justify-between">
        <label
          className="block text-[9px] font-mono uppercase tracking-[0.4em] font-black text-white/40"
          style={{ 
            color: focused || value.length > 0 ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)', 
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {label}
        </label>
        {hint}
      </div>
      <div className="relative">
        {Icon && (
          <div className={`absolute ${right ? 'right-14' : 'right-5'} top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-cyan/60 transition-colors`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          name={name}
          type={type}
          required
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full ${Icon ? (right ? 'pr-24 pl-5' : 'pr-12 pl-5') : 'px-5'} py-4 text-sm rounded-xl outline-none transition-all duration-500 font-mono tracking-tight`}
          style={{
            background: 'rgba(10,10,11,0.95)',
            border: `1px solid ${border}`,
            color: 'white',
          }}
        />
        {right}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [role, setRole] = useState<'citizen' | 'authority'>('citizen');
  const [isSignUp, setIsSignUp] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('signup') === 'true' || params.get('mode') === 'signup' || params.get('tab') === 'signup';
    }
    return false;
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Pre-flight client-side validation for sign-up
    if (isSignUp) {
      const cleanName = name.trim();
      const cleanEmail = email.trim();
      if (!cleanName) {
        setError('Please enter your full name');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setLoading(false);
        return;
      }
      if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        setError('Please enter a valid email address');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setLoading(false);
        return;
      }
    }

    try {
      const cleanEmail = email.trim().toLowerCase();

      if (isSignUp) {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: cleanEmail, password }),
        });

        if (!regRes.ok) {
          const text = await regRes.text();
          let msg = text;
          try {
            const json = JSON.parse(text);
            msg = json.error || json.message || text;
          } catch {
            // plain text response
          }
          throw new Error(msg || 'Registration failed. Please try again.');
        }
      }

      const result = await signIn('credentials', {
        redirect: false,
        email: cleanEmail,
        password,
      });

      if (result?.error) {
        throw new Error(
          isSignUp 
            ? 'Account was created, but automatic sign-in failed. Please click LOGIN to sign in.' 
            : 'Invalid credentials. Access denied.'
        );
      } else {
        setSuccess(true);
        const res = await fetch('/api/auth/session').catch(() => null);
        const session = res?.ok ? await res.json().catch(() => null) : null;
        const actualRole = session?.user?.role || (role === 'authority' ? 'AUTHORITY' : 'CITIZEN');
        const target = actualRole === 'AUTHORITY' ? '/desk' : '/citizen/dashboard';
        
        setTimeout(() => {
          window.location.href = target;
        }, 500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#0A0A0B] relative overflow-hidden font-mono selection:bg-cyan/30">
      {/* Texture Layer */}
      <div className="absolute inset-0 opacity-5 pointer-events-none mix-blend-overlay" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/carbon-fibre.png")' }} />
      
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        variants={modalContent}
        initial="hidden"
        animate={success ? { opacity: 0, scale: 0.98, transition: { duration: 0.5 } } : 'visible'}
        className="relative w-full max-w-[440px] space-y-8 z-10"
      >
        {/* Branding Header */}
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-2"
          >
            {/* Glowing Icon */}
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center font-black text-2xl shadow-[0_0_40px_rgba(0,245,212,0.4)] border border-cyan/30"
              style={{ background: 'var(--accent-cyan)', color: 'white' }}
            >
              CP
            </div>
            
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tighter text-white text-center">
                CIVIC PULSE
              </h1>
              <div className="flex items-center justify-center gap-2 text-[10px] text-white/40 tracking-[0.4em] font-black">
                <span>MUNICIPAL ROAD TRUTH LEDGER</span>
                <span className="text-white/20">|</span>
                <span>SYSTEM ACCESS</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Auth Interface */}
        <div className={`space-y-8 transition-all duration-500 ${shake ? 'animate-shake' : ''}`}>
          
          <div className="space-y-6">
            {/* Role Selection (Grey Panel) */}
            <div
              className="relative flex rounded-lg p-1 gap-1"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <button
                type="button"
                onClick={() => { setRole('citizen'); setIsSignUp(false); setError(''); }}
                className={`relative z-10 flex-1 py-3 text-[11px] font-black uppercase tracking-[0.2em] rounded transition-all duration-300 ${
                  role === 'citizen' ? 'bg-[#2A2A2D] text-white' : 'text-white/30 hover:text-white/50'
                }`}
              >
                CITIZEN
              </button>
              <button
                type="button"
                onClick={() => { setRole('authority'); setIsSignUp(false); setError(''); }}
                className={`relative z-10 flex-1 py-3 text-[11px] font-black uppercase tracking-[0.2em] rounded transition-all duration-300 ${
                  role === 'authority' ? 'bg-[#2A2A2D] text-white' : 'text-white/30 hover:text-white/50'
                }`}
              >
                AUTHORITY
              </button>
            </div>

            {/* Sub-toggle (White Text) */}
            <div className="flex justify-center gap-10">
              <button 
                type="button"
                onClick={() => { setIsSignUp(false); setError(''); }}
                className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${!isSignUp ? 'text-white underline underline-offset-8 decoration-cyan/50' : 'text-white/30 hover:text-white/50'}`}
              >
                LOGIN
              </button>
              {role === 'citizen' ? (
                <button
                  type="button"
                  onClick={() => { setIsSignUp(true); setError(''); }}
                  className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${isSignUp ? 'text-white underline underline-offset-8 decoration-cyan/50' : 'text-white/30 hover:text-white/50'}`}
                >
                  CREATE ACCOUNT
                </button>
              ) : (
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">
                  Desk accounts are issued by the administrator
                </span>
              )}
            </div>
          </div>

          {/* Authentication Form */}
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-5">
              {isSignUp && (
                <FloatingField
                  label="FULL NAME"
                  name="name"
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="e.g. Sujay Kumar"
                  autoComplete="name"
                  icon={User}
                />
              )}

              <FloatingField
                label="EMAIL ADDRESS"
                name="email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder={isSignUp ? "your.email@example.com" : "you@example.com"}
                error={Boolean(error)}
                autoComplete="email"
                icon={Mail}
              />

              <FloatingField
                label={isSignUp ? "PASSWORD (MIN. 8 CHARS)" : "PASSWORD"}
                name="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
                error={Boolean(error)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                icon={Lock}
                hint={
                  isSignUp ? (
                    <span
                      className={`text-[9px] font-mono tracking-tight flex items-center gap-1.5 transition-colors ${
                        password.length >= 8 ? 'text-emerald-400 font-bold' : 'text-white/40'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          password.length >= 8 ? 'bg-emerald-400' : 'bg-white/20'
                        }`}
                      />
                      {password.length >= 8 ? '8+ chars (Valid)' : `Min. 8 chars (${password.length}/8)`}
                    </span>
                  ) : undefined
                }
                right={
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 hover:text-cyan transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>

            {/* Error Feedback Banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] leading-relaxed">
                  <span className="font-bold tracking-wider uppercase block text-rose-400 text-[9px] mb-0.5">
                    {isSignUp ? 'Registration Error' : 'Authentication Error'}
                  </span>
                  <span>{error}</span>
                  {error.toLowerCase().includes('already exists') && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(false);
                        setError('');
                      }}
                      className="block mt-1.5 text-cyan hover:underline underline-offset-2 font-bold"
                    >
                      Switch to LOGIN to sign in with this email →
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Primary Action Button */}
            <div className="pt-2">
              <motion.button
                type="submit"
                disabled={loading}
                whileTap={loading ? {} : buttonTap}
                className="w-full py-5 rounded-lg text-[11px] font-black uppercase tracking-[0.4em] transition-all duration-500 flex items-center justify-center gap-4 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--accent-cyan)',
                  color: 'white',
                  boxShadow: '0 0 30px rgba(0,245,212,0.15)'
                }}
              >
                {success ? (
                  <>ACCESS GRANTED</>
                ) : loading ? (
                  <>VERIFYING...</>
                ) : (
                  <>
                    {isSignUp ? 'INITIATE REGISTRATION' : `INITIATE ${role.toUpperCase()} SESSION`}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Metadata Footer (Within Card flow) */}
          <div className="space-y-8 pt-4">
             <div className="text-center">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">
                   SECURE TUNNEL V7.4.2 ENABLED
                </p>
             </div>
             
             <div className="flex justify-center gap-6 opacity-30 text-[9px] font-black uppercase tracking-[0.2em] text-white">
                <span>SSL_ENCRYPTED</span>
                <span>|</span>
                <span>GRID_MONITORED</span>
                <span>|</span>
                <span>AI_VERIFIED</span>
             </div>

             <p className="text-center text-[9px] font-black tracking-[0.3em] uppercase text-white/20">
               © 2026 CIVICPULSE METROPOLITAN GRID
             </p>
          </div>
        </div>
      </motion.div>

      {/* Bottom Right 'N' Logo */}
      <div className="fixed bottom-10 right-10 opacity-20 pointer-events-none">
         <div className="w-8 h-8 border border-white flex items-center justify-center font-black text-sm text-white">
            N
         </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff, CheckCircle2, Shield, User, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { buttonTap, modalContent, SMOOTH } from '@/lib/framer';

function FloatingField({
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  right,
  autoComplete,
  icon: Icon
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
  right?: React.ReactNode;
  autoComplete?: string;
  icon?: any;
}) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'rgba(255,46,99,0.55)' : focused ? 'rgba(0,245,212,0.4)' : 'rgba(255,255,255,0.08)';
  
  return (
    <div className="space-y-2 relative z-10 w-full group">
      <label
        className="block text-[9px] font-mono uppercase tracking-[0.4em] font-black text-white/40"
        style={{ 
          color: focused || value.length > 0 ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)', 
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <div className={`absolute ${right ? 'right-14' : 'right-5'} top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-cyan/60 transition-colors`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
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
  const router = useRouter();
  const [role, setRole] = useState<'citizen' | 'authority'>('citizen');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const isCitizen = role === 'citizen';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, role: role.toUpperCase() }),
        });

        if (!regRes.ok) {
          const msg = await regRes.text();
          throw new Error(msg || 'Registration failed');
        }
      }

      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        throw new Error('Invalid credentials. Access denied.');
      } else {
        setSuccess(true);
        const res = await fetch('/api/auth/session');
        const session = await res.json();
        const actualRole = session?.user?.role || 'CITIZEN';
        const target = actualRole === 'AUTHORITY' ? '/authority/dashboard' : '/citizen/dashboard';
        
        setTimeout(() => {
          router.push(target);
        }, 800);
      }
    } catch (err: any) {
      setError(err.message);
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
                <span>METROPOLITAN SECURITY GRID</span>
                <span className="text-white/20">|</span>
                <span>SYSTEM ACCESS</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Auth Interface */}
        <div className={`space-y-10 transition-all duration-500 ${shake ? 'animate-shake' : ''}`}>
          
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
                onClick={() => setIsSignUp(false)}
                className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${!isSignUp ? 'text-white underline underline-offset-8 decoration-cyan/50' : 'text-white/30 hover:text-white/50'}`}
              >
                LOGIN
              </button>
              <button 
                onClick={() => setIsSignUp(true)}
                className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${isSignUp ? 'text-white underline underline-offset-8 decoration-cyan/50' : 'text-white/30 hover:text-white/50'}`}
              >
                CREATE ACCOUNT
              </button>
            </div>
          </div>

          {/* Authentication Form */}
          <form onSubmit={handleAuth} className="space-y-8">
            <div className="space-y-5">
              {isSignUp && (
                <FloatingField
                  label="USER IDENTIFIER"
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="NAME / SURNAME"
                  icon={User}
                />
              )}

              <FloatingField
                label="EMAIL ADDRESS"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="citizen@example.com"
                error={Boolean(error)}
                autoComplete="email"
                icon={Mail}
              />

              <FloatingField
                label="PASSWORD"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                error={Boolean(error)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                icon={Lock}
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

            {/* Primary Action Button */}
            <div className="pt-2">
              <motion.button
                type="submit"
                disabled={loading}
                whileTap={loading ? {} : buttonTap}
                className="w-full py-5 rounded-lg text-[11px] font-black uppercase tracking-[0.4em] transition-all duration-500 flex items-center justify-center gap-4 group"
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

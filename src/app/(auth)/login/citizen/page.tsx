'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { 
  Users, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  UserPlus
} from 'lucide-react';
import { CivicLogo } from '@/components/ui/CivicLogo';

export default function CitizenLoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStaffRedirectNeeded, setIsStaffRedirectNeeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIsStaffRedirectNeeded(false);

    const cleanEmail = email.trim().toLowerCase();

    if (isSignUp) {
      if (!name.trim()) {
        setError('Please enter your full name.');
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        setLoading(false);
        return;
      }

      try {
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
            // fallback
          }
          throw new Error(msg || 'Registration failed. Please try again.');
        }

        // Auto sign-in as citizen after registration
        const authRes = await signIn('credentials', {
          redirect: false,
          email: cleanEmail,
          password,
          portal: 'CITIZEN',
        });

        if (authRes?.error) {
          setIsSignUp(false);
          setError('Account created! Please enter your password to sign in.');
          setLoading(false);
          return;
        }

        router.push('/citizen/dashboard');
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        setError(msg);
        setLoading(false);
        return;
      }
    }

    // Citizen Login Flow
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: cleanEmail,
        password,
        portal: 'CITIZEN',
      });

      if (result?.error) {
        if (result.error.includes('STAFF_ACCOUNT_ON_CITIZEN_PORTAL')) {
          setIsStaffRedirectNeeded(true);
          setError('This account is registered for Municipal Staff. Please sign in through the Municipal Staff Portal.');
        } else if (result.error.includes('RATE_LIMITED')) {
          setError('Too many failed attempts. Please wait 15 minutes before trying again.');
        } else if (result.error.includes('ACCOUNT_INACTIVE')) {
          setError('This account is inactive. Please contact municipal support.');
        } else {
          setError('Invalid email address or password. Please verify your credentials.');
        }
        setLoading(false);
        return;
      }

      // Successful Citizen Login
      router.push('/citizen/dashboard');
    } catch (err: unknown) {
      console.error('Citizen login error:', err);
      setError('An unexpected error occurred during sign in. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F2EB] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-10 font-body text-[#293732] relative overflow-hidden">
      
      {/* Container matching Mockup (Left visual canvas + Right raised card) */}
      <div className="w-full max-w-4xl bg-[#FAF9F5] rounded-[32px] border border-[#DDDCD3] shadow-[0_16px_48px_rgba(41,55,50,0.08),0_2px_6px_rgba(41,55,50,0.03)] overflow-hidden flex flex-col lg:flex-row relative z-10">
        
        {/* ── LEFT VISUAL COLUMN ── */}
        <div className="lg:w-5/12 relative bg-[#E9ECE6] p-8 sm:p-10 flex flex-col justify-between overflow-hidden min-h-[220px] lg:min-h-[560px]">
          {/* Background Illustration */}
          <div className="absolute inset-0 select-none pointer-events-none opacity-85">
            <Image
              src="/images/auth/citizen-login-scene.jpg"
              alt="Civic neighborhood illustration"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#FAF9F5]/90 via-[#FAF9F5]/30 to-transparent" />
          </div>

          {/* Top Logo */}
          <div className="relative z-10">
            <Link href="/login" className="inline-block hover:opacity-90 transition-opacity">
              <CivicLogo size={36} showSubtitle={true} />
            </Link>
          </div>

          {/* Bottom Editorial Callout */}
          <div className="relative z-10 space-y-2">
            <div className="text-[11px] font-mono font-bold text-[#527B7A] tracking-wider uppercase">
              CITIZEN ACCESS
            </div>
            <h3 className="font-display text-lg sm:text-xl text-[#293732] font-semibold">
              Public Infrastructure Ledger
            </h3>
            <p className="text-xs text-[#65736B] leading-relaxed">
              Verify local repairs, report civic hazards, and contribute to your municipal road truth index.
            </p>
          </div>
        </div>

        {/* ── RIGHT LOGIN CARD COLUMN ── */}
        <div className="lg:w-7/12 p-6 sm:p-10 lg:p-12 bg-white flex flex-col justify-between">
          <div className="space-y-6">
            
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858]">
                    {isSignUp ? <UserPlus className="w-4 h-4 stroke-[2.2]" /> : <Users className="w-4 h-4 stroke-[2.2]" />}
                  </div>
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl text-[#293732] font-semibold">
                      {isSignUp ? 'Create Citizen Account' : 'Citizen Login'}
                    </h2>
                    <p className="text-xs text-[#65736B]">
                      {isSignUp ? 'Register to report and verify civic issues in your ward.' : 'Sign in to your citizen account.'}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4] font-semibold">
                  Public
                </span>
              </div>
            </div>

            {/* Error / Alert Display */}
            {error && (
              <div className="p-3.5 rounded-xl bg-[#FBECE8] border border-[#F2D2CC] text-xs text-[#B76F60] space-y-2 animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                </div>
                {isStaffRedirectNeeded && (
                  <div className="pt-1">
                    <Link
                      href="/login/staff"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold transition-colors"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Switch to Municipal Staff Portal</span>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Full Name for Registration */}
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#293732]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-sm text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all"
                  />
                </div>
              )}

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#929B92]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-sm text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#929B92]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-sm text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#929B92] hover:text-[#293732] transition-colors cursor-pointer"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password (Only in Login mode) */}
              {!isSignUp && (
                <div className="flex items-center justify-between pt-0.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-[#65736B]">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-[#DDDCD3] text-[#355858] focus:ring-[#527B7A]/30 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => alert('Password recovery: Please contact support@civicpulse.org or request an OTP link.')}
                    className="text-xs text-[#527B7A] hover:text-[#355858] font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#355858] hover:bg-[#3E6966] active:bg-[#293732] disabled:opacity-60 text-white font-semibold text-xs sm:text-sm shadow-[0_4px_12px_rgba(53,88,88,0.25)] flex items-center justify-center gap-2 transition-all cursor-pointer active:translate-y-px"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isSignUp ? 'Creating account...' : 'Signing in...'}</span>
                    </>
                  ) : (
                    <span>{isSignUp ? 'Register Citizen Account' : 'Sign In'}</span>
                  )}
                </button>
              </div>

            </form>

            {/* Toggle Sign Up / Sign In */}
            <div className="text-center pt-2">
              {isSignUp ? (
                <p className="text-xs text-[#65736B]">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(false); setError(null); }}
                    className="font-semibold text-[#527B7A] hover:text-[#355858] transition-colors cursor-pointer underline"
                  >
                    Sign In
                  </button>
                </p>
              ) : (
                <p className="text-xs text-[#65736B]">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(true); setError(null); }}
                    className="font-semibold text-[#527B7A] hover:text-[#355858] transition-colors cursor-pointer underline"
                  >
                    Create a Citizen Account
                  </button>
                </p>
              )}
            </div>

          </div>

          {/* Footer: Back to Portal Selection */}
          <div className="pt-6 border-t border-[#DDDCD3]/60 mt-6 flex items-center justify-between text-xs text-[#65736B]">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[#65736B] hover:text-[#293732] font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Portal Selection</span>
            </Link>

            <span className="text-[11px] font-mono text-[#929B92]">
              Citizen Grid
            </span>
          </div>

        </div>

      </div>

    </div>
  );
}

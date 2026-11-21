'use client';

import { use, useState } from 'react';
import { isSignUpRequested, type LoginSearchParams } from '@/lib/auth/loginMode';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, User, Mail, Lock, ArrowRight, AlertCircle, Info, Building2 } from 'lucide-react';
import { CivicLogo } from '@/components/ui/CivicLogo';
import { CivicHallArt, CartographicBackground, TreeBranchArt } from '@/components/ui/CivicHallArt';

export default function LoginPage({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  const initialSignUp = isSignUpRequested(use(searchParams));
  const [role, setRole] = useState<'citizen' | 'authority'>('citizen');
  const [isSignUp, setIsSignUp] = useState(initialSignUp);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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
            // fallback
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
            ? 'Account was created, but automatic sign-in failed. Please click Sign In to enter.' 
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
    <div className="min-h-screen bg-[#F3F2EB] text-[#293732] font-body relative flex items-center justify-center p-6 lg:p-12 overflow-hidden selection:bg-[#D4E3DF]">
      {/* Background Cartography and Tree Branch */}
      <CartographicBackground />
      <TreeBranchArt />

      <div className="relative z-10 w-full max-w-[1180px] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
        
        {/* Left Column: Civic Atlas Editorial Presentation */}
        <div className="lg:col-span-6 flex flex-col justify-between h-full pt-2 lg:pt-4 space-y-8">
          <div className="space-y-6">
            <CivicLogo size={46} showSubtitle={true} />

            <div className="space-y-4 pt-3">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[46px] leading-[1.12] text-[#293732] font-semibold tracking-tight">
                A clearer record of the city we share.
              </h1>
              
              <p className="text-[#65736B] text-base sm:text-[17px] leading-relaxed max-w-lg font-body">
                Report issues, track repairs and build a more reliable, safer city together.
              </p>

              <div className="w-14 h-1 bg-[#527B7A] rounded-full mt-4" />
            </div>
          </div>

          {/* Architectural Heritage Illustration */}
          <div className="w-full max-w-[480px] pt-4 hidden sm:block">
            <CivicHallArt />
          </div>
        </div>

        {/* Right Column: Tactile Skeuomorphic Auth Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div
            className={`w-full max-w-[480px] bg-white rounded-[32px] p-8 sm:p-10 border border-[#DDDCD3] shadow-[0_24px_50px_-12px_rgba(41,55,50,0.12),0_4px_16px_rgba(41,55,50,0.04),inset_0_1px_0_rgba(255,255,255,1)] space-y-6 transition-all duration-300 ${
              shake ? 'animate-shake' : ''
            }`}
          >
            {/* Mode Segmented Switch (Sign In vs Create Account) */}
            <div className="bg-[#E9ECE6] p-1.5 rounded-2xl border border-[#D8DED7] flex items-center gap-1 shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)]">
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setError(''); }}
                className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer ${
                  !isSignUp
                    ? 'bg-[#3D6B6A] text-white shadow-[0_3px_8px_rgba(53,88,88,0.35),inset_0_1px_0_rgba(255,255,255,0.3)]'
                    : 'text-[#65736B] hover:text-[#293732]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  if (role === 'authority') {
                    setRole('citizen');
                  }
                  setIsSignUp(true);
                  setError('');
                }}
                className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer ${
                  isSignUp
                    ? 'bg-[#3D6B6A] text-white shadow-[0_3px_8px_rgba(53,88,88,0.35),inset_0_1px_0_rgba(255,255,255,0.3)]'
                    : 'text-[#65736B] hover:text-[#293732]'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Role Segmented Selector */}
            <div className="bg-[#E9ECE6] p-1.5 rounded-xl border border-[#D8DED7] flex items-center gap-1 shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)]">
              <button
                type="button"
                onClick={() => { setRole('citizen'); setError(''); }}
                className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                  role === 'citizen'
                    ? 'bg-[#3D6B6A] text-white shadow-[0_2px_6px_rgba(53,88,88,0.3),inset_0_1px_0_rgba(255,255,255,0.25)]'
                    : 'text-[#65736B] hover:text-[#293732]'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Citizen</span>
              </button>

              <button
                type="button"
                onClick={() => { setRole('authority'); setIsSignUp(false); setError(''); }}
                className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                  role === 'authority'
                    ? 'bg-[#3D6B6A] text-white shadow-[0_2px_6px_rgba(53,88,88,0.3),inset_0_1px_0_rgba(255,255,255,0.25)]'
                    : 'text-[#65736B] hover:text-[#293732]'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Municipal Staff</span>
              </button>
            </div>

            {role === 'authority' && isSignUp && (
              <div className="p-3 bg-[#E5E9E3] border border-[#DDDCD3] rounded-xl text-xs text-[#65736B] flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#527B7A] shrink-0 mt-0.5" />
                <span>Municipal desk accounts are issued by the city administrator. Please sign in with your municipal credentials.</span>
              </div>
            )}

            {/* Error Message Alert */}
            {error && (
              <div className="p-3.5 bg-[#FBF1EF] border border-[#EAC8C1] rounded-xl text-xs text-[#B76F60] flex items-center gap-2.5 font-medium">
                <AlertCircle className="w-4 h-4 text-[#B76F60] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#293732]">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#929B92]" />
                    <input
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ananya Das"
                      autoComplete="name"
                      className="w-full h-12 pl-12 pr-4 bg-[#F4F6F2] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all duration-150 placeholder:text-[#929B92]"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#929B92]" />
                  <input
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full h-12 pl-12 pr-4 bg-[#F4F6F2] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all duration-150 placeholder:text-[#929B92]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#929B92]" />
                  <input
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="w-full h-12 pl-12 pr-12 bg-[#F4F6F2] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all duration-150 placeholder:text-[#929B92]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#929B92] hover:text-[#293732] transition-colors p-1"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me and Forgot Password */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[#65736B]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[#DDDCD3] text-[#527B7A] focus:ring-[#527B7A] accent-[#3D6B6A]"
                  />
                  <span>Remember me</span>
                </label>

                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => setError('Password reset instructions will be sent to your verified email.')}
                    className="text-[#527B7A] hover:underline font-medium cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {/* Tactile Primary Button */}
              <button
                type="submit"
                disabled={loading || success}
                className="w-full mt-2 h-12 px-6 rounded-xl font-medium text-sm text-white flex items-center justify-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_6px_16px_rgba(46,84,83,0.32),0_1px_3px_rgba(41,55,50,0.12),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px active:shadow-[0_2px_6px_rgba(53,88,88,0.25),inset_0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-150 cursor-pointer disabled:opacity-60"
              >
                <span>
                  {loading
                    ? (isSignUp ? 'Creating Account...' : 'Signing In...')
                    : (isSignUp ? 'Create Citizen Account' : 'Sign In')}
                </span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#DDDCD3]" />
              </div>
              <div className="relative px-3 bg-white text-xs text-[#929B92] font-mono tracking-wider">
                or
              </div>
            </div>

            {/* Inset Guidance Callout */}
            <div className="bg-[#F4F6F2] border border-[#E5E9E3] rounded-2xl p-4 flex items-center justify-between gap-3 shadow-[inset_0_1px_2px_rgba(41,55,50,0.03)]">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#E5E9E3] flex items-center justify-center shrink-0 mt-0.5 text-[#527B7A]">
                  <Info className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#293732]">
                    {isSignUp ? 'Already registered?' : 'New to CivicPulse?'}
                  </div>
                  <div className="text-[11.5px] text-[#65736B] leading-tight">
                    {isSignUp
                      ? 'Sign in to access your civic reporting history.'
                      : 'Create a citizen account to report issues and contribute to your city.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                }}
                className="shrink-0 bg-white border border-[#DDDCD3] text-[#293732] text-xs font-semibold py-2 px-3.5 rounded-xl shadow-[0_2px_5px_rgba(41,55,50,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-[#F9FAF8] active:translate-y-px transition-all cursor-pointer whitespace-nowrap"
              >
                {isSignUp ? 'Sign In' : 'Create Account'}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { 
  Building2, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Loader2, 
  AlertCircle,
  ShieldCheck,
  Users
} from 'lucide-react';
import { CivicLogo } from '@/components/ui/CivicLogo';

export default function MunicipalStaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCitizenRedirectNeeded, setIsCitizenRedirectNeeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIsCitizenRedirectNeeded(false);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: cleanEmail,
        password,
        portal: 'STAFF',
      });

      if (result?.error) {
        if (result.error.includes('CITIZEN_ACCOUNT_ON_STAFF_PORTAL')) {
          setIsCitizenRedirectNeeded(true);
          setError('Access restricted. This portal is for authorized municipal personnel only. Citizens must sign in via the Citizen Portal.');
        } else if (result.error.includes('RATE_LIMITED')) {
          setError('Too many failed attempts. Access temporarily locked for 15 minutes to protect municipal infrastructure.');
        } else if (result.error.includes('ACCOUNT_INACTIVE')) {
          setError('This staff account is suspended or pending verification. Please contact your desk supervisor.');
        } else {
          setError('Invalid municipal credentials. Access denied.');
        }
        setLoading(false);
        return;
      }

      // Successful Municipal Staff Login -> redirect to operations desk
      router.push('/desk');
    } catch (err: unknown) {
      console.error('Municipal staff login error:', err);
      setError('An unexpected error occurred during authorization. Please try again.');
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
              src="/images/auth/staff-office-scene.jpg"
              alt="City municipal office building illustration"
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
              MUNICIPAL OPERATIONS
            </div>
            <h3 className="font-display text-lg sm:text-xl text-[#293732] font-semibold">
              Authorized Staff Desk
            </h3>
            <p className="text-xs text-[#65736B] leading-relaxed">
              Dispatch route planning, agency contractor verification, and municipal claim gap monitoring.
            </p>
          </div>
        </div>

        {/* ── RIGHT LOGIN CARD COLUMN ── */}
        <div className="lg:w-7/12 p-6 sm:p-10 lg:p-12 bg-white flex flex-col justify-between">
          <div className="space-y-5">
            
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A]">
                    <Building2 className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl text-[#293732] font-semibold">
                      Municipal Staff Login
                    </h2>
                    <p className="text-xs text-[#65736B]">
                      Authorized municipal personnel only.
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FDF6EC] text-[#B68B63] border border-[#F5DDC4] font-semibold">
                  Restricted
                </span>
              </div>
            </div>

            {/* Amber Access Restriction Notice Box matching Mockup */}
            <div className="p-3.5 rounded-2xl bg-[#FDF6EC] border border-[#F5DDC4] flex items-start gap-2.5 text-xs text-[#8A5B2D]">
              <Lock className="w-4 h-4 text-[#B68B63] shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Access is restricted to approved accounts of municipal staff and administrators.
              </span>
            </div>

            {/* Error / Alert Display */}
            {error && (
              <div className="p-3.5 rounded-xl bg-[#FBECE8] border border-[#F2D2CC] text-xs text-[#B76F60] space-y-2 animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                </div>
                {isCitizenRedirectNeeded && (
                  <div className="pt-1">
                    <Link
                      href="/login/citizen"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Switch to Citizen Portal</span>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Municipal Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Municipal Email
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
                    placeholder="Enter your municipal email"
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

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => alert('Staff credential assistance: Contact your municipal IT administrator or field operations supervisor.')}
                  className="text-xs text-[#527B7A] hover:text-[#355858] font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

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
                      <span>Authenticating staff credentials...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </div>

            </form>

            {/* Access Provisioning Notice */}
            <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3]/70 text-[11px] text-[#65736B] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#527B7A] shrink-0" />
              <span>Staff accounts are provisioned exclusively via administrative invitation.</span>
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

            <span className="text-[10px] font-mono text-[#929B92]">
              Security Zone B
            </span>
          </div>

        </div>

      </div>

    </div>
  );
}

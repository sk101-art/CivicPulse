'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Building2, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { CivicLogo } from '@/components/ui/CivicLogo';

function StaffActivationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token. Please use the activation link provided in your administrative invitation.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/staff-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Account activation failed.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/login/staff');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Activation error';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F2EB] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-10 font-body text-[#293732] relative overflow-hidden">
      <div className="w-full max-w-xl bg-white rounded-[32px] border border-[#DDDCD3] shadow-[0_16px_48px_rgba(41,55,50,0.08),0_2px_6px_rgba(41,55,50,0.03)] p-6 sm:p-10 space-y-6 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <Link href="/login" className="hover:opacity-90 transition-opacity">
            <CivicLogo size={42} showSubtitle={true} />
          </Link>

          <div className="w-12 h-12 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] mt-2">
            <ShieldCheck className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="space-y-1">
            <h1 className="font-display text-2xl text-[#293732] font-semibold">
              Activate Municipal Staff Account
            </h1>
            <p className="text-xs sm:text-sm text-[#65736B] max-w-sm">
              Complete your account provisioning to access municipal field desks and operations queues.
            </p>
          </div>
        </div>

        {/* Success State */}
        {success ? (
          <div className="p-5 rounded-2xl bg-[#EFF6F1] border border-[#CFE4D4] text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#537C60] mx-auto stroke-[2.5]" />
            <h3 className="font-semibold text-sm text-[#293732]">
              Account Successfully Activated
            </h3>
            <p className="text-xs text-[#537C60]">
              Redirecting you to the Municipal Staff Portal...
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3.5 rounded-xl bg-[#FBECE8] border border-[#F2D2CC] text-xs text-[#B76F60] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Officer Name"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-sm text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-sm text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all"
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

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#293732]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-sm text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full py-3 px-4 rounded-xl bg-[#355858] hover:bg-[#3E6966] active:bg-[#293732] disabled:opacity-60 text-white font-semibold text-xs sm:text-sm shadow-[0_4px_12px_rgba(53,88,88,0.25)] flex items-center justify-center gap-2 transition-all cursor-pointer active:translate-y-px"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Activating credentials...</span>
                    </>
                  ) : (
                    <span>Complete Activation &amp; Sign In</span>
                  )}
                </button>
              </div>
            </form>
          </>
        )}

        <div className="pt-4 border-t border-[#DDDCD3]/60 text-center">
          <Link
            href="/login/staff"
            className="inline-flex items-center gap-1.5 text-xs text-[#65736B] hover:text-[#293732] font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Municipal Staff Login</span>
          </Link>
        </div>

      </div>
    </div>
  );
}

export default function StaffActivationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F3F2EB] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#527B7A]" /></div>}>
      <StaffActivationContent />
    </Suspense>
  );
}

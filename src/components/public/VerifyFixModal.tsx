'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Camera,
  AlertTriangle,
  Loader2,
  X,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';
import { getVerificationEligibility } from '@/lib/verification/eligibility';
import { haversineDistanceM } from '@/lib/evidence/sign';

export interface VerifyFixModalProps {
  issueId: string;
  issueCoords: { lat: number; lng: number };
  isLoggedIn: boolean;
  isReporter?: boolean;
  isClaimant?: boolean;
  hasVerified?: boolean;
  accountCreatedAt?: Date | string | null;
  initialDistanceM?: number | null;
}

export function VerifyFixModal({
  issueId,
  issueCoords,
  isLoggedIn,
  isReporter = false,
  isClaimant = false,
  hasVerified = false,
  accountCreatedAt = null,
  initialDistanceM = null,
}: VerifyFixModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [verdict, setVerdict] = useState<'FIXED' | 'NOT_FIXED'>('FIXED');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<CapturedEvidence | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [userDistanceM, setUserDistanceM] = useState<number | null>(
    typeof initialDistanceM === 'number' ? initialDistanceM : null
  );

  useEffect(() => {
    if (typeof initialDistanceM === 'number') return;
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    if (!isLoggedIn || isReporter || hasVerified || isClaimant) return;

    let isMounted = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMounted) return;
        const d = haversineDistanceM(
          issueCoords.lat,
          issueCoords.lng,
          pos.coords.latitude,
          pos.coords.longitude
        );
        setUserDistanceM(d);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    return () => {
      isMounted = false;
    };
  }, [issueCoords.lat, issueCoords.lng, initialDistanceM, isLoggedIn, isReporter, hasVerified, isClaimant]);

  const effectiveDistanceM = typeof initialDistanceM === 'number' ? initialDistanceM : userDistanceM;

  const eligibility = getVerificationEligibility({
    isLoggedIn,
    isReporter,
    isClaimant,
    hasVerified,
    accountCreatedAt,
    distanceM: effectiveDistanceM,
  });

  const handleCapture = (ev: CapturedEvidence) => {
    setEvidence(ev);
    setShowCamera(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidence) {
      setErrorMessage('Please capture signed camera evidence on-site');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const photoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(evidence.blob);
        reader.onloadend = () => {
          const res = (reader.result as string).split(',')[1];
          resolve(res);
        };
        reader.onerror = reject;
      });

      const res = await fetch(`/api/issues/${issueId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict,
          note: note.trim() || undefined,
          evidence: {
            payload: evidence.payload,
            signature: evidence.signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Verification failed');
      }

      setSuccessMessage('Verification recorded! +20 XP awarded to your citizen profile.');
      setTimeout(() => {
        setIsOpen(false);
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!eligibility.eligible) {
    return (
      <div data-testid="verification-button-area" className="flex flex-col items-start sm:items-end gap-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="verify-fix-button"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-mono font-bold cursor-not-allowed opacity-60"
        >
          <ShieldAlert className="w-4 h-4 text-amber-400/80" />
          Verify this fix
        </button>
        <div
          data-testid="verify-eligibility-reason"
          className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm max-w-xs text-left sm:text-right"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{eligibility.reason}</span>
        </div>
        {!isLoggedIn && (
          <Link
            href={`/login?callbackUrl=/issue/${issueId}`}
            data-testid="signin-to-verify-link"
            className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center gap-1 mt-0.5"
          >
            Sign in to citizen account &rarr;
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div data-testid="verification-button-area" className="flex flex-col items-start sm:items-end gap-2">
        <button
          type="button"
          data-testid="verify-fix-button"
          onClick={() => {
            setIsOpen(true);
            setErrorMessage(null);
            setSuccessMessage(null);
            setEvidence(null);
          }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-xs font-mono font-bold hover:opacity-90 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          Verify this fix (+20 XP)
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0e1726] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-white font-mono uppercase tracking-wide">
                  On-Site Citizen Verification
                </h3>
                <p className="text-xs font-mono text-white/50">
                  Verify or dispute fix within 50m of defect
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {!successMessage && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Verdict Choice */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white/70 block uppercase tracking-wider">
                    Inspection Verdict
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setVerdict('FIXED')}
                      className={`p-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
                        verdict === 'FIXED'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                          : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Defect Fixed
                    </button>

                    <button
                      type="button"
                      onClick={() => setVerdict('NOT_FIXED')}
                      className={`p-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
                        verdict === 'NOT_FIXED'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-400'
                          : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      Still Broken (Dispute)
                    </button>
                  </div>
                </div>

                {/* Camera / Evidence Section */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white/70 block uppercase tracking-wider">
                    On-Site Evidence (Signed Photo & GPS)
                  </label>
                  {showCamera ? (
                    <div className="rounded-xl overflow-hidden border border-white/10">
                      <CaptureCamera
                        role="VERIFY"
                        targetCoords={issueCoords}
                        onCapture={handleCapture}
                        onCancel={() => setShowCamera(false)}
                      />
                    </div>
                  ) : evidence ? (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Signed Evidence Captured
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCamera(true)}
                        className="text-xs font-mono text-cyan-400 hover:underline"
                      >
                        Retake
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="w-full py-3.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Open Camera (Requires GPS ≤ 30m, within 50m)
                    </button>
                  )}
                </div>

                {/* Optional note */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white/70 block uppercase tracking-wider">
                    Inspection Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Describe the current condition of the road..."
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans placeholder:text-white/30 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Submit action */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 text-xs font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !evidence}
                    className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs font-mono hover:bg-cyan-400 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Submit Verification
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

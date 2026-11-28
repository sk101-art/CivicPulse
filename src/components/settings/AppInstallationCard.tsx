'use client';

import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  CheckCircle2,
  Share2,
  PlusSquare,
  AlertCircle,
  Loader2,
  WifiOff,
  Zap,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { usePwaInstall } from '@/context/PwaContext';

export interface AppInstallationCardProps {
  className?: string;
}

export function AppInstallationCard({ className = '' }: AppInstallationCardProps) {
  const { status, isInstalled, canInstall, isIOS, installApp } = usePwaInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const handleInstallClick = async () => {
    setIsInstalling(true);
    setFeedbackMessage(null);
    try {
      const outcome = await installApp();
      if (outcome === 'accepted') {
        setFeedbackMessage('CivicPulse was installed successfully.');
      } else if (outcome === 'dismissed') {
        setFeedbackMessage('Installation was cancelled. You can install CivicPulse anytime from this settings section.');
      }
    } catch {
      setFeedbackMessage('Unable to complete installation prompt.');
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div
      data-testid="pwa-settings-card"
      className={`bg-white rounded-[24px] sm:rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6 ${className}`}
    >
      {/* ── CARD HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Tactile Icon Container */}
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858] shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Smartphone className="w-6 h-6 sm:w-7 sm:h-7 stroke-[1.8]" />
          </div>

          <div className="space-y-1 min-w-0">
            {/* Eyebrow */}
            <div className="text-[11px] font-bold text-[#527B7A] tracking-wider uppercase font-mono">
              APP INSTALLATION
            </div>

            {/* Title */}
            <h2 className="font-display text-xl sm:text-2xl text-[#293732] font-semibold tracking-tight">
              Install CivicPulse
            </h2>

            {/* Description */}
            <p className="text-xs sm:text-sm text-[#65736B] leading-relaxed max-w-xl">
              Install CivicPulse on your device for faster access, offline evidence capture and a more convenient reporting experience.
            </p>
          </div>
        </div>

        {/* Status Pill Badge */}
        <div className="shrink-0 self-start">
          {isInstalled || status === 'INSTALLED' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Installed</span>
            </span>
          ) : isIOS ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FAF9F5] text-[#65736B] border border-[#DDDCD3]">
              <Share2 className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>iOS Safari</span>
            </span>
          ) : canInstall ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF]">
              <Download className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>Available</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]">
              <span>Web Version</span>
            </span>
          )}
        </div>
      </div>

      {/* ── CIVIC ATLAS VALUE PROPOSITIONS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div className="p-3.5 rounded-2xl bg-[#F9FAF8] border border-[#E5E9E3] space-y-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#293732]">
            <WifiOff className="w-4 h-4 text-[#527B7A] shrink-0" />
            <span>Offline Capture</span>
          </div>
          <p className="text-[11px] text-[#65736B] leading-normal">
            Take photos and sign cryptographic evidence even without cellular connectivity.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#F9FAF8] border border-[#E5E9E3] space-y-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#293732]">
            <Zap className="w-4 h-4 text-[#B68B63] shrink-0" />
            <span>Instant Launch</span>
          </div>
          <p className="text-[11px] text-[#65736B] leading-normal">
            Open directly from your home screen or dock without browser tabs or address bars.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#F9FAF8] border border-[#E5E9E3] space-y-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#293732]">
            <ShieldCheck className="w-4 h-4 text-[#537C60] shrink-0" />
            <span>Local Security</span>
          </div>
          <p className="text-[11px] text-[#65736B] leading-normal">
            Hardware-backed cryptographic keys remain isolated and secure on your physical device.
          </p>
        </div>
      </div>

      {/* ── STATE-SPECIFIC ACTION / INSTRUCTION CONTAINER ── */}
      <div className="pt-2 border-t border-[#DDDCD3]/60">
        {/* 1. STATE: Already Installed / Running Standalone */}
        {(isInstalled || status === 'INSTALLED') && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#EFF6F1] border border-[#CFE4D4]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white border border-[#CFE4D4] flex items-center justify-center text-[#537C60] shrink-0 shadow-sm">
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs sm:text-sm font-semibold text-[#293732]">
                  CivicPulse is installed on this device
                </div>
                <p className="text-[11px] sm:text-xs text-[#537C60]">
                  Operating with offline sync, local cryptographic signing, and cached municipal atlas tiles.
                </p>
              </div>
            </div>

            <div className="shrink-0">
              <span className="px-3.5 py-1.5 rounded-xl bg-white text-[#537C60] text-xs font-bold border border-[#CFE4D4] shadow-sm">
                Installed
              </span>
            </div>
          </div>
        )}

        {/* 2. STATE: iOS Safari Instructions */}
        {!isInstalled && status !== 'INSTALLED' && isIOS && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#293732]">
              <Share2 className="w-4 h-4 text-[#527B7A]" />
              <span>To install CivicPulse on iOS:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-[#65736B]">
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-[#DDDCD3]/70">
                <span className="w-5 h-5 rounded-full bg-[#EAF2F0] text-[#355858] font-bold text-[11px] flex items-center justify-center shrink-0">1</span>
                <span>Tap the <strong>Share</strong> button <Share2 className="w-3.5 h-3.5 inline text-[#527B7A]" /> in Safari’s bottom toolbar.</span>
              </div>

              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-[#DDDCD3]/70">
                <span className="w-5 h-5 rounded-full bg-[#EAF2F0] text-[#355858] font-bold text-[11px] flex items-center justify-center shrink-0">2</span>
                <span>Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong> <PlusSquare className="w-3.5 h-3.5 inline text-[#527B7A]" />.</span>
              </div>

              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-[#DDDCD3]/70">
                <span className="w-5 h-5 rounded-full bg-[#EAF2F0] text-[#355858] font-bold text-[11px] flex items-center justify-center shrink-0">3</span>
                <span>Tap <strong>Add</strong> in the top right to complete installation.</span>
              </div>
            </div>

            <p className="text-[11px] text-[#929B92] italic">
              Note: Safari does not support automated 1-click install popups, but adding to Home Screen enables full offline PWA capabilities.
            </p>
          </div>
        )}

        {/* 3. STATE: Installation Available / Dismissed (Chrome / Edge / Android / Supported Desktop) */}
        {!isInstalled && status !== 'INSTALLED' && !isIOS && canInstall && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs sm:text-sm font-semibold text-[#293732] flex items-center gap-2">
                <span>Direct Installation Available</span>
                {status === 'DISMISSED' && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]">
                    Ready to retry
                  </span>
                )}
              </div>
              <p className="text-xs text-[#65736B]">
                Click below to launch your browser&apos;s native application installation dialog.
              </p>
              {feedbackMessage && (
                <p className="text-xs text-[#527B7A] font-medium pt-1">
                  {feedbackMessage}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="px-5 py-2.5 rounded-xl bg-[#355858] hover:bg-[#3E6966] active:bg-[#293732] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold shadow-[0_4px_12px_rgba(53,88,88,0.25)] flex items-center justify-center gap-2 transition-all cursor-pointer active:translate-y-px shrink-0"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Launching Installer...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.2]" />
                  <span>Install App</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* 4. STATE: Browser Unsupported for PWA Installation */}
        {!isInstalled && status !== 'INSTALLED' && !isIOS && !canInstall && (
          <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-[#929B92] shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-semibold text-[#293732]">
                App installation not available in this browser
              </div>
              <p className="text-[11px] text-[#65736B] leading-relaxed">
                CivicPulse works fully in this browser window. To install it as an independent application with desktop and home screen icons, open this address in Google Chrome, Microsoft Edge, or Apple Safari.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AppInstallationCard;

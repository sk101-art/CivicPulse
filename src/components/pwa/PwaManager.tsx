'use client';

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export const PWA_DISMISSED_SESSION_KEY = "civicpulse_pwa_dismissed";

export function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service worker registered successfully:", reg.scope);
          })
          .catch((err) => {
            console.warn("[PWA] Service worker registration failed:", err);
          });
      });
    }

    const isDismissed = () => {
      try {
        return sessionStorage.getItem(PWA_DISMISSED_SESSION_KEY) === "1";
      } catch {
        return false;
      }
    };

    // 2. Listen for BeforeInstallPrompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissed()) {
        setShowInstallBanner(true);
      }
    };

    const handleAppInstalled = () => {
      console.log("[PWA] App installed successfully");
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setShowInstallBanner(false);
    try {
      sessionStorage.setItem(PWA_DISMISSED_SESSION_KEY, "1");
    } catch (err) {
      console.warn("Could not save PWA dismissal", err);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowInstallBanner(false);
    }
    try {
      sessionStorage.setItem(PWA_DISMISSED_SESSION_KEY, "1");
    } catch {}
    setDeferredPrompt(null);
  };

  if (!showInstallBanner || isInstalled || !deferredPrompt) {
    return null;
  }

  return (
    <div
      data-testid="pwa-install-banner"
      className="fixed bottom-24 lg:bottom-6 left-4 right-4 sm:right-auto sm:max-w-sm z-40 rounded-xl bg-slate-900/95 border border-blue-500/30 p-4 shadow-2xl backdrop-blur-md transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Install CivicPulse</h4>
            <p className="text-xs text-slate-400 leading-snug">
              Add to home screen for offline evidence signing and fast local capture.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          aria-label="Dismiss"
          data-testid="pwa-dismiss-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleInstallClick}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Install App
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          data-testid="pwa-later-btn"
        >
          Later
        </button>
      </div>
    </div>
  );
}

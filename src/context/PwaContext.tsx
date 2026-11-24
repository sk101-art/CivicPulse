'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PwaInstallStatus =
  | 'LOADING'
  | 'AVAILABLE'
  | 'INSTALLING'
  | 'INSTALLED'
  | 'DISMISSED'
  | 'IOS_INSTRUCTIONS'
  | 'UNSUPPORTED';

interface PwaContextType {
  status: PwaInstallStatus;
  isInstalled: boolean;
  canInstall: boolean;
  isIOS: boolean;
  installApp: () => Promise<'accepted' | 'dismissed' | 'unsupported'>;
}

const PwaContext = createContext<PwaContextType>({
  status: 'LOADING',
  isInstalled: false,
  canInstall: false,
  isIOS: false,
  installApp: async () => 'unsupported',
});

export const PWA_DISMISSED_SESSION_KEY = 'civicpulse_pwa_dismissed';

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<PwaInstallStatus>('LOADING');
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Service Worker Registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service worker registered successfully:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service worker registration failed:', err);
          });
      });
    }

    // 2. Standalone Mode Detection (Already Installed)
    const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
    const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isAndroidApp = document.referrer.includes('android-app://');
    const runningStandalone = isStandaloneMedia || isNavigatorStandalone || isAndroidApp;

    // 3. iOS Detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    setIsIOS(isIOSDevice);

    if (runningStandalone) {
      setIsInstalled(true);
      setStatus('INSTALLED');
      return;
    }

    if (isIOSDevice) {
      setStatus('IOS_INSTRUCTIONS');
    } else {
      // Default to unsupported until beforeinstallprompt fires
      setStatus('UNSUPPORTED');
    }

    // 4. Capture beforeinstallprompt event (Prevent auto popup, store prompt)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser from automatically showing its own prompt
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setStatus('AVAILABLE');
    };

    // 5. Handle appinstalled event
    const handleAppInstalled = () => {
      console.log('[PWA] App successfully installed');
      setIsInstalled(true);
      setStatus('INSTALLED');
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    if (!deferredPrompt) {
      if (isIOS) {
        setStatus('IOS_INSTRUCTIONS');
        return 'unsupported';
      }
      return 'unsupported';
    }

    setStatus('INSTALLING');
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setStatus('INSTALLED');
        setDeferredPrompt(null);
        return 'accepted';
      } else {
        // User dismissed native prompt, but option to install remains available
        setStatus('DISMISSED');
        return 'dismissed';
      }
    } catch (err) {
      console.warn('[PWA] Error launching native install prompt:', err);
      setStatus('AVAILABLE');
      return 'dismissed';
    }
  }, [deferredPrompt, isIOS]);

  const canInstall = status === 'AVAILABLE' || status === 'DISMISSED';

  return (
    <PwaContext.Provider
      value={{
        status,
        isInstalled,
        canInstall,
        isIOS,
        installApp,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwaInstall() {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error('usePwaInstall must be used within a PwaProvider');
  }
  return context;
}

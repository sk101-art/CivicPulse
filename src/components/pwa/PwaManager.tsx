'use client';

/**
 * PwaManager component.
 * Note: The automatic floating install popup has been permanently removed
 * in favor of the dedicated App Installation card in Settings, as per the
 * Civic Atlas design system.
 *
 * PWA installation state and service worker registration are managed globally
 * via PwaProvider (src/context/PwaContext.tsx).
 */

export const PWA_DISMISSED_SESSION_KEY = 'civicpulse_pwa_dismissed';

export function PwaManager() {
  // Returns null - no floating install banner or disruptive popups appear
  return null;
}

export default PwaManager;

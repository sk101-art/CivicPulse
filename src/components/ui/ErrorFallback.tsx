'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/** Friendly page-level error state shared by app/error.tsx and app/global-error.tsx. */
export function ErrorFallback({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <main className="min-h-screen bg-[#070b14] text-zinc-100 flex items-center justify-center p-6">
      <div role="alert" className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-300 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-white">This page couldn&apos;t load</h1>
        <p className="text-sm text-white/80">
          Something went wrong on our side. Your reports and points are safe. Please try again in a moment.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-cyan-400 text-black font-bold text-sm hover:bg-cyan-300"
          >
            Try again
          </button>
          <Link href="/citizen/dashboard" className="px-4 py-2 rounded-xl border border-white/20 text-sm text-white hover:bg-white/10">
            Go to dashboard
          </Link>
        </div>
        {digest && <p className="text-[11px] font-mono text-white/60">Reference: {digest}</p>}
      </div>
    </main>
  );
}

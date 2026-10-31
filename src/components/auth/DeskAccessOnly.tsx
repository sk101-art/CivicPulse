import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/** Shown to signed-in non-desk users who open a /desk page. */
export function DeskAccessOnly() {
  return (
    <main className="min-h-screen bg-[#070b14] text-zinc-100 flex items-center justify-center p-6">
      <div
        data-testid="desk-access-only"
        role="alert"
        className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center space-y-4"
      >
        <ShieldAlert className="w-10 h-10 text-amber-300 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-white">Desk access only</h1>
        <p className="text-sm text-white/80">
          This area is for municipal desk officers. Your citizen account can file reports, take audits and follow
          issues from your dashboard.
        </p>
        <Link
          href="/citizen/dashboard"
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-cyan-400 text-black font-bold text-sm hover:bg-cyan-300"
        >
          Go to my dashboard
        </Link>
      </div>
    </main>
  );
}

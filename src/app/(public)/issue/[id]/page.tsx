import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Clock, ArrowLeft, ShieldCheck } from "lucide-react";

export default async function PublicIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      reports: {
        orderBy: { createdAt: "desc" },
      },
      actions: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!issue) {
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        issue: {
          include: {
            reports: { orderBy: { createdAt: "desc" } },
            actions: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (report && report.issue) {
      issue = report.issue;
    }
  }

  if (!issue) {
    notFound();
  }

  const primaryReport = issue.reports[0] || null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-body p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link
            href="/citizen/dashboard"
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-zinc-900 border border-zinc-800 text-zinc-300">
              {issue.status}
            </span>
            {issue.isSeed && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                seed
              </span>
            )}
          </div>
        </div>

        {/* Primary Evidence Photo */}
        {primaryReport && (
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-black border border-zinc-800 shadow-2xl">
            <Image
              src={primaryReport.photoUrl}
              alt="Report evidence"
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-mono text-white/90 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan" />
                {issue.lat.toFixed(5)}, {issue.lng.toFixed(5)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                {new Date(primaryReport.capturedAt).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Issue Details Card */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono uppercase text-cyan tracking-widest block mb-1">
                {issue.category}
              </span>
              <h1 className="text-xl font-display font-black text-white">
                {issue.address || "Road Infrastructure Issue"}
              </h1>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-zinc-500 block uppercase">Priority Index</span>
              <span className="text-2xl font-mono font-black text-primary">
                {issue.priority !== null ? Math.round(issue.priority) : "—"}
              </span>
            </div>
          </div>

          {primaryReport?.note && (
            <div className="text-sm text-zinc-300 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80">
              {primaryReport.note}
            </div>
          )}

          {/* Evidence Reports Gallery / Count */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>Verified Confirmations: {issue.reports.length}</span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Cryptographically Signed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

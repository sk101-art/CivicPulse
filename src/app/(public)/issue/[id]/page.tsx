import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { 
  MapPin, Clock, ArrowLeft, ShieldCheck, 
  Building2, ArrowRightLeft, 
  Activity, CheckCircle2
} from "lucide-react";
import { VerifyFixModal } from "@/components/public/VerifyFixModal";
import { PriorityBreakdown } from "@/components/priority/PriorityBreakdown";
import type { PriorityBreakdown as PriorityBreakdownType } from "@/lib/priority";
import { Status, Band, EvidenceRole } from "@prisma/client";

export const revalidate = 0;

export default async function PublicIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const isLoggedIn = Boolean(session?.user);

  let issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      agency: { select: { id: true, code: true, name: true, slaHours: true } },
      reports: {
        orderBy: { createdAt: "desc" },
      },
      actions: {
        orderBy: { createdAt: "asc" },
      },
      verifications: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!issue) {
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        issue: {
          include: {
            agency: { select: { id: true, code: true, name: true, slaHours: true } },
            reports: { orderBy: { createdAt: "desc" } },
            actions: { orderBy: { createdAt: "asc" } },
            verifications: { orderBy: { createdAt: "desc" } },
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

  // Enrich action log actor names
  const actorIds = Array.from(new Set(issue.actions.map((a) => a.actorId)));
  const users = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, email: true, name: true, role: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const enrichedActions = issue.actions.map((action) => {
    let actorName = "Citizen";
    if (action.actorId === "system" || action.actorId === "SYSTEM") {
      actorName = "System";
    } else {
      const u = userMap.get(action.actorId);
      if (u) {
        if (u.email === "desk-a@civicpulse.local") {
          actorName = "Desk A";
        } else if (u.email === "desk-b@civicpulse.local") {
          actorName = "Desk B";
        } else if (u.name) {
          actorName = u.name;
        } else if (u.role === "AUTHORITY") {
          actorName = "Desk Officer";
        }
      }
    }
    return {
      ...action,
      actorName,
    };
  });

  const effectiveBand = (issue.bandOverride || issue.band) as Band;
  const bandBadgeColor =
    effectiveBand === "CRITICAL"
      ? "border-red-500/40 text-red-400 bg-red-500/10"
      : effectiveBand === "HIGH"
      ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
      : effectiveBand === "MEDIUM"
      ? "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
      : "border-slate-500/40 text-slate-400 bg-slate-500/10";

  const getRoleLabel = (role: EvidenceRole) => {
    switch (role) {
      case "REPORT":
        return "Initial Report";
      case "CONFIRM":
        return "Citizen Confirmation";
      case "CLAIM_FIX":
        return "Desk Fix Claim";
      case "VERIFY":
        return "Citizen Verification";
      default:
        return role;
    }
  };

  const breakdown = (issue.piBreakdown as unknown as PriorityBreakdownType) || null;

  return (
    <div className="min-h-screen bg-[#070b14] text-zinc-100 font-body p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/citizen/dashboard"
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${bandBadgeColor}`}>
              {effectiveBand} BAND ({issue.priority.toFixed(1)})
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
              {issue.status}
            </span>
            {issue.slaBreached && (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                SLA BREACHED
              </span>
            )}
          </div>
        </div>

        {/* Title & Location Header */}
        <div className="space-y-2">
          <span className="text-xs font-mono uppercase text-cyan tracking-widest block">
            {issue.category.replace(/_/g, " ")}
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-white">
            {issue.address || "Road Infrastructure Issue"}
          </h1>
          <p className="text-xs font-mono text-white/50 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-cyan" />
            Lat: {issue.lat.toFixed(5)}, Lng: {issue.lng.toFixed(5)}
          </p>
        </div>

        {/* Claimed Fixed Banner & Verification CTA */}
        {issue.status === Status.CLAIMED_FIXED && (
          <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                Work Claimed Complete by Operations Desk
              </div>
              <p className="text-xs font-mono text-white/60">
                Citizens within 50 metres can confirm or dispute this repair with a signed photo.
              </p>
            </div>
            <VerifyFixModal
              issueId={issue.id}
              issueCoords={{ lat: issue.lat, lng: issue.lng }}
              isLoggedIn={isLoggedIn}
            />
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Agency & Handoffs Card */}
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <span className="text-[11px] font-mono uppercase text-white/40 tracking-wider block">
              Responsible Agency
            </span>
            <div className="flex items-center gap-2 text-base font-bold text-white font-mono">
              <Building2 className="w-5 h-5 text-cyan" />
              {issue.agency?.name || "Unassigned"}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300 pt-1">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>{issue.handoffCount} agency handoff(s)</span>
            </div>
          </div>

          {/* Priority Index Breakdown Card */}
          <PriorityBreakdown
            priority={issue.priority}
            band={effectiveBand}
            breakdown={breakdown}
            piText={issue.piText}
          />

          {/* SLA Timeline Card */}
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <span className="text-[11px] font-mono uppercase text-white/40 tracking-wider block">
              SLA Resolution Due
            </span>
            <div className="flex items-center gap-2 text-sm font-bold text-white font-mono">
              <Clock className="w-4 h-4 text-rose-400" />
              {new Date(issue.slaDueAt).toLocaleDateString()}
            </div>
            <div className="text-xs font-mono text-white/50 pt-1">
              Target: {issue.agency?.slaHours ?? 72} hours from filing
            </div>
          </div>
        </div>

        {/* Evidence Photo Gallery */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-lg font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Signed Evidence Gallery ({issue.reports.length})
            </h2>
            <span className="text-xs font-mono text-white/40">Hardware-Signed / GPS Gate</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {issue.reports.map((report) => (
              <div
                key={report.id}
                className="rounded-2xl overflow-hidden bg-black/40 border border-white/10 space-y-3 p-3 shadow-lg"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black/60">
                  <Image
                    src={report.photoUrl}
                    alt={getRoleLabel(report.role)}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold text-white border border-white/10">
                    {getRoleLabel(report.role)}
                  </div>
                </div>

                <div className="space-y-1 px-1 text-xs font-mono text-white/60">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 font-bold">
                      Accuracy: {report.gpsAccuracyM.toFixed(1)}m
                    </span>
                    <span className="text-[11px]">
                      {new Date(report.capturedAt).toLocaleString()}
                    </span>
                  </div>
                  {report.note && (
                    <p className="text-xs text-white/80 bg-white/5 p-2 rounded-lg font-sans border border-white/5">
                      &quot;{report.note}&quot;
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Public ActionLog Status Timeline */}
        <div className="space-y-4 pt-4">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan" />
              Public Action Log & Audit Trail
            </h2>
            <p className="text-xs font-mono text-white/40 mt-1">
              Append-only municipal truth ledger. Changes cannot be modified or deleted.
            </p>
          </div>

          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-white/10">
            {enrichedActions.map((log) => (
              <div key={log.id} className="relative pl-9 space-y-1.5 py-1">
                <div className="absolute left-2 top-2 w-3.5 h-3.5 rounded-full bg-cyan/30 border-2 border-cyan -translate-x-1/2" />
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-cyan">{log.actorName}</span>
                  <span className="text-white/40">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="text-xs font-mono text-white/90">
                  Executed: <span className="font-bold text-white">{log.action}</span>
                  {log.fromStatus && log.toStatus && log.fromStatus !== log.toStatus && (
                    <span className="text-white/50 text-[11px] ml-2">
                      ({log.fromStatus} &rarr; {log.toStatus})
                    </span>
                  )}
                </div>

                {log.note && (
                  <p className="text-xs text-white/70 bg-white/5 p-2 rounded-lg font-sans border border-white/5">
                    &quot;{log.note}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

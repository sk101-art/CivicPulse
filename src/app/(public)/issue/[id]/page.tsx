import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { 
  MapPin, Clock, ArrowLeft, ShieldCheck, 
  Building2, ArrowRightLeft, 
  Activity, CheckCircle2, Sparkles, AlertTriangle, FileText, CloudSun, Route
} from "lucide-react";
import { PriorityBreakdown } from "@/components/priority/PriorityBreakdown";
import { RepairWindowBadge } from "@/components/desk/RepairWindowBadge";
import { LiveTrafficCard } from "@/components/traffic/LiveTrafficCard";
import { getRepairWindowForIssue } from "@/lib/traffic/repairWindow";
import { getStoredAssessmentSummary } from "@/lib/ai/storedAssessment";
import { SectionBoundary } from "@/components/ui/SectionBoundary";
import { actorDisplayName } from "@/lib/issues/actors";
import { displayLocation } from "@/lib/issues/display";
import type { PriorityBreakdown as PriorityBreakdownType } from "@/lib/priority";
import { Status, Band, EvidenceRole, Role } from "@prisma/client";
import { formatDateIST, formatDateTimeIST } from "@/lib/time/ist";

export const revalidate = 0;

export default async function PublicIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)]);

  const issueInclude = {
    agency: { select: { id: true, code: true, name: true, slaHours: true } },
    reports: { orderBy: { createdAt: "desc" as const } },
    actions: { orderBy: { createdAt: "asc" as const } },
    verifications: { orderBy: { createdAt: "desc" as const } },
  };

  // The id may be an issue id or (older links) a report id: look both up in parallel.
  const [byIssue, byReport] = await Promise.all([
    prisma.issue.findUnique({ where: { id }, include: issueInclude }),
    prisma.report.findUnique({ where: { id }, select: { issue: { include: issueInclude } } }),
  ]);
  const issue = byIssue ?? byReport?.issue ?? null;

  if (!issue) {
    notFound();
  }

  const viewerId = session?.user?.id ?? null;
  const isDesk = session?.user?.role === "AUTHORITY";
  const actorIds = Array.from(new Set(issue.actions.map((a) => a.actorId)));

  // Everything else this page needs, in one parallel batch. Optional sections degrade to null.
  const [openTask, users, aiSummary, repairWindow] = await Promise.all([
    viewerId
      ? prisma.auditTask.findFirst({
          where: { issueId: issue.id, assigneeId: viewerId, status: "OPEN" },
          select: { id: true },
        })
      : Promise.resolve(null),
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, name: true, role: true },
        })
      : Promise.resolve([]),
    getStoredAssessmentSummary(issue.aiInputHash).catch(() => null),
    isDesk ? getRepairWindowForIssue(issue.id).catch(() => null) : Promise.resolve(null),
  ]);

  // Compute current user eligibility attributes for fix verification
  const userHasOpenAuditTask = Boolean(openTask);
  const currentUser = session?.user ? { role: session.user.role } : null;
  const aiAssessment = aiSummary ? { summary: aiSummary } : null;

  // Public action log labels: display names only, never emails
  const userMap = new Map(users.map((u) => [u.id, u]));
  const enrichedActions = issue.actions.map((action) => ({
    ...action,
    actorName: actorDisplayName(action.actorId, userMap.get(action.actorId)),
  }));

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
      case "AUDIT":
        return "Citizen Audit";
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
            {!userHasOpenAuditTask && (
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                {issue.status}
              </span>
            )}
            {issue.slaBreached && (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                SLA BREACHED
              </span>
            )}
            {issue.isSeed && (
              <span data-testid="seed-tag" className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                SEED
              </span>
            )}
            <span data-testid="weather-risk-chip" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-mono text-xs font-semibold">
              <CloudSun className="w-3.5 h-3.5 text-blue-400" />
              <span>Weather: Dry (0 mm forecast)</span>
            </span>
          </div>
        </div>

        {/* Title & Location Header */}
        <div className="space-y-2">
          <span className="text-xs font-mono uppercase text-cyan tracking-widest block">
            {issue.category.replace(/_/g, " ")}
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-white">
            {displayLocation(issue.address, issue.lat, issue.lng)}
          </h1>
          <p className="text-xs font-mono text-white/70 flex flex-wrap items-center gap-1.5">
            <MapPin className="w-4 h-4 text-cyan" aria-hidden="true" />
            Lat: {issue.lat.toFixed(5)}, Lng: {issue.lng.toFixed(5)}
            {issue.segmentId && (
              <Link
                href={`/road/${issue.segmentId}`}
                data-testid="road-timeline-link"
                className="ml-3 inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
              >
                <Route className="w-3.5 h-3.5" aria-hidden="true" />
                Road timeline
              </Link>
            )}
          </p>
        </div>

        {/* Reopened In Warranty Banner & Liability Package Link */}
        {issue.status === Status.REOPENED_IN_WARRANTY && !userHasOpenAuditTask && (
          <div className="p-6 rounded-2xl bg-gradient-to-r from-rose-950/40 to-amber-950/40 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                Defect Reopened Under Warranty (Failed Durability Audit)
              </div>
              <p className="text-xs font-mono text-white/70">
                This repair degraded or failed durability checks during the active defect liability period.
                {issue.lifespanDays ? ` Measured lifespan before deterioration: ${issue.lifespanDays} days.` : ""}
              </p>
            </div>
            {currentUser?.role === Role.AUTHORITY && (
              <a
                href={`/api/issues/${issue.id}/liability`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 font-mono text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                Defect Liability Package
              </a>
            )}
          </div>
        )}

        {/* Claimed Fixed Banner & Verification CTA */}
        {issue.status === Status.CLAIMED_FIXED && !userHasOpenAuditTask && (
          <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Work Claimed Complete by Operations Desk
                </div>
                {(issue.hazardFlag || "").includes("AI_FLAGGED_FIX_CHECK") && (
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Needs citizen check — AI flagged
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-white/60">
                {(issue.hazardFlag || "").includes("AI_FLAGGED_FIX_CHECK")
                  ? "AI vision comparison flagged potential defect visibility or location mismatch between report and claim photos."
                  : "Repair reported complete by field operations."}
              </p>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold whitespace-nowrap">
              This repair is being independently audited.
            </div>
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
              {formatDateIST(issue.slaDueAt)}
            </div>
            <div className="text-xs font-mono text-white/50 pt-1">
              Target: {issue.agency?.slaHours ?? 72} hours from filing
            </div>
          </div>
        </div>

        {/* Pavement Deterioration Risk Badge */}
        {issue.deteriorationRisk && (
          <div
            data-testid="deterioration-risk-card"
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              issue.deteriorationRisk === "HIGH"
                ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                : issue.deteriorationRisk === "MED"
                ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider ${
                  issue.deteriorationRisk === "HIGH"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : issue.deteriorationRisk === "MED"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                {issue.deteriorationRisk} Deterioration Risk ({issue.deteriorationScore ?? 45}/100)
              </span>
              <span className="text-xs font-mono text-white/80">
                {issue.expectedDaysToWorsen
                  ? `Pavement worsening expected in ~${issue.expectedDaysToWorsen} days`
                  : "Pavement stable; standard wear"}
              </span>
            </div>
            {Array.isArray(issue.deteriorationDrivers) && issue.deteriorationDrivers.length > 0 && (
              <div className="text-[11px] font-mono text-white/60">
                Drivers: {(issue.deteriorationDrivers as Array<{ name?: string } | null>)
                  .map((d) => d?.name)
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Civic Analyst Assessment (Citizen-Safe) */}
        <SectionBoundary title="AI assessment">
        {aiAssessment?.summary && (
          <div data-testid="citizen-ai-summary-card" className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-cyan font-mono font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-cyan" />
                Civic Analyst Assessment
              </span>
              <span className="text-[10px] font-mono text-white/50">Citizen-Safe Brief</span>
            </div>
            <p className="text-xs text-white/90 font-sans leading-relaxed">
              {aiAssessment.summary}
            </p>
          </div>
        )}
        </SectionBoundary>

        {/* Desk View: Recommended Repair Window */}
        {isDesk && (
          <div className="space-y-2">
            <SectionBoundary title="Repair window">
              <RepairWindowBadge
                issueId={issue.id}
                initialResult={repairWindow}
                variant="page"
              />
            </SectionBoundary>
          </div>
        )}

        {/* Real-time Traffic Intelligence Card & 24h Profile */}
        <div className="space-y-2">
          <SectionBoundary title="Live traffic">
            <LiveTrafficCard
              issueId={issue.id}
              variant="page"
              dayType={(issue.bestRepairWindow as { dayType?: "WEEKDAY" | "WEEKEND" } | null)?.dayType}
            />
          </SectionBoundary>
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
            {(userHasOpenAuditTask ? issue.reports.filter(r => r.role !== EvidenceRole.CLAIM_FIX) : issue.reports).map((report) => (
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
                  {report.photoUrl.includes("photo-missing") && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-rose-600/90 text-white font-mono font-bold text-[10px] uppercase tracking-wider shadow-lg">
                      Photo Missing
                    </div>
                  )}
                  {report.aiTriage && typeof report.aiTriage === "object" && !report.photoUrl.includes("photo-missing") && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-cyan text-black font-mono font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-cyan/20">
                      <Sparkles className="w-3 h-3 text-black" />
                      <span>AI-assisted</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 px-1 text-xs font-mono text-white/60">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 font-bold">
                      Accuracy: {report.gpsAccuracyM.toFixed(1)}m
                    </span>
                    <span className="text-[11px]">
                      {formatDateTimeIST(report.capturedAt)}
                    </span>
                  </div>
                  {report.note && (
                    <p className="text-xs text-white/80 bg-white/5 p-2 rounded-lg font-sans border border-white/5 whitespace-pre-line break-words">
                      &quot;{report.note}&quot;
                    </p>
                  )}
                  {report.aiTriage && typeof report.aiTriage === "object" && (
                    <div className="p-2.5 rounded-xl bg-cyan/5 border border-cyan/20 space-y-1 text-[11px] font-mono">
                      <div className="flex items-center justify-between text-cyan font-bold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI Triage Assessment
                        </span>
                        <span>
                          {typeof (report.aiTriage as Record<string, unknown>).confidence === "number"
                            ? `${Math.round(((report.aiTriage as Record<string, unknown>).confidence as number) * 100)}% conf`
                            : "verified"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-white/70 text-[10px] pt-0.5">
                        <span>Cat: <strong className="text-white">{String((report.aiTriage as Record<string, unknown>).category || "—")}</strong></span>
                        <span>•</span>
                        <span>Size: <strong className="text-white">{String((report.aiTriage as Record<string, unknown>).size_class || "—")}</strong></span>
                        <span>•</span>
                        <span>Pos: <strong className="text-white">{String((report.aiTriage as Record<string, unknown>).lane_position || "—")}</strong></span>
                      </div>
                    </div>
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

          {userHasOpenAuditTask ? (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white/50 italic">
              Action log is temporarily withheld while you have an active independent audit assignment for this location.
            </div>
          ) : (
            <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-white/10">
              {enrichedActions.map((log) => (
              <div key={log.id} className="relative pl-9 space-y-1.5 py-1">
                <div className="absolute left-2 top-2 w-3.5 h-3.5 rounded-full bg-cyan/30 border-2 border-cyan -translate-x-1/2" />
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-cyan">{log.actorName}</span>
                  <span className="text-white/40">
                    {formatDateTimeIST(log.createdAt)}
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
          )}
        </div>
      </div>
    </div>
  );
}

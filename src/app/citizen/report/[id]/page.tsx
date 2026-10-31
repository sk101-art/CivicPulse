import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft, MapPin, Clock, Shield, AlertTriangle, CheckCircle2, Route } from "lucide-react";
import Link from 'next/link';
import { EvidenceRole } from "@prisma/client";
import { StatusTracker } from "@/components/citizen/StatusTracker";
import { VoteButton, CommentSection } from "@/components/citizen/Interactions";
import { SectionBoundary } from "@/components/ui/SectionBoundary";
import { formatDateIST } from "@/lib/time/ist";
import { categoryLabel, displayLocation } from "@/lib/issues/display";
import { formatPriority } from "@/lib/priority";
import { countIndependentConfirmations } from "@/lib/citizen/stats";
import { publicDisplayName } from "@/lib/citizen/statsPure";

const issueInclude = {
  reports: { orderBy: { createdAt: 'asc' as const } },
  assignments: { include: { personnel: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
  _count: { select: { comments: true } },
};

export default async function ReportDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ merged?: string }>;
}) {
  const [{ id }, query, session] = await Promise.all([params, searchParams, getServerSession(authOptions)]);
  if (!session) redirect('/login');

  const userId = session.user.id;

  // The id may be an issue id or (older links) a report id: look both up in parallel.
  const [byIssue, byReport] = await Promise.all([
    prisma.issue.findUnique({ where: { id }, include: issueInclude }),
    prisma.report.findUnique({ where: { id }, select: { issue: { include: issueInclude } } }),
  ]);
  const issue = byIssue ?? byReport?.issue ?? null;
  if (!issue) notFound();

  // The original reporter is the first REPORT evidence, not whoever added evidence last.
  const primaryReport = issue.reports.find((r) => r.role === EvidenceRole.REPORT) ?? issue.reports[0] ?? null;
  const latestPhoto = [...issue.reports].reverse().find((r) => r.photoUrl)?.photoUrl ?? primaryReport?.photoUrl ?? null;

  const [reporterUser, confirmations] = await Promise.all([
    primaryReport
      ? prisma.user.findUnique({ where: { id: primaryReport.userId }, select: { name: true } })
      : Promise.resolve(null),
    countIndependentConfirmations(issue.id, primaryReport?.userId ?? null),
  ]);

  const isOwner = primaryReport ? userId === primaryReport.userId : false;
  const assignedTo = issue.assignments[0]?.personnel?.name || null;
  const isResolved = ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(issue.status);
  const location = displayLocation(issue.address, issue.lat, issue.lng);
  const priority = issue.priority > 0 ? formatPriority(issue.priority) : null;
  const justMerged = query?.merged === '1';

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/citizen/dashboard" aria-label="Back to dashboard" className="p-2 -ml-2 rounded-lg hover:bg-white/5 text-slate-300">
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </Link>
          <h1 className="text-xl font-bold">Report Details</h1>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
          isResolved ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
        }`}>
          {issue.status}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {justMerged && (
          <div
            data-testid="merged-notice"
            role="status"
            className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-sm text-cyan-100 flex items-start gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-cyan-300 shrink-0" aria-hidden="true" />
            <span>
              Added to an existing report nearby. Your photo now supports this issue instead of creating a duplicate.{' '}
              <Link href={`/issue/${issue.id}`} className="underline underline-offset-2 font-semibold">
                View the public issue page
              </Link>
            </span>
          </div>
        )}

        <SectionBoundary title="Status">
          <StatusTracker
            status={issue.status}
            createdAt={issue.createdAt}
            confirmedAt={issue.status !== 'OPEN' ? issue.updatedAt : null}
            assignedAt={issue.assignments.length > 0 ? issue.assignments[0].createdAt : null}
            startedAt={issue.status === 'IN_PROGRESS' ? issue.updatedAt : null}
            resolvedAt={isResolved ? issue.updatedAt : null}
            rejectedAt={issue.status === 'REJECTED' ? issue.updatedAt : null}
            confirmedBy={null}
            assignedTo={assignedTo}
          />
        </SectionBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8 min-w-0">
            {/* Title Section Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-3xl md:text-4xl font-display font-black tracking-tight uppercase leading-none break-words min-w-0">
                    {categoryLabel(issue.category)}
                  </h2>
                  {issue.isSeed && (
                    <span data-testid="seed-tag" className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      SEED
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest text-slate-300">
                  <div className="flex items-center gap-1.5 min-w-0 break-words">
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {location}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {formatDateIST(issue.createdAt)}
                  </div>
                  {issue.segmentId && (
                    <Link
                      href={`/road/${issue.segmentId}`}
                      data-testid="road-timeline-link"
                      className="flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                    >
                      <Route className="w-3.5 h-3.5" aria-hidden="true" /> Road timeline
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Description Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">Description</h3>
              <p className="text-sm text-slate-200 leading-relaxed font-body whitespace-pre-line break-words">
                {primaryReport?.note || primaryReport?.noteEnglish || 'No additional details provided.'}
              </p>
            </div>

            {/* Evidence Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">Evidence</h3>
              <div className="aspect-video w-full rounded-xl bg-white/[0.02] border border-dashed border-white/10 flex flex-col items-center justify-center text-slate-400 gap-3 overflow-hidden relative">
                {latestPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are served as-is
                  <img src={latestPhoto} alt={`Evidence photo of the ${categoryLabel(issue.category).toLowerCase()} issue`} className="object-cover w-full h-full" />
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-white/40" aria-hidden="true" />
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/60">No Visual Proof Provided</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-8 min-w-0">
            {/* Reporter Info Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">Reporter Info</h3>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center text-cyan">
                  <Shield className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-display font-bold uppercase tracking-tight">{isOwner ? 'Your Report' : 'Community Member'}</h4>
                  <p className="text-[10px] font-mono text-slate-300 uppercase tracking-widest mt-1 truncate">
                    By {publicDisplayName(reporterUser?.name)}
                  </p>
                </div>
              </div>
            </div>

            {/* Community Support Card: confirmations from other people only */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">Community Support</h3>
                <span data-testid="confirmation-count" className="text-[10px] font-mono font-bold text-cyan">
                  {confirmations} {confirmations === 1 ? 'Confirmation' : 'Confirmations'}
                </span>
              </div>
              <VoteButton
                reportId={issue.id}
                initialVoteCount={confirmations}
                initialUserVote={0}
              />
            </div>

            {/* Priority Insight Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-magenta/10 to-electric-blue/10 border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-magenta/20 blur-[50px] pointer-events-none" />
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-magenta mb-3">Priority Insight</h3>
              <p data-testid="priority-insight" className="text-xs text-slate-200 leading-relaxed font-body relative z-10">
                {priority ? (
                  <>
                    Priority index <span className="text-white font-black">{priority.scoreFormatted} / 100</span>{' '}
                    ({priority.band.toLowerCase()}), based on severity, location and road use.
                  </>
                ) : (
                  <>This report has not been scored yet. Priorities are recalculated regularly.</>
                )}
              </p>
            </div>

            {/* Comments Section Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">Intelligence Board</h3>
              <SectionBoundary title="Comments">
                <CommentSection reportId={issue.id} />
              </SectionBoundary>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

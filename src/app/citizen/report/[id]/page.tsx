import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft, MapPin, Clock, Shield, AlertTriangle } from "lucide-react";
import Link from 'next/link';
import { StatusTracker } from "@/components/citizen/StatusTracker";
import { VoteButton, CommentSection } from "@/components/citizen/Interactions";

export default async function ReportDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = session.user.id;

  let issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      reports: { orderBy: { createdAt: 'desc' }, take: 5 },
      assignments: { include: { personnel: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { comments: true, reports: true } }
    }
  });

  let report = null;
  if (!issue) {
    report = await prisma.report.findUnique({
      where: { id },
      include: {
        issue: {
          include: {
            reports: { orderBy: { createdAt: 'desc' }, take: 5 },
            assignments: { include: { personnel: true }, orderBy: { createdAt: 'desc' }, take: 1 },
            _count: { select: { comments: true, reports: true } }
          }
        }
      }
    });
    if (report) {
      issue = report.issue;
    }
  }

  if (!issue) notFound();

  const primaryReport = report || issue.reports[0] || null;
  const reporterUser = primaryReport ? await prisma.user.findUnique({ where: { id: primaryReport.userId } }) : null;
  const isOwner = primaryReport ? userId === primaryReport.userId : false;
  const assignedTo = issue.assignments[0]?.personnel.name || null;
  const totalVotes = issue._count.reports;

  const isResolved = ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(issue.status);

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/citizen/dashboard" className="p-2 -ml-2 rounded-lg hover:bg-white/5 text-slate-400">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-xl font-bold">Report Details</h1>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
          isResolved ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          {issue.status}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            {/* Title Section Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-6">
              <div className="space-y-4">
                {(() => {
                  const displayLocation = (issue.address && issue.address.trim() && issue.address.toLowerCase() !== 'bengaluru' && !issue.address.toLowerCase().includes('pending'))
                    ? issue.address
                    : `${issue.lat.toFixed(4)}° N, ${issue.lng.toFixed(4)}° E`;

                  return (
                    <>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-3xl md:text-4xl font-display font-black tracking-tight uppercase leading-none">
                          {`${issue.category.replace(/_/g, ' ')} (${displayLocation})`}
                        </h2>
                        {issue.isSeed && (
                          <span data-testid="seed-tag" className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            SEED
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" /> {displayLocation}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> {new Date(issue.createdAt).toLocaleDateString()}
                        </div>
                        <div className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-bold text-white/60">
                          {issue.category}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Description Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Description</h3>
              <p className="text-sm text-slate-300 leading-relaxed font-body">
                {primaryReport?.note || primaryReport?.noteEnglish || 'No additional details provided.'}
              </p>
            </div>

            {/* Evidence Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Evidence</h3>
              <div className="aspect-video w-full rounded-xl bg-white/[0.02] border border-dashed border-white/10 flex flex-col items-center justify-center text-slate-600 gap-3 overflow-hidden relative">
                {primaryReport?.photoUrl ? (
                   <img src={primaryReport.photoUrl} alt="Evidence" className="object-cover w-full h-full" />
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-white/20" />
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/20">No Visual Proof Provided</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-8">
            {/* Reporter Info Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Reporter Info</h3>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center text-cyan">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold uppercase tracking-tight">{isOwner ? 'Your Report' : 'Community Member'}</h4>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">
                    By {reporterUser?.name || reporterUser?.email?.split('@')[0] || 'Community Member'}
                  </p>
                </div>
              </div>
            </div>

            {/* Community Support Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Community Support</h3>
                <span className="text-[10px] font-mono font-bold text-cyan">{totalVotes} Confirmations</span>
              </div>
              <VoteButton 
                reportId={issue.id} 
                initialVoteCount={totalVotes} 
                initialUserVote={0} 
              />
            </div>

            {/* Priority Insight Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-magenta/10 to-electric-blue/10 border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-magenta/20 blur-[50px] pointer-events-none" />
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-magenta mb-3">Priority Insight</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-body relative z-10">
                CivicPulse scored this at <span className="text-white font-black">{Math.round(issue.priority * 100)}%</span> operational priority based on category severity and importance factors.
              </p>
            </div>

            {/* Comments Section Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Intelligence Board</h3>
              <CommentSection reportId={issue.id} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

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

  const userId = (session.user as any).id;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      citizen: { include: { user: true } },
      department: true,
      votes: true,
      _count: { select: { comments: true } },
      assignments: { include: { personnel: true }, orderBy: { createdAt: 'desc' }, take: 1 }
    }
  });

  if (!report) notFound();

  const assignedTo = report.assignments[0]?.personnel.name || null;

  const isOwner = userId === report.citizen.userId;

  // Check if current user has already voted
  let currentUserVote = 0;
  if ((session.user as any).role === 'CITIZEN') {
    const profile = await prisma.citizenProfile.findUnique({ where: { userId } });
    if (profile) {
      const existingVote = report.votes.find((v: any) => v.citizenId === profile.id);
      if (existingVote) currentUserVote = existingVote.value;
    }
  }

  const totalVotes = report.votes.filter((v: any) => v.value === 1).length;

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
          report.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          {report.status}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {/* New Status Tracker */}
        <StatusTracker 
          status={report.status as any}
          createdAt={report.createdAt}
          confirmedAt={report.confirmedAt}
          assignedAt={report.assignedAt}
          startedAt={report.startedAt}
          resolvedAt={report.resolvedAt}
          rejectedAt={report.rejectedAt}
          confirmedBy={report.confirmedBy}
          assignedTo={assignedTo}
        />


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            {/* Title Section Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-6">
              <div className="space-y-4">
                <h2 className="text-3xl md:text-4xl font-display font-black tracking-tight uppercase leading-none">{report.title}</h2>
                <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> {report.address || 'GPS Coordinates Attached'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> {new Date(report.createdAt).toLocaleDateString()}
                  </div>
                  <div className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-bold text-white/60">
                    {report.category}
                  </div>
                </div>
              </div>
            </div>

            {/* Description Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Description</h3>
              <p className="text-sm text-slate-300 leading-relaxed font-body">
                {report.description}
              </p>
            </div>

            {/* Evidence Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-card border border-white/5 space-y-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Evidence</h3>
              <div className="aspect-video w-full rounded-xl bg-white/[0.02] border border-dashed border-white/10 flex flex-col items-center justify-center text-slate-600 gap-3 overflow-hidden relative">
                {report.photoUrl ? (
                   <img src={report.photoUrl} alt="Evidence" className="object-cover w-full h-full" />
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
                    By {report.citizen.user.name || report.citizen.user.email.split('@')[0]}
                  </p>
                </div>
              </div>
            </div>

            {/* Community Support Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Community Support</h3>
                <span className="text-[10px] font-mono font-bold text-cyan">{totalVotes} Upvotes</span>
              </div>
              <VoteButton 
                reportId={report.id} 
                initialVoteCount={totalVotes} 
                initialUserVote={currentUserVote} 
              />
            </div>

            {/* Priority Insight Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-magenta/10 to-electric-blue/10 border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-magenta/20 blur-[50px] pointer-events-none" />
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-magenta mb-3">Priority Insight</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-body relative z-10">
                CivicPulse AI scored this at <span className="text-white font-black">{Math.round(report.priorityScore * 100)}%</span> operational priority based on category severity and local engagement vectors.
              </p>
            </div>

            {/* Comments Section Card */}
            <div className="p-6 rounded-2xl bg-card border border-white/5 space-y-6">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">Intelligence Board</h3>
              <CommentSection reportId={report.id} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

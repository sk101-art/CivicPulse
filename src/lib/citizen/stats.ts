import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EvidenceRole, Tier } from "@prisma/client";
import { latestReportPerIssue, publicDisplayName } from "@/lib/citizen/statsPure";

/**
 * Everything the citizen dashboard and profile show, fetched in one parallel batch.
 * - reportsFiled: issues this person reported first (REPORT evidence only)
 * - votesCast: real votes only, i.e. blind-audit votes plus fix verifications. Confirming a report
 *   (a duplicate merged into an issue) is not a vote, and nobody "confirms" their own report.
 */
export async function loadCitizenOverview(userId: string, opts: { reportLimit?: number } = {}) {
  const [user, recentReports, reportsFiled, auditVotes, verifications] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { citizenProfile: true } }),
    prisma.report.findMany({
      where: { userId, role: { in: [EvidenceRole.REPORT, EvidenceRole.CONFIRM] } },
      orderBy: { createdAt: "desc" },
      take: (opts.reportLimit ?? 10) * 3,
      include: {
        issue: {
          select: {
            id: true,
            category: true,
            status: true,
            address: true,
            lat: true,
            lng: true,
            priority: true,
            isSeed: true,
            _count: { select: { comments: true } },
          },
        },
      },
    }),
    prisma.report.count({ where: { userId, role: EvidenceRole.REPORT } }),
    prisma.auditVote.count({ where: { userId } }),
    prisma.verification.count({ where: { verifierId: userId } }),
  ]);

  // A merged duplicate is evidence on an issue already listed: show each issue once.
  const reports = latestReportPerIssue(recentReports).slice(0, opts.reportLimit ?? 10);

  return {
    user,
    profile: user?.citizenProfile ?? null,
    reports,
    reportsFiled,
    votesCast: auditVotes + verifications,
  };
}

/** Confirmations from other people on an issue (the reporter's own evidence never counts). */
export async function countIndependentConfirmations(issueId: string, reporterId: string | null) {
  return prisma.report.count({
    where: {
      issueId,
      role: EvidenceRole.CONFIRM,
      ...(reporterId ? { userId: { not: reporterId } } : {}),
    },
  });
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  tier: Tier;
  reputation: number;
  isMe: boolean;
}

/** Top citizens by reputation (display names only, never emails) and the viewer's own rank. */
export async function loadLeaderboard(viewerUserId: string, viewerReputation: number, limit = 10) {
  const [top, ahead] = await Promise.all([
    prisma.citizenProfile.findMany({
      where: { user: { role: "CITIZEN" } },
      orderBy: [{ reputation: "desc" }, { id: "asc" }],
      take: limit,
      select: { reputation: true, tier: true, userId: true, user: { select: { name: true } } },
    }),
    prisma.citizenProfile.count({ where: { reputation: { gt: viewerReputation }, user: { role: "CITIZEN" } } }),
  ]);
  const rows: LeaderboardRow[] = top.map((p, i) => ({
    rank: i + 1,
    name: publicDisplayName(p.user?.name),
    tier: p.tier,
    reputation: p.reputation,
    isMe: p.userId === viewerUserId,
  }));
  return { rows, myRank: ahead + 1 };
}

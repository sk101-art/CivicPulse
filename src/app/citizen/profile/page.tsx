import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EvidenceRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { loadCitizenOverview, loadLeaderboard } from "@/lib/citizen/stats";
import { CitizenProfileView } from "@/components/citizen/CitizenProfileView";
import { displayLocation, issueTitle } from "@/lib/issues/display";
import { formatDateIST } from "@/lib/time/ist";

export const revalidate = 0;

export default async function CitizenProfile(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  if (searchParams?.tab === "settings") {
    redirect("/citizen/settings");
  }

  const initialTab = searchParams?.tab === "leaderboard" ? "leaderboard" : "reports";

  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CITIZEN") {
    redirect("/login/citizen");
  }

  const userId = session.user.id;
  if (!userId) {
    redirect("/login/citizen");
  }

  const [overview, totalDistinctIssues] = await Promise.all([
    loadCitizenOverview(userId, { reportLimit: 15 }).catch(() => null),
    prisma.issue
      .count({
        where: {
          reports: {
            some: {
              userId,
              role: { in: [EvidenceRole.REPORT, EvidenceRole.CONFIRM] },
            },
          },
        },
      })
      .catch(() => 0),
  ]);

  const user = overview?.user || {
    name: session.user.name || null,
    email: session.user.email || null,
    createdAt: new Date(),
  };

  const profile = overview?.profile || {
    reputation: 0,
    tier: "CITIZEN",
  };

  const leaderboardResult = await loadLeaderboard(userId, profile.reputation).catch(() => ({
    rows: [],
    myRank: null as number | null,
  }));

  const initialReports =
    overview?.reports?.map((r) => ({
      id: r.id,
      issueId: r.issueId,
      category: r.issue.category,
      title: issueTitle(r.issue.category, r.issue.address, r.issue.lat, r.issue.lng),
      location: displayLocation(r.issue.address, r.issue.lat, r.issue.lng),
      status: r.issue.status,
      createdAt: r.createdAt.toISOString(),
      createdAtLabel: formatDateIST(r.createdAt, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    })) || [];

  return (
    <CitizenProfileView
      initialTab={initialTab}
      user={{
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      }}
      profile={{
        reputation: profile.reputation,
        tier: profile.tier,
        reportsFiled: overview?.reportsFiled ?? 0,
        verifiedFixedCount: overview?.verifiedFixedCount ?? 0,
        verificationsCount: overview?.votesCast ?? 0,
      }}
      initialReports={initialReports}
      initialTotalReports={totalDistinctIssues}
      leaderboard={leaderboardResult.rows.map((r) => ({
        rank: r.rank,
        name: r.name,
        tier: r.tier,
        reputation: r.reputation,
        isUser: r.isMe,
      }))}
      myRank={leaderboardResult.myRank}
    />
  );
}

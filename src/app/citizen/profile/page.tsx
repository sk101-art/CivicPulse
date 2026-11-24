import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loadCitizenOverview, loadLeaderboard } from "@/lib/citizen/stats";
import { CitizenProfileView } from "@/components/citizen/CitizenProfileView";
import { formatDateIST } from "@/lib/time/ist";

export const revalidate = 0;

export default async function CitizenProfile(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const initialTab = (searchParams?.tab === 'settings' ? 'settings' : 'reports') as 'reports' | 'settings';
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CITIZEN') {
    redirect('/login');
  }

  const userId = session.user.id;
  if (!userId) redirect('/login');

  const overview = await loadCitizenOverview(userId, { reportLimit: 10 }).catch(() => null);
  const user = overview?.user || { 
    name: session.user.name || session.user.email?.split('@')[0] || 'Citizen', 
    email: session.user.email || '',
    createdAt: new Date(),
  };
  const profile = overview?.profile || { 
    reputation: 1280, 
    tier: 'CONTRIBUTOR', 
    reportsFiled: 24, 
    verificationsCount: 17 
  };

  const leaderboardResult = await loadLeaderboard(userId, profile.reputation).catch(() => ({ rows: [] }));

  // Format reports from database
  const formattedReports = overview?.reports?.map((r) => {
    const isFixed = ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.issue.status);
    const isAssigned = r.issue.status === 'ASSIGNED';
    const category = r.issue.category;
    const address = r.issue.address || 'MG Road, Ward 12';
    return {
      id: r.id,
      category,
      title: `${category.charAt(0) + category.slice(1).toLowerCase().replace(/_/g, ' ')} — ${address}`,
      location: address,
      status: r.issue.status,
      statusLabel: isFixed ? 'Resolved' : isAssigned ? 'Assigned' : 'Under Review',
      createdAt: formatDateIST(r.createdAt, { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  }) || [];

  return (
    <CitizenProfileView
      initialTab={initialTab}
      user={{
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      }}
      profile={{
        reputation: profile.reputation,
        tier: profile.tier,
        reportsFiled: overview?.reportsFiled || 24,
        verificationsCount: overview?.votesCast || 17,
      }}
      reports={formattedReports}
      verifications={[]}
      leaderboard={leaderboardResult.rows.map((r) => ({
        rank: r.rank,
        name: r.name,
        tier: `Level 3 • ${r.tier}`,
        reputation: r.reputation,
        isUser: r.isMe,
      }))}
    />
  );
}

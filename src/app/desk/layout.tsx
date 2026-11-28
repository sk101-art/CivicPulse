import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { DeskAccessOnly } from "@/components/auth/DeskAccessOnly";
import { GlobalHeader } from "@/components/layout/GlobalHeader";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login/staff');
  }
  // A signed-in citizen is told why, instead of being bounced to a login form they are already past.
  if (session.user.role !== 'AUTHORITY') {
    return <DeskAccessOnly />;
  }

  const userId = session.user.id;
  if (!userId) {
    redirect('/login/staff');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  const links: Array<{
    href: string;
    icon: string;
    label: string;
  }> = [
    { href: '/desk/dashboard', icon: 'LayoutDashboard', label: 'Operations Queue' },
    { href: '/desk/intelligence', icon: 'Compass', label: 'Ward Intelligence' },
    { href: '/desk/briefing', icon: 'FileText', label: 'Area Briefing' },
    { href: '/desk/map', icon: 'Map', label: 'Route Optimizer' },
    { href: '/desk/claim-gap', icon: 'TrendingUp', label: 'Claim Gap' },
    { href: '/desk/personnels', icon: 'User', label: 'Field Personnel' },
  ];

  const userSubtitle = user?.email === 'desk-a@civicpulse.local'
    ? 'Desk A (BBMP)'
    : user?.email === 'desk-b@civicpulse.local'
      ? 'Desk B (Traffic)'
      : 'Operations Desk';

  return (
    <div className="min-h-screen flex font-body bg-[#F3F2EB] text-[#293732]">
      <AppSidebar 
        role="AUTHORITY" 
        links={links} 
        userName={user?.name || user?.email?.split('@')[0] || 'Desk Officer'} 
        userSubtitle={userSubtitle} 
      />
      
      <div className="flex-1 flex flex-col relative z-10 w-full min-w-0 min-h-screen lg:h-screen overflow-hidden bg-[#F3F2EB]">
        <GlobalHeader role="AUTHORITY" className="shrink-0" />
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 flex flex-col">
          {children}
        </div>
      </div>

      <MobileNav links={links} />
    </div>
  );
}

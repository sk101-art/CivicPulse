import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlobalHeader } from "@/components/layout/GlobalHeader";

export default async function CitizenLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login/citizen');
  if (session.user.role === 'AUTHORITY') redirect('/desk');
  if (session.user.role !== 'CITIZEN') redirect('/login/citizen');

  const userId = session.user.id;
  if (!userId) { redirect('/login/citizen'); return null; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { citizenProfile: true }
  });

  const links: Array<{
    href: string;
    icon: string;
    label: string;
  }> = [
    { href: '/citizen/dashboard', icon: 'Home', label: 'Home' },
    { href: '/citizen/intelligence', icon: 'Compass', label: 'Ward Intelligence' },
    { href: '/citizen/report', icon: 'FileText', label: 'Report an Issue' },
    { href: '/citizen/map', icon: 'Map', label: 'Map View' },
    { href: '/citizen/audit', icon: 'CheckCircle2', label: 'Repair Verification' },
    { href: '/citizen/extra', icon: 'MapPin', label: 'Report Locations' },
    { href: '/citizen/profile', icon: 'User', label: 'Profile' },
    { href: '/citizen/settings', icon: 'Settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex font-body bg-[#F3F2EB] text-[#293732]">
      <AppSidebar 
        role="CITIZEN" 
        links={links} 
        userName={user?.name || session.user.name || session.user.email?.split('@')[0] || 'Citizen'} 
        userSubtitle={user?.citizenProfile?.tier ? `Citizen • ${user.citizenProfile.tier}` : 'Citizen • Level 3'} 
      />
      
      <div className="flex-1 flex flex-col relative z-10 w-full min-h-screen lg:h-screen overflow-hidden bg-[#F3F2EB]">
        <GlobalHeader role="CITIZEN" />
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          {children}
        </div>
      </div>

      <MobileNav links={links} />
    </div>
  );
}

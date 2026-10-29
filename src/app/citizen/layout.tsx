import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function CitizenLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CITIZEN') redirect('/login');

  const userId = session.user.id;
  if (!userId) { redirect('/login'); return null; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { citizenProfile: true }
  });

  const links: Array<{
    href: string;
    icon: 'TrendingUp' | 'User' | 'Map' | 'FileText' | 'LayoutDashboard' | 'Compass';
    label: string;
  }> = [
    { href: '/citizen/dashboard', icon: 'TrendingUp', label: 'Dashboard' },
    { href: '/citizen/audit', icon: 'Compass', label: 'Audit Tasks' },
    { href: '/citizen/profile', icon: 'User', label: 'Profile' },
    { href: '/citizen/report', icon: 'FileText', label: 'Report' },
    { href: '/citizen/map', icon: 'Map', label: 'Map View' },
    { href: '/citizen/extra', icon: 'LayoutDashboard', label: 'Extra Feature' },
  ];

  return (
    <div className="min-h-screen flex font-body bg-primary">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div style={{
          position: 'absolute', top: '-10%', right: '20%',
          width: '400px', height: '400px',
          background: 'radial-gradient(circle, rgba(0,245,212,0.04) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />
      </div>

      <AppSidebar 
        role="CITIZEN" 
        links={links} 
        userName={user?.name || 'Citizen'} 
        userSubtitle={user?.citizenProfile?.tier} 
      />
      
      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
        {children}
      </div>

      <MobileNav links={links} accentColor="var(--accent-cyan)" />
    </div>
  );
}

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'AUTHORITY') redirect('/login');

  const userId = session.user.id;
  if (!userId) { redirect('/login'); return null; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  const links: Array<{
    href: string;
    icon: 'TrendingUp' | 'User' | 'Map' | 'FileText' | 'LayoutDashboard';
    label: string;
  }> = [
    { href: '/authority/dashboard', icon: 'LayoutDashboard', label: 'Dashboard' },
    { href: '/authority/status', icon: 'TrendingUp', label: 'Operations Status' },
    { href: '/authority/tickets', icon: 'FileText', label: 'Active Tickets' },
    { href: '/authority/map', icon: 'Map', label: 'Route Optimizer' },
    { href: '/authority/personnels', icon: 'User', label: 'Field Personnel' },
  ];

  const userSubtitle = user?.email === 'desk-a@civicpulse.local'
    ? 'Desk A (BBMP)'
    : user?.email === 'desk-b@civicpulse.local'
      ? 'Desk B (Traffic)'
      : 'Operations Desk';

  return (
    <div className="min-h-screen flex font-body bg-primary">
      {/* Background grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-50"
        style={{
          backgroundImage: `linear-gradient(rgba(0,245,212,0.015) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,245,212,0.015) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      
      <AppSidebar 
        role="AUTHORITY" 
        links={links} 
        userName={user?.name || user?.email?.split('@')[0] || 'Authority'} 
        userSubtitle={userSubtitle} 
      />
      
      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
        {children}
      </div>

      <MobileNav links={links} accentColor="var(--accent-electric-blue)" />
    </div>
  );
}

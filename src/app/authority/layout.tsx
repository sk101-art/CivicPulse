import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'AUTHORITY') redirect('/login');

  const userId = (session?.user as any)?.id;
  if (!userId) { redirect('/login'); return null; }

  const userWithDept = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true },
  });

  if (!userWithDept?.departmentId) {
    return (
      <div className="min-h-screen flex items-center justify-center font-body bg-primary">
        <div className="text-center space-y-4">
          <div className="text-5xl">🏛️</div>
          <h2 className="font-display font-black text-2xl text-magenta">
            No Department Assigned
          </h2>
          <p className="text-secondary">Contact your administrator.</p>
          <a href="/login" className="text-sm font-mono text-cyan">
            Return to Login →
          </a>
        </div>
      </div>
    );
  }

  const links: any[] = [
    { href: '/authority/dashboard', icon: 'LayoutDashboard', label: 'Dashboard' },
    { href: '/authority/status', icon: 'TrendingUp', label: 'Operations Status' },
    { href: '/authority/tickets', icon: 'FileText', label: 'Active Tickets' },
    { href: '/authority/map', icon: 'Map', label: 'Route Optimizer' },
    { href: '/authority/personnels', icon: 'User', label: 'Field Personnel' },
  ];

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
        userName={userWithDept.name || 'Authority'} 
        userSubtitle={userWithDept.department?.name} 
      />
      
      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
        {children}
      </div>

      <MobileNav links={links} accentColor="var(--accent-electric-blue)" />
    </div>
  );
}

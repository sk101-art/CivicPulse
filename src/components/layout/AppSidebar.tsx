'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Radio, TrendingUp, User, Map, FileText, LayoutDashboard } from 'lucide-react';

const iconMap = {
  TrendingUp,
  User,
  Map,
  FileText,
  LayoutDashboard
};

interface SidebarLink {
  href: string;
  icon: keyof typeof iconMap;
  label: string;
}

interface AppSidebarProps {
  role: 'CITIZEN' | 'AUTHORITY';
  links: SidebarLink[];
  userName?: string;
  userSubtitle?: string;
}

export function AppSidebar({ role, links, userName, userSubtitle }: AppSidebarProps) {
  const pathname = usePathname();
  const isAuthority = role === 'AUTHORITY';
  const accentColor = isAuthority ? 'var(--accent-electric-blue)' : 'var(--accent-cyan)';
  
  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 z-40 border-r bg-secondary border-white/5">
      {/* Logo Section */}
      <div className="px-6 py-8 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-sm"
            style={{ 
              background: `linear-gradient(135deg, ${accentColor}, ${isAuthority ? '#00D1FF' : '#00F5D4'})`, 
              color: '#000',
              boxShadow: `0 0 20px ${accentColor}30`
            }}
          >CP</div>
          <div className="flex flex-col relative">
            <span className="font-display font-black text-xl tracking-tighter leading-none text-white">CIVIC</span>
            <span className="font-display font-black text-xl tracking-tighter leading-none" style={{ color: accentColor }}>PULSE</span>
            <span className="absolute -top-1 -right-8 text-[8px] font-mono border border-white/10 px-1 py-0.5 rounded text-white/30 tracking-widest bg-white/5 font-black">V2.4</span>
          </div>
        </div>
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 px-4 py-10 space-y-3">
        {links.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/citizen/dashboard' && item.href !== '/authority/dashboard' && pathname.startsWith(item.href + '/'));
          const IconComponent = iconMap[item.icon] || LayoutDashboard;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-5 py-4 rounded-xl text-sm font-bold transition-all hover:translate-x-1"
              style={{
                background: isActive ? `${accentColor}15` : 'transparent',
                color: isActive ? accentColor : 'var(--text-secondary)',
                border: isActive ? `1px solid ${accentColor}30` : '1px solid transparent',
              }}
            >
              <IconComponent className="w-5 h-5 shrink-0" />
              <span className="tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Section */}
      <div className="px-6 py-8 border-t border-white/5 space-y-6">
        {userName && (
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-xs"
              style={{ background: `${accentColor}15`, color: accentColor }}
            >
              {(userName || 'U')[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-semibold text-white truncate">{userName}</div>
              {userSubtitle && (
                <div className="text-[10px] font-mono uppercase text-muted truncate">
                  {userSubtitle}
                </div>
              )}
            </div>
          </div>
        )}
        
        {isAuthority && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-lime)' }} />
              <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'var(--accent-lime)' }} />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--accent-lime)' }}>
              SECURE LINK ACTIVE
            </span>
          </div>
        )}

        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-3 text-xs font-bold transition-all hover:text-white uppercase tracking-wider text-muted w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}

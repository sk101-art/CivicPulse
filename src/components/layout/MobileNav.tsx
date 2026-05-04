'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, User, Map, FileText, LayoutDashboard } from 'lucide-react';

const iconMap = {
  TrendingUp,
  User,
  Map,
  FileText,
  LayoutDashboard
};

interface NavLink {
  href: string;
  icon: keyof typeof iconMap;
  label: string;
}

interface MobileNavProps {
  links: NavLink[];
  accentColor?: string;
}

export function MobileNav({ links, accentColor = 'var(--accent-cyan)' }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center border-t bg-elevated/95 backdrop-blur-xl border-white/10"
      style={{ height: '72px', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {links.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/citizen/dashboard' && item.href !== '/authority/dashboard' && pathname.startsWith(item.href + '/'));
        const IconComponent = iconMap[item.icon] || LayoutDashboard;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 h-full transition-colors relative"
            style={{ color: isActive ? accentColor : 'var(--text-muted)' }}
          >
            {isActive && (
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full"
                style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
              />
            )}
            <IconComponent className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
            <span className="text-[9px] font-mono uppercase tracking-widest font-bold">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

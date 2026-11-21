'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  PlusCircle, 
  Map as MapIcon, 
  ShieldCheck, 
  User, 
  Compass, 
  LayoutDashboard, 
  FileText, 
  CheckCircle2, 
  TrendingUp, 
  MapPin 
} from 'lucide-react';

interface NavLink {
  href: string;
  icon: string;
  label: string;
}

interface MobileNavProps {
  links: NavLink[];
  accentColor?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  PlusCircle,
  Map: MapIcon,
  ShieldCheck,
  User,
  Compass,
  LayoutDashboard,
  FileText,
  CheckCircle2,
  TrendingUp,
  MapPin,
};

export function MobileNav({ links }: MobileNavProps) {
  const pathname = usePathname();

  const navItems = links && links.length > 0
    ? links.slice(0, 5).map((l) => ({
        href: l.href,
        label: l.label.length > 10 ? l.label.split(' ')[0] : l.label,
        icon: iconMap[l.icon] || Compass,
      }))
    : [
        { href: '/citizen/dashboard', label: 'Home', icon: Home },
        { href: '/citizen/intelligence', label: 'Intel', icon: Compass },
        { href: '/citizen/map', label: 'Map', icon: MapIcon },
        { href: '/citizen/audit', label: 'Audits', icon: ShieldCheck },
        { href: '/citizen/profile', label: 'Profile', icon: User },
      ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-white/95 backdrop-blur-md border-t border-[#DDDCD3] shadow-[0_-4px_20px_rgba(41,55,50,0.06)] px-2"
      style={{ height: '68px', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map((item) => {
        const isActive = pathname === item.href || (
          item.href !== '/citizen/dashboard' && item.href !== '/desk' && pathname.startsWith(item.href)
        );
        const IconComponent = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-all ${
              isActive ? 'text-[#355858]' : 'text-[#65736B] hover:text-[#293732]'
            }`}
          >
            <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-[#D4E3DF]' : ''}`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

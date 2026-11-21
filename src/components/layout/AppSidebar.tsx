'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { 
  LogOut, 
  Home, 
  User, 
  Map as MapIcon, 
  FileText, 
  Compass, 
  CheckCircle2, 
  MapPin, 
  LayoutDashboard,
  ChevronRight,
  ShieldCheck,
  Building2,
  Check
} from 'lucide-react';
import { CivicLogo } from '@/components/ui/CivicLogo';
import { CivicHallArt } from '@/components/ui/CivicHallArt';

interface SidebarLink {
  href: string;
  icon: string;
  label: string;
}

interface AppSidebarProps {
  role: 'CITIZEN' | 'AUTHORITY';
  links: SidebarLink[];
  userName?: string;
  userSubtitle?: string;
}

const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  FileText,
  Map: MapIcon,
  CheckCircle2,
  Compass,
  MapPin,
  User,
  LayoutDashboard,
  TrendingUp: Home,
  ShieldCheck,
};

export function AppSidebar({ role, links, userName, userSubtitle }: AppSidebarProps) {
  const pathname = usePathname();
  const isAuthority = role === 'AUTHORITY';

  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 z-40 bg-[#FAF9F5] border-r border-[#DDDCD3] select-none h-screen sticky top-0 justify-between relative overflow-hidden">
      
      {/* Background Cartographic Subtle Contour & Architectural base art */}
      <div className="absolute bottom-0 left-0 right-0 w-full opacity-35 pointer-events-none select-none">
        <CivicHallArt />
      </div>

      <div className="flex flex-col flex-1 relative z-10">
        {/* Top Branding Section */}
        <div className="px-6 pt-7 pb-4 space-y-3.5">
          <Link href={isAuthority ? "/desk" : "/citizen/dashboard"}>
            <CivicLogo size={40} showSubtitle={true} />
          </Link>

          {/* Role Pill */}
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#DDDCD3] shadow-[0_1px_3px_rgba(41,55,50,0.04)]">
              {isAuthority ? (
                <>
                  <Building2 className="w-3.5 h-3.5 text-[#527B7A]" />
                  <span className="text-xs font-semibold text-[#293732] tracking-tight">Municipal Staff</span>
                </>
              ) : (
                <>
                  <div className="w-3.5 h-3.5 rounded-full bg-[#E5E9E3] flex items-center justify-center text-[#527B7A]">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                  <span className="text-xs font-semibold text-[#293732] tracking-tight">Citizen</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="w-full px-6 py-1">
          <div className="w-full border-b border-[#DDDCD3]" />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {links.map((item) => {
            const isActive = pathname === item.href || (
              item.href !== '/citizen/dashboard' && 
              item.href !== '/authority/dashboard' && 
              item.href !== '/desk' && 
              pathname.startsWith(item.href + '/')
            );

            const IconComponent = iconComponents[item.icon] || FileText;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#D4E3DF] text-[#355858] font-semibold border border-[#C2D7D1] shadow-[0_2px_5px_rgba(41,55,50,0.06),inset_0_1px_0_rgba(255,255,255,0.7)]'
                    : 'text-[#65736B] hover:text-[#293732] hover:bg-[#EAECE6] border border-transparent'
                }`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#355858]' : 'text-[#65736B]'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Profile Card at Bottom */}
      <div className="p-4 relative z-20 border-t border-[#DDDCD3] bg-[#FAF9F5]/85 backdrop-blur-sm">
        <div className="w-full bg-white border border-[#DDDCD3] rounded-2xl p-3 shadow-[0_2px_8px_rgba(41,55,50,0.05),inset_0_1px_0_rgba(255,255,255,1)] flex items-center justify-between gap-2.5">
          <Link href={isAuthority ? "/desk" : "/citizen/profile"} className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-90 transition-opacity">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full overflow-hidden border border-[#DDDCD3] shadow-sm shrink-0 bg-[#E5E9E3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/avatar-ananya.jpg"
                alt={userName || 'Citizen'}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#293732] truncate">
                {userName || 'Ananya Das'}
              </div>
              <div className="text-[11px] text-[#65736B] truncate font-medium">
                {userSubtitle || (isAuthority ? 'Municipal Staff' : 'Citizen')}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#929B92] shrink-0" />
          </Link>
          
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign Out"
            className="p-1.5 text-[#929B92] hover:text-[#B76F60] hover:bg-[#FBF1EF] rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

    </aside>
  );
}

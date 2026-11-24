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
  Check,
  Settings,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { CivicLogo, CivicEmblem } from '@/components/ui/CivicLogo';
import { CivicHallArt } from '@/components/ui/CivicHallArt';
import { getInitials } from '@/lib/format/avatar';
import { useSidebar } from '@/context/SidebarContext';

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
  Settings,
};

export function AppSidebar({ role, links, userName, userSubtitle }: AppSidebarProps) {
  const pathname = usePathname();
  const isAuthority = role === 'AUTHORITY';
  const { isCollapsed, toggleSidebar } = useSidebar();

  const displayName = userName || (isAuthority ? 'Operations Desk' : 'Citizen');
  const displaySubtitle = userSubtitle || (isAuthority ? 'Municipal Staff' : 'Citizen');

  return (
    <aside 
      data-testid="app-sidebar"
      aria-expanded={!isCollapsed}
      className={`hidden lg:flex flex-col shrink-0 z-40 bg-[#FAF9F5] border-r border-[#DDDCD3] select-none h-screen sticky top-0 justify-between relative transition-[width] duration-300 ease-in-out ${
        isCollapsed ? 'w-[80px]' : 'w-[260px]'
      }`}
    >
      {/* ── TACTILE FLOATING TOGGLE BUTTON: PANEL CONTROL DESIGN ── */}
      <button
        type="button"
        data-testid="sidebar-toggle-btn"
        onClick={toggleSidebar}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-[19px] top-7 z-50 w-[38px] h-[38px] rounded-xl bg-white border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.12),0_1px_2px_rgba(41,55,50,0.06)] flex items-center justify-center text-[#527B7A] hover:text-[#355858] hover:bg-[#F3F2EB] hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#527B7A]/40"
      >
        {isCollapsed ? (
          <PanelLeftOpen className="w-[18px] h-[18px] stroke-[2.2]" />
        ) : (
          <PanelLeftClose className="w-[18px] h-[18px] stroke-[2.2]" />
        )}
      </button>

      {/* Decorative Architectural Base Art (Cleanly hidden when collapsed) */}
      <div 
        className={`absolute bottom-0 left-0 right-0 w-full pointer-events-none select-none transition-opacity duration-300 overflow-hidden ${
          isCollapsed ? 'opacity-0' : 'opacity-35'
        }`}
      >
        <CivicHallArt />
      </div>

      {/* ── TOP SECTION: LOGO & ROLE INDICATOR ── */}
      <div className="flex flex-col flex-1 relative z-10 min-h-0">
        <div className={`pt-7 pb-4 transition-all duration-300 ${isCollapsed ? 'px-3 flex flex-col items-center' : 'px-6 space-y-3.5'}`}>
          <Link 
            href={isAuthority ? "/desk" : "/citizen/dashboard"}
            title="CivicPulse • Civic Atlas"
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#527B7A]/30 rounded-xl"
          >
            {isCollapsed ? (
              <div className="flex items-center justify-center p-1 rounded-xl hover:bg-[#EAECE6] transition-colors">
                <CivicEmblem size={34} />
              </div>
            ) : (
              <CivicLogo size={40} showSubtitle={true} />
            )}
          </Link>

          {/* Role Pill */}
          {!isCollapsed ? (
            <div className="animate-in fade-in duration-200">
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
          ) : (
            /* Compact dot indicator in rail */
            <div 
              title={isAuthority ? 'Municipal Staff' : 'Citizen Contributor'}
              className="w-2 h-2 rounded-full bg-[#527B7A] ring-4 ring-[#E5E9E3] transition-all"
            />
          )}
        </div>

        {/* Subtle Horizontal Divider */}
        <div className={`w-full py-1 ${isCollapsed ? 'px-3' : 'px-6'}`}>
          <div className="w-full border-b border-[#DDDCD3]" />
        </div>

        {/* ── NAVIGATION LINKS WITH PORCELAIN TOOLTIPS ── */}
        <nav 
          data-testid="sidebar-nav"
          className={`flex-1 py-4 overflow-y-auto space-y-1.5 ${
            isCollapsed ? 'px-2 flex flex-col items-center' : 'px-4'
          }`}
        >
          {links.map((item) => {
            const isActive = pathname === item.href || (
              item.href !== '/citizen/dashboard' && 
              item.href !== '/authority/dashboard' && 
              item.href !== '/desk' && 
              pathname.startsWith(item.href + '/')
            );

            const IconComponent = iconComponents[item.icon] || FileText;

            return (
              <div key={item.href} className="relative group w-full flex justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#527B7A]/40 ${
                    isCollapsed 
                      ? 'w-11 h-11 justify-center' 
                      : 'w-full gap-3.5 px-4 py-3'
                  } ${
                    isActive
                      ? 'bg-[#D4E3DF] text-[#355858] font-semibold border border-[#C2D7D1] shadow-[0_2px_5px_rgba(41,55,50,0.06),inset_0_1px_0_rgba(255,255,255,0.7)]'
                      : 'text-[#65736B] hover:text-[#293732] hover:bg-[#EAECE6] border border-transparent'
                  }`}
                >
                  <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#355858]' : 'text-[#65736B]'}`} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>

                {/* Floating Porcelain Tooltip in Collapsed Rail */}
                {isCollapsed && (
                  <div 
                    role="tooltip"
                    className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 hidden group-hover:flex group-focus-visible:flex items-center z-50 pointer-events-none"
                  >
                    <div className="relative bg-white text-[#293732] text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.14),0_1px_3px_rgba(41,55,50,0.06)] whitespace-nowrap select-none flex items-center">
                      {/* Directional arrow caret */}
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-l border-b border-[#DDDCD3] rotate-45" />
                      <span>{item.label}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* ── USER PROFILE AT BOTTOM (EXPANDED VS COMPACT) ── */}
      <div className={`relative z-20 border-t border-[#DDDCD3] bg-[#FAF9F5]/90 backdrop-blur-sm transition-all duration-300 ${
        isCollapsed ? 'p-2 flex flex-col items-center space-y-2' : 'p-4'
      }`}>
        {!isCollapsed ? (
          <div className="w-full bg-white border border-[#DDDCD3] rounded-2xl p-3 shadow-[0_2px_8px_rgba(41,55,50,0.05),inset_0_1px_0_rgba(255,255,255,1)] flex items-center justify-between gap-2.5">
            <Link 
              href={isAuthority ? "/desk" : "/citizen/profile"} 
              className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#527B7A]/30 rounded-xl"
            >
              {/* Dynamic Initials Badge */}
              <div className="w-9 h-9 rounded-full overflow-hidden border border-[#B8D5CF] shadow-xs shrink-0 bg-[#D4E3DF] text-[#355858] font-display font-semibold text-xs flex items-center justify-center select-none">
                {getInitials(displayName, null)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#293732] truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-[#65736B] truncate font-medium">
                  {displaySubtitle}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#929B92] shrink-0" />
            </Link>
            
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-1.5 text-[#929B92] hover:text-[#B76F60] hover:bg-[#FBF1EF] rounded-lg transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B76F60]/40"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Collapsed Rail Compact User Identity */
          <div className="flex flex-col items-center space-y-2.5 py-1">
            <div className="relative group">
              <Link 
                href={isAuthority ? "/desk" : "/citizen/profile"} 
                aria-label={`Profile: ${displayName}`}
                className="w-9 h-9 rounded-full overflow-hidden border border-[#B8D5CF] shadow-xs shrink-0 bg-[#D4E3DF] text-[#355858] font-display font-semibold text-xs flex items-center justify-center select-none hover:ring-2 hover:ring-[#527B7A]/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#527B7A]/40"
              >
                {getInitials(displayName, null)}
              </Link>
              {/* Tooltip */}
              <div 
                role="tooltip"
                className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 hidden group-hover:flex group-focus-visible:flex items-center z-50 pointer-events-none"
              >
                <div className="relative bg-white text-[#293732] text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.14)] whitespace-nowrap select-none">
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-l border-b border-[#DDDCD3] rotate-45" />
                  <div className="font-semibold">{displayName}</div>
                  <div className="text-[10px] text-[#65736B] font-normal">{displaySubtitle}</div>
                </div>
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                aria-label="Sign Out"
                title="Sign Out"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[#929B92] hover:text-[#B76F60] hover:bg-[#FBF1EF] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B76F60]/40"
              >
                <LogOut className="w-4 h-4" />
              </button>
              {/* Tooltip */}
              <div 
                role="tooltip"
                className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 hidden group-hover:flex group-focus-visible:flex items-center z-50 pointer-events-none"
              >
                <div className="relative bg-white text-[#B76F60] text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.14)] whitespace-nowrap select-none">
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-l border-b border-[#DDDCD3] rotate-45" />
                  <span>Sign Out</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </aside>
  );
}

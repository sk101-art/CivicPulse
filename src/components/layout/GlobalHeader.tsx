'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CivicLogo } from '@/components/ui/CivicLogo';
import { GeoContextSelector } from '@/components/layout/GeoContextSelector';
import { NotificationCenter } from '@/components/layout/NotificationCenter';

interface GlobalHeaderProps {
  role?: 'CITIZEN' | 'AUTHORITY';
  className?: string;
}

export function GlobalHeader({ role = 'CITIZEN', className = '' }: GlobalHeaderProps) {
  const pathname = usePathname();

  // Determine current page badge or title for subtle breadcrumb
  const getPageContext = () => {
    if (pathname.includes('/citizen/dashboard')) return 'Citizen Dashboard';
    if (pathname.includes('/citizen/report')) return 'Report Defect';
    if (pathname.includes('/citizen/audit')) return 'Repair Verification';
    if (pathname.includes('/citizen/profile')) return 'Citizen Profile';
    if (pathname.includes('/citizen/map')) return 'Civic Atlas Map';
    if (pathname.includes('/desk/dashboard') || pathname === '/desk') return 'Operations Queue';
    if (pathname.includes('/desk/briefing')) return 'Area Briefing';
    if (pathname.includes('/desk/map')) return 'Route Optimizer';
    if (pathname.includes('/desk/personnels')) return 'Field Personnel';
    if (pathname.includes('/claim-gap')) return 'Claim Gap Ledger';
    if (pathname.includes('/issue/')) return 'Issue Details';
    return role === 'AUTHORITY' ? 'Municipal Desk' : 'Civic Ledger';
  };

  return (
    <header
      className={`w-full bg-[#FAF9F5]/90 backdrop-blur-md border-b border-[#DDDCD3] sticky top-0 z-[1100] px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 transition-colors ${className}`}
    >
      <div className="w-full flex items-center justify-between gap-3 max-w-[1400px] mx-auto">
        {/* Left Side: Mobile Logo / Desktop Section Context */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Branding */}
          <div className="lg:hidden shrink-0">
            <Link href={role === 'AUTHORITY' ? '/desk' : '/citizen/dashboard'}>
              <CivicLogo size={32} showSubtitle={false} />
            </Link>
          </div>

          {/* Desktop Subtitle / Breadcrumb Indicator */}
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#293732]">{getPageContext()}</span>
            <span className="text-[#929B92]">•</span>
            <span className="text-[#65736B] font-mono text-[11px]">Bengaluru Municipal Grid</span>
          </div>
        </div>

        {/* Right Side: Persistent Global Utility Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Geographical Context Selector */}
          <GeoContextSelector />

          {/* Notification Centre Bell */}
          <NotificationCenter />
        </div>
      </div>
    </header>
  );
}

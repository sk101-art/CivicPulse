'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Navigation, LogOut, Radio } from 'lucide-react';

export function AuthoritySidebarNav({ departmentName }: { departmentName: string }) {
  const pathname = usePathname();

  const links = [
    { href: '/authority/dashboard', icon: LayoutDashboard, label: 'Control Terminal' },
    { href: '/authority/map', icon: Navigation, label: 'Route Optimizer' },
  ];

  return (
    <aside
      className="hidden lg:flex flex-col w-24 hover:w-80 shrink-0 z-40 border-r transition-[width] duration-500 group relative"
      style={{
        background: 'rgba(13,13,15,0.98)',
        backdropFilter: 'blur(40px)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      {/* Logo Section */}
      <div className="px-8 py-12 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-5">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-black text-base transition-transform group-hover:scale-110"
            style={{ 
              background: 'linear-gradient(135deg, var(--accent-electric-blue), #00D1FF)', 
              color: '#000',
              boxShadow: '0 0 30px rgba(0,212,255,0.2)'
            }}
          >CP</div>
          <div className="flex flex-col opacity-0 w-0 overflow-hidden group-hover:opacity-100 group-hover:w-auto transition-all duration-300">
            <span className="font-display font-black text-2xl tracking-tighter leading-none">CIVIC</span>
            <span className="font-display font-black text-2xl tracking-tighter leading-none" style={{ color: 'var(--accent-electric-blue)' }}>PULSE</span>
          </div>
        </div>
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 px-5 py-12 space-y-4">
        {links.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-5 px-6 py-5 rounded-[1.5rem] text-sm font-black transition-all hover:translate-x-2 group/item"
              style={{
                background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
                color: active ? 'var(--accent-electric-blue)' : 'var(--text-secondary)',
                border: active ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
              }}
            >
              <item.icon className={`w-6 h-6 shrink-0 transition-all ${active ? 'scale-110' : 'group-hover/item:scale-110'}`} />
              <span className="opacity-0 w-0 overflow-hidden group-hover:opacity-100 group-hover:w-auto transition-all whitespace-nowrap uppercase tracking-[0.2em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Section */}
      <div className="px-8 py-10 border-t space-y-8" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Radio className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-lime)' }} />
            <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'var(--accent-lime)' }} />
          </div>
          <span className="text-[11px] font-mono uppercase tracking-[0.3em] opacity-0 w-0 overflow-hidden group-hover:opacity-100 group-hover:w-auto transition-all whitespace-nowrap font-black" style={{ color: 'var(--accent-lime)' }}>
            SECURE LINK ACTIVE
          </span>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-4 text-xs font-black transition-all hover:text-white uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut className="w-6 h-6 shrink-0" />
            <span className="opacity-0 w-0 overflow-hidden group-hover:opacity-100 group-hover:w-auto transition-all whitespace-nowrap">
              TERMINATE
            </span>
          </button>
        </form>
      </div>
    </aside>
  );
}

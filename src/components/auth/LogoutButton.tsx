'use client';

import React from 'react';
import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

interface LogoutButtonProps {
  className?: string;
  variant?: 'primary' | 'compact' | 'nav';
  testId?: string;
}

export function LogoutButton({ 
  className = '', 
  variant = 'primary',
  testId = 'logout-button'
}: LogoutButtonProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleLogout}
        data-testid={testId}
        aria-label="Log out"
        className={`px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/30 text-white/80 hover:text-rose-400 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${className}`}
      >
        <LogOut className="w-3.5 h-3.5 text-rose-400" />
        <span>Log out</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      data-testid={testId}
      aria-label="Log out"
      className={`px-5 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 hover:text-white font-mono text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${className}`}
    >
      <LogOut className="w-4 h-4 text-rose-400" />
      <span>Log out</span>
    </button>
  );
}

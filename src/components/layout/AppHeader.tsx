'use client';

import React from 'react';

interface AppHeaderProps {
  title: string;
  subtitle: string;
  accentColor?: string;
  actionButton?: React.ReactNode;
}

export function AppHeader({ 
  title, 
  subtitle, 
  accentColor = 'var(--accent-cyan)',
  actionButton 
}: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 px-6 sm:px-8 lg:px-10 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b backdrop-blur-2xl shrink-0"
      style={{
        background: 'rgba(10,10,11,0.9)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: accentColor }}>
          {subtitle}
        </p>
        <h1 className="font-display font-light text-2xl lg:text-3xl text-white tracking-tight uppercase flex items-center gap-4">
          {title}
        </h1>
      </div>
      
      {actionButton && (
        <div className="shrink-0">
          {actionButton}
        </div>
      )}
    </header>
  );
}

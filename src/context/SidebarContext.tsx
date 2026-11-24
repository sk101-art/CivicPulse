'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface SidebarContextValue {
  isCollapsed: boolean;
  isMounted: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const STORAGE_KEY = 'civicpulse_sidebar_collapsed';

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize from localStorage safely on client to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') {
        setIsCollapsed(true);
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, []);

  // Broadcast window resize & Leaflet resize events during and after CSS width transition
  const broadcastMapResize = useCallback(() => {
    const trigger = () => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new CustomEvent('civicpulse:map-resize'));
    };

    trigger();
    const t1 = setTimeout(trigger, 100);
    const t2 = setTimeout(trigger, 200);
    const t3 = setTimeout(trigger, 320); // After 300ms transition completes
    const t4 = setTimeout(trigger, 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore localStorage error
      }
      return next;
    });
    broadcastMapResize();
  }, [broadcastMapResize]);

  const setCollapsed = useCallback((val: boolean) => {
    setIsCollapsed(val);
    try {
      localStorage.setItem(STORAGE_KEY, String(val));
    } catch {}
    broadcastMapResize();
  }, [broadcastMapResize]);

  return (
    <SidebarContext.Provider value={{ isCollapsed, isMounted, toggleSidebar, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    return {
      isCollapsed: false,
      isMounted: true,
      toggleSidebar: () => {},
      setCollapsed: () => {},
    };
  }
  return ctx;
}

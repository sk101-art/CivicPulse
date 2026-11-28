'use client';

import React, { createContext, useContext, useCallback, useSyncExternalStore } from 'react';

interface SidebarContextValue {
  isCollapsed: boolean;
  isMounted: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const STORAGE_KEY = 'civicpulse_sidebar_collapsed';
const SIDEBAR_EVENT = 'civicpulse:sidebar-state';

function subscribeSidebar(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(SIDEBAR_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SIDEBAR_EVENT, callback);
  };
}

function getSidebarSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveSidebarState(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore localStorage errors.
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isCollapsed = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, () => false);
  const isMounted = useSyncExternalStore(() => () => {}, () => true, () => false);

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
    saveSidebarState(!getSidebarSnapshot());
    broadcastMapResize();
  }, [broadcastMapResize]);

  const setCollapsed = useCallback((val: boolean) => {
    saveSidebarState(val);
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

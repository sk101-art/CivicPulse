'use client';
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SyncContextType {
  lastUpdate: number;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [lastUpdate, setLastUpdate] = useState(0);
  const router = useRouter();

  const triggerSync = useCallback(() => {
    setLastUpdate(Date.now());
    router.refresh();
  }, [router]);

  // Client polling every 15s replaces server-sent events (SSE)
  useEffect(() => {
    const interval = setInterval(() => {
      triggerSync();
    }, 15000);

    return () => clearInterval(interval);
  }, [triggerSync]);

  return (
    <SyncContext.Provider value={{ lastUpdate, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

'use client';
import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SyncContextType {
  lastUpdate: number;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const router = useRouter();

  const triggerSync = useCallback(() => {
    setLastUpdate(Date.now());
    router.refresh();
  }, [router]);

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

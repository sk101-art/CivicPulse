import { useEffect, useState, useCallback } from 'react';
import { openDB, IDBPDatabase } from 'idb';

export interface QueuedOfflineReport {
  id: string;
  category: string;
  payload?: {
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
    nonce: string;
    photoHash: string;
    role: string;
  };
  signature?: string;
  photoBase64?: string;
  mimeType?: string;
  note?: string;
  title?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  photoData?: string;
  sizeClass?: string;
  blockedShare?: string;
  address?: string;
  offline?: boolean;
  createdAt: number;
  synced: boolean;
}

export type QueuedReportInput =
  | (Omit<QueuedOfflineReport, 'synced' | 'createdAt' | 'id'> & { id?: string })
  | {
      id?: string;
      title?: string;
      description?: string;
      category: string;
      latitude?: number;
      longitude?: number;
      lat?: number;
      lng?: number;
      photoData?: string;
    };

const DB_NAME = 'CivicPulseDB';
const STORE_NAME = 'reports_queue';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [db, setDb] = useState<IDBPDatabase | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    let ignore = false;
    async function loadCount() {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const count = await tx.objectStore(STORE_NAME).count();
        if (!ignore) {
          setPendingCount(count);
        }
      } catch {
        // ignore
      }
    }

    const handleCountChange = () => {
      void loadCount();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('civicpulse:queue-changed', handleCountChange);
    }

    void loadCount();

    return () => {
      ignore = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('civicpulse:queue-changed', handleCountChange);
      }
    };
  }, [db]);

  useEffect(() => {
    let isMounted = true;
    const initDB = async () => {
      try {
        const database = await openDB(DB_NAME, 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
          },
        });
        if (isMounted) {
          setDb(database);
        }
      } catch (err) {
        console.error('Failed to open offline reports IndexedDB:', err);
      }
    };

    void initDB();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncReports = useCallback(async () => {
    if (!db || !isOnline) return;

    try {
      // Ensure device key is registered so offline signatures are accepted
      try {
        const { initDeviceKey } = await import('@/lib/evidence/deviceKey');
        await initDeviceKey();
      } catch {
        // proceed
      }

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const allReports = (await store.getAll()) as QueuedOfflineReport[];

      let syncedAny = false;
      for (const report of allReports) {
        if (!report.synced) {
          try {
            const bodyPayload = {
              ...report,
              lat: report.payload?.lat ?? report.lat ?? report.latitude,
              lng: report.payload?.lng ?? report.lng ?? report.longitude,
            };

            const response = await fetch('/api/reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyPayload),
            });

            if (response.ok) {
              await store.delete(report.id);
              syncedAny = true;
            } else {
              console.warn('Failed to sync offline report:', report.id, response.status);
            }
          } catch (err) {
            console.error('Failed to sync offline report:', report.id, err);
          }
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('civicpulse:queue-changed'));
        if (syncedAny) {
          window.dispatchEvent(new CustomEvent('civicpulse:synced'));
        }
      }
    } catch (err) {
      console.error('Offline sync error:', err);
    }
  }, [db, isOnline]);

  const queueReport = useCallback(
    async (reportData: QueuedReportInput) => {
      if (!db) return;

      const fullReport: QueuedOfflineReport = {
        ...reportData,
        id: reportData.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: Date.now(),
        synced: false,
        offline: true,
      };

      await db.put(STORE_NAME, fullReport);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('civicpulse:queue-changed'));
      }

      if (isOnline) {
        await syncReports();
      }
    },
    [db, isOnline, syncReports]
  );

  useEffect(() => {
    if (isOnline && db) {
      void syncReports();
    }
  }, [isOnline, db, syncReports]);

  return { isOnline, pendingCount, queueReport, syncReports };
}

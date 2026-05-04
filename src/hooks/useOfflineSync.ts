import { useEffect, useState } from 'react';
import { openDB, IDBPDatabase } from 'idb';

interface QueuedReport {
  id: string;
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  photoData?: string; // base64
  createdAt: number;
  synced: boolean;
}

const DB_NAME = 'CivicPulseDB';
const STORE_NAME = 'reports_queue';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [db, setDb] = useState<IDBPDatabase | null>(null);

  useEffect(() => {
    const initDB = async () => {
      const database = await openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        },
      });
      setDb(database);
    };

    initDB();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncReports = async () => {
    if (!db || !isOnline) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const unsynced = await store.getAll();

    for (const report of unsynced) {
      if (!report.synced) {
        try {
          const response = await fetch('/api/reports', {
            method: 'POST',
            body: JSON.stringify(report),
            headers: { 'Content-Type': 'application/json' },
          });

          if (response.ok) {
            await store.put({ ...report, synced: true });
          }
        } catch (error) {
          console.error('Failed to sync report:', report.id, error);
        }
      }
    }
  };

  const queueReport = async (report: Omit<QueuedReport, 'synced' | 'createdAt'>) => {
    if (!db) return;

    const fullReport: QueuedReport = {
      ...report,
      // eslint-disable-next-line react-hooks/purity
      createdAt: Date.now(),
      synced: false,
    };

    await db.put(STORE_NAME, fullReport);
    
    if (isOnline) {
      await syncReports();
    }
  };


  useEffect(() => {
    if (isOnline && db) {
      syncReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, db]);

  return { isOnline, queueReport, syncReports };
}

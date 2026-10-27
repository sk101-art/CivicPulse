'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface Report {
  id: string;
  title: string;
  status: string;
  category: string;
  priorityScore: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  createdAt?: string | Date;
  voteCount?: number;
  commentCount?: number;
}

export function useReports(options: {
  endpoint: string;
  autoRefresh?: number;
  initialData?: Report[];
} = { endpoint: '/api/reports' }) {
  const [reports, setReports] = useState<Report[]>(() => options.initialData || []);
  const [loading, setLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch(options.endpoint);
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data) ? data : data.reports || []);
      } else {
        setError('Failed to fetch reports');
      }
    } catch {
      setError('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  }, [options.endpoint]);

  const invalidate = useCallback(() => {
    fetchReports();
    router.refresh();
  }, [fetchReports, router]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch(options.endpoint);
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setReports(Array.isArray(data) ? data : data.reports || []);
          }
        } else {
          if (!ignore) setError('Failed to fetch reports');
        }
      } catch {
        if (!ignore) setError('Failed to fetch reports');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [options.endpoint]);

  // Auto-refresh interval
  useEffect(() => {
    if (options.autoRefresh && options.autoRefresh > 0) {
      const interval = setInterval(() => {
        fetchReports();
      }, options.autoRefresh);
      return () => clearInterval(interval);
    }
  }, [options.autoRefresh, fetchReports]);

  return { reports, loading, error, refetch: fetchReports, invalidate };
}

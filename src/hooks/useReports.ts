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
  lat?: number;
  lng?: number;
  priority?: number;
  address?: string | null;
  createdAt?: string | Date;
  voteCount?: number;
  commentCount?: number;
  isSeed?: boolean;
}

export interface RawReportInput {
  id: string;
  title?: string;
  status?: string;
  category?: string;
  priorityScore?: number;
  priority?: number;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  address?: string | null;
  createdAt?: string | Date;
  voteCount?: number;
  commentCount?: number;
  isSeed?: boolean;
}

function normalizeReport(item: RawReportInput): Report {
  const latitude = typeof item.latitude === 'number' ? item.latitude : typeof item.lat === 'number' ? item.lat : 0;
  const longitude = typeof item.longitude === 'number' ? item.longitude : typeof item.lng === 'number' ? item.lng : 0;
  const priorityScore = typeof item.priorityScore === 'number' ? item.priorityScore : typeof item.priority === 'number' ? item.priority : 0;
  const title = item.title || (item.category ? `${item.category.replace(/_/g, ' ')} at ${item.address || 'Bengaluru'}` : 'Report');

  return {
    ...item,
    id: item.id,
    latitude,
    longitude,
    lat: item.lat ?? latitude,
    lng: item.lng ?? longitude,
    priorityScore,
    priority: item.priority ?? priorityScore,
    title,
    status: item.status || 'OPEN',
    category: item.category || 'OTHER',
  };
}

export interface UseReportsOptions {
  endpoint?: string;
  wardId?: string | null;
  category?: string | null;
  status?: string | null;
  autoRefresh?: number;
  initialData?: Report[];
}

export function useReports(options: UseReportsOptions = { endpoint: '/api/reports' }) {
  const [reports, setReports] = useState<Report[]>(() => (options.initialData || []).map(normalizeReport));
  const [loading, setLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const getEffectiveUrl = useCallback(() => {
    const rawEndpoint = options.endpoint || '/api/reports';
    const [path, queryString] = rawEndpoint.split('?');
    const params = new URLSearchParams(queryString || '');
    if (options.wardId) {
      params.set('wardId', options.wardId);
    }
    if (options.category && options.category !== 'ALL') {
      params.set('category', options.category);
    }
    if (options.status) {
      params.set('status', options.status);
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }, [options.endpoint, options.wardId, options.category, options.status]);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = getEffectiveUrl();
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rawList: RawReportInput[] = Array.isArray(data) ? data : data.reports || data.issues || [];
        setReports(rawList.map(normalizeReport));
      } else {
        setError('Failed to fetch reports');
      }
    } catch {
      setError('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  }, [getEffectiveUrl]);

  const invalidate = useCallback(() => {
    fetchReports();
    router.refresh();
  }, [fetchReports, router]);

  useEffect(() => {
    const handleSync = () => {
      fetchReports();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('civicpulse:synced', handleSync);
      return () => {
        window.removeEventListener('civicpulse:synced', handleSync);
      };
    }
  }, [fetchReports]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const url = getEffectiveUrl();
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            const rawList: RawReportInput[] = Array.isArray(data) ? data : data.reports || data.issues || [];
            setReports(rawList.map(normalizeReport));
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
  }, [getEffectiveUrl]);

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

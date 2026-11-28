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
  photoUrl?: string | null;
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
  photoUrl?: string | null;
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
  const {
    endpoint = '/api/reports',
    wardId,
    category,
    status,
    autoRefresh,
    initialData,
  } = options;

  const [reports, setReports] = useState<Report[]>(() => (initialData || []).map(normalizeReport));
  const [loading, setLoading] = useState(() => !initialData);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const getEffectiveUrl = useCallback(() => {
    const rawEndpoint = endpoint || '/api/reports';
    const [path, queryString] = rawEndpoint.split('?');
    const params = new URLSearchParams(queryString || '');
    if (wardId) {
      params.set('wardId', wardId);
    }
    if (category && category !== 'ALL') {
      params.set('category', category);
    }
    if (status) {
      params.set('status', status);
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }, [endpoint, wardId, category, status]);

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
    if (autoRefresh && autoRefresh > 0) {
      const interval = setInterval(() => {
        fetchReports();
      }, autoRefresh);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchReports]);

  return { reports, loading, error, refetch: fetchReports, invalidate };
}

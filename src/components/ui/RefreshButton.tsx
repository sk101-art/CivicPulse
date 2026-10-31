'use client';
import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from '@/lib/toast';

interface RefreshButtonProps {
  onRefresh?: () => Promise<void> | void;
  className?: string;
}

export function RefreshButton({ onRefresh, className = '' }: RefreshButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      if (onRefresh) await onRefresh();
      router.refresh();
      toast({ title: 'Synced', description: 'Data refreshed successfully', variant: 'success' });
    } catch {
      toast({ title: 'Sync Failed', description: 'Could not refresh data', variant: 'error' });
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <button
      type="button"
      aria-label="Refresh"
      title="Refresh"
      onClick={handleRefresh}
      disabled={loading}
      className={`p-2 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:text-white hover:border-white/30 transition-all ${className}`}
    >
      <RotateCcw aria-hidden="true" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
    </button>
  );
}

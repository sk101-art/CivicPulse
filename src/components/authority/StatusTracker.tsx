'use client';

import { useState } from 'react';
import { 
  ShieldCheck, AlertTriangle, Loader2, 
  XCircle, PlayCircle 
} from 'lucide-react';
import { toast } from 'sonner';

interface StatusTrackerProps {
  reportId?: string;
  status: string;
  onUpdate?: () => void;
}

export function AuthorityStatusTracker({ status }: StatusTrackerProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: 'confirm' | 'reject' | 'start') => {
    setLoading(action);
    try {
      toast.info(`Action ${action} will be available in T25 via state machine.`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-elevated/50 border border-white/5 rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 font-bold">Operational Actions</h3>
        <div className={`px-3 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest ${
          status === 'OPEN' ? 'bg-blue/10 text-blue border border-blue/20' :
          status === 'CONFIRMED' ? 'bg-cyan/10 text-cyan border border-cyan/20' :
          'bg-white/5 text-white/40 border border-white/10'
        }`}>
          Status: {status}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {status === 'OPEN' && (
          <>
            <button
              onClick={() => handleAction('confirm')}
              disabled={!!loading}
              className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-cyan text-black font-display font-bold text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-cyan/20 disabled:opacity-50"
            >
              {loading === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Confirm Issue
            </button>
            <button
              onClick={() => handleAction('reject')}
              disabled={!!loading}
              className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-white/5 text-magenta font-display font-bold text-xs uppercase tracking-widest border border-magenta/20 hover:bg-magenta/5 transition-all disabled:opacity-50"
            >
              {loading === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Reject Report
            </button>
          </>
        )}

        {status === 'CONFIRMED' && (
          <div className="md:col-span-2 p-4 rounded-2xl bg-cyan/5 border border-cyan/10 flex items-center gap-4">
            <AlertTriangle className="w-5 h-5 text-cyan animate-pulse" />
            <p className="text-xs text-cyan/80 font-medium">Issue confirmed. Proceed to staff assignment to begin resolution.</p>
          </div>
        )}

        {status === 'ASSIGNED' && (
          <button
            onClick={() => handleAction('start')}
            disabled={!!loading}
            className="md:col-span-2 flex items-center justify-center gap-3 py-4 rounded-2xl bg-lime text-black font-display font-bold text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-lime/20 disabled:opacity-50"
          >
            {loading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Mark Work Started
          </button>
        )}
      </div>
    </div>
  );
}

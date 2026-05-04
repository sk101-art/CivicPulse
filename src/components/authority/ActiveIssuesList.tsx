'use client';

import { useState } from 'react';
import { 
  CheckCircle, X, Camera, Send, Loader2,
  ClipboardCheck, UserPlus, MapPin, ShieldCheck, Hash
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdrop, modalContent, fadeUp, staggerContainer } from '@/lib/framer';
import { toast } from '@/lib/toast';

import { AssignModal } from './AssignModal';

interface IssueItem {
  id: string;
  title: string;
  category: string;
  status: string;
  priorityScore: number;
  slaBreached: boolean;
  voteCount: number;
  commentCount: number;
  createdAt: Date;
  slaHours: number;
  address: string;
}

export function ActiveIssuesList({ issues }: { issues: IssueItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  // Track loading per item ID to accommodate multiple simultaneous actions
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [resolveData, setResolveData] = useState({ desc: '', photo: '' });
  const router = useRouter();

  const activeIssues = issues.filter(i => i.status !== 'RESOLVED');
  const currentIssue = issues.find(i => i.id === selectedId);

  const setItemLoading = (id: string, loading: boolean) => {
    setLoadingItems(prev => ({ ...prev, [id]: loading }));
  };

  const handleResolve = async () => {
    if (!selectedId) return;
    setItemLoading(selectedId, true);
    try {
      const res = await fetch(`/api/reports/${selectedId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolveData)
      });
      if (res.ok) {
        setIsResolving(false);
        setSelectedId(null);
        setResolveData({ desc: '', photo: '' });
        toast({ title: 'Success', description: 'Resolution recorded.', variant: 'success' });
        router.refresh();
      } else {
        const text = await res.text();
        toast({ title: 'Error', description: text || 'Failed to resolve', variant: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: e.message, variant: 'error' });
    } finally {
      setItemLoading(selectedId, false);
    }
  };

  const handleConfirm = async (id: string) => {
    setItemLoading(id, true);
    try {
      const res = await fetch(`/api/reports/${id}/confirm`, { method: 'POST' });
      if (res.ok) {
        toast({ title: 'Verified', description: 'Issue has been confirmed.', variant: 'success' });
        router.refresh();
      } else {
        const text = await res.text();
        toast({ title: 'Verification Failed', description: text || 'Server error', variant: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Verification Error', description: e.message, variant: 'error' });
    } finally {
      setItemLoading(id, false);
    }
  };

  const handleAssignConfirm = async (personnelId: string) => {
    if (!selectedId) return;
    setItemLoading(selectedId, true);
    try {
      const res = await fetch(`/api/reports/${selectedId}/assign`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnelId })
      });
      if (res.ok) {
        setIsAssigning(false);
        setSelectedId(null);
        toast({ title: 'Assigned', description: 'Personnel deployed successfully.', variant: 'success' });
        router.refresh();
      } else {
        const text = await res.text();
        toast({ title: 'Assignment Failed', description: text || 'Server error', variant: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: e.message, variant: 'error' });
    } finally {
      setItemLoading(selectedId, false);
    }
  };

  const getSeverityColor = (score: number) => {
    if (score >= 0.8) return 'var(--accent-magenta)';
    if (score >= 0.5) return 'var(--accent-amber)';
    return 'var(--accent-electric-blue)';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'OPEN': return 'Verification Required';
      case 'CONFIRMED': return 'Assignment Pending';
      case 'ASSIGNED': return 'Personnel Deployed';
      case 'IN_PROGRESS': return 'Operation In Progress';
      default: return status;
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-amber';
      case 'CONFIRMED': return 'bg-cyan';
      case 'ASSIGNED': return 'bg-electric-blue';
      case 'IN_PROGRESS': return 'bg-lime';
      default: return 'bg-white/30';
    }
  };

  return (
    <div className="flex flex-col h-full font-body">
      {activeIssues.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 py-20 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 bg-lime/10 border border-lime/20">
            <CheckCircle className="w-8 h-8 text-lime" />
          </div>
          <h3 className="font-display font-bold text-xl text-white mb-2 uppercase tracking-tight">Queue Clear</h3>
          <p className="text-[10px] font-mono uppercase tracking-widest text-secondary font-bold">
            All assigned issues resolved
          </p>
        </div>
      ) : (
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 custom-scrollbar pb-10"
        >
          {activeIssues.map((issue) => {
            const severity = getSeverityColor(issue.priorityScore);
            const pct = Math.round(issue.priorityScore * 100);
            const isLoading = loadingItems[issue.id];
            
            return (
              <motion.div 
                key={issue.id} 
                variants={fadeUp}
                className="group rounded-2xl border transition-all relative overflow-hidden bg-white/[0.02] flex flex-col hover:bg-white/[0.04]"
                style={{ borderColor: `${severity}20` }}
              >
                {/* Priority + Status Header */}
                <div className="p-6 pb-0 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-display font-black tracking-tighter leading-none" style={{ color: severity, fontVariantNumeric: 'tabular-nums' }}>
                      {pct}
                    </span>
                    <span className="text-[9px] font-mono uppercase tracking-widest opacity-25 font-bold">pts</span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(issue.status)} animate-pulse`} />
                      <span className="text-[8px] font-mono uppercase tracking-widest text-white/50 font-bold">{issue.status}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[7px] font-mono uppercase tracking-widest opacity-20 font-bold">
                      <Hash className="w-2.5 h-2.5" />
                      {issue.id.slice(-6)}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 space-y-3">
                  <h4 className="font-display font-bold text-base text-white uppercase tracking-tight leading-snug group-hover:text-cyan transition-colors line-clamp-2">
                    {issue.title}
                  </h4>
                  <span className="inline-block px-2.5 py-1 rounded-md text-[8px] font-mono font-bold uppercase tracking-widest bg-white/5 border border-white/5 text-white/40">
                    {issue.category}
                  </span>
                  <div className="flex items-start gap-2 text-white/25">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    <p className="text-[10px] font-mono uppercase tracking-wider leading-relaxed line-clamp-2">
                      {issue.address || 'Coordinates pending'}
                    </p>
                  </div>
                </div>

                {/* Action */}
                <div className="p-6 pt-0">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(issue.status)} animate-pulse`} />
                      <span className="text-[8px] font-mono uppercase tracking-widest font-bold text-white/30">
                        {getStatusLabel(issue.status)}
                      </span>
                    </div>

                    {issue.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => handleConfirm(issue.id)}
                        disabled={isLoading}
                        className="w-full py-3 rounded-xl bg-cyan text-black font-display font-bold text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-cyan/20 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        Verify Issue
                      </button>
                    )}

                    {(issue.status === 'CONFIRMED' || issue.status === 'ASSIGNED') && (
                      <button
                        type="button"
                        onClick={() => { setSelectedId(issue.id); setIsAssigning(true); }}
                        className="w-full py-3 rounded-xl border border-amber/30 bg-amber/10 text-amber font-display font-bold text-[11px] uppercase tracking-widest hover:bg-amber/20 transition-all flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {issue.status === 'ASSIGNED' ? 'Re-assign Personnel' : 'Assign Personnel'}
                      </button>
                    )}

                    {(issue.status === 'ASSIGNED' || issue.status === 'IN_PROGRESS') && (
                      <button
                        type="button"
                        onClick={() => { setSelectedId(issue.id); setIsResolving(true); }}
                        className="w-full py-3 rounded-xl bg-lime text-black font-display font-bold text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-lime/20 flex items-center justify-center gap-2"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Complete Resolution
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Resolution Modal */}
      <AnimatePresence>
        {isResolving && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
            onClick={() => { setIsResolving(false); setSelectedId(null); }}
          >
             <motion.div 
               variants={modalBackdrop}
               initial="hidden"
               animate="visible"
               exit="exit"
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
             />
             
             <motion.div 
               variants={modalContent}
               initial="hidden"
               animate="visible"
               exit="exit"
               onClick={(e) => e.stopPropagation()}
               className="relative w-full max-w-xl p-8 md:p-12 space-y-10 shadow-2xl overflow-hidden rounded-[2rem] bg-card border border-white/5"
             >
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 blur-[80px] opacity-10 pointer-events-none"
                  style={{ background: 'radial-gradient(circle, var(--accent-electric-blue), transparent 70%)' }}
                />

                <button 
                  onClick={() => { setIsResolving(false); setSelectedId(null); setResolveData({ desc: '', photo: '' }); }}
                  className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="space-y-3 relative z-10">
                   <p className="text-[10px] font-mono uppercase tracking-widest font-bold text-electric-blue opacity-70">Case Update</p>
                   <h2 className="text-3xl font-display font-bold text-white tracking-tight uppercase">Resolve Issue</h2>
                </div>

                <div className="relative z-10 space-y-8">
                   <div className="space-y-6">
                      <div className="space-y-3 p-6 bg-black/20 rounded-2xl border border-white/5">
                         <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">Resolution Summary</label>
                         <textarea 
                            className="neon-input w-full p-4 text-sm resize-none min-h-[140px] leading-relaxed rounded-xl"
                            placeholder="Describe the corrective action taken..."
                            value={resolveData.desc}
                            onChange={(e) => setResolveData({...resolveData, desc: e.target.value})}
                         />
                      </div>

                      <div className="p-6 bg-black/20 rounded-2xl border border-white/5">
                        <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block mb-4">Visual Proof</label>
                        <div 
                          className="aspect-video w-full rounded-xl border border-dashed border-white/10 bg-white/2 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-cyan/30 transition-all"
                        >
                           <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 group-hover:bg-cyan/10 transition-all mb-3">
                              <Camera className="w-5 h-5 text-white/30 group-hover:text-cyan" />
                           </div>
                           <span className="text-[9px] font-mono uppercase tracking-widest text-white/20 group-hover:text-white">Upload Completion Proof</span>
                        </div>
                      </div>
                   </div>

                   <div className="flex items-center gap-4">
                     <button 
                       type="button"
                       onClick={() => { setIsResolving(false); setSelectedId(null); }}
                       className="flex-1 py-4 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 hover:bg-white/5 transition-all"
                     >
                       Cancel
                     </button>
                     <button 
                      type="button"
                      onClick={handleResolve}
                      disabled={selectedId ? loadingItems[selectedId] : false || !resolveData.desc}
                      className="flex-[2] neon-btn py-4 flex items-center justify-center gap-3 disabled:opacity-50 text-sm tracking-widest uppercase font-bold"
                      style={{ background: 'var(--accent-electric-blue)', color: '#0A0A0B' }}
                     >
                        {(selectedId && loadingItems[selectedId]) ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5" />
                            Submit Resolution
                          </>
                        )}
                     </button>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Assignment Modal */}
      <AnimatePresence>
        {isAssigning && currentIssue && (
          <AssignModal 
            issue={currentIssue} 
            onClose={() => { setIsAssigning(false); setSelectedId(null); }}
            onAssign={handleAssignConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

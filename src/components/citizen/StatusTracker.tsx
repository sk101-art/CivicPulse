'use client';

import { motion } from 'framer-motion';
import { 
  CheckCircle2, Clock, ShieldCheck, UserCircle2, 
  PlayCircle, CheckCircle, XCircle, ChevronRight,
  TrendingUp, Calendar, MapPin, User
} from 'lucide-react';
import { format, differenceInMinutes, formatDistanceToNow } from 'date-fns';

type Status = 'OPEN' | 'CONFIRMED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

interface StatusTrackerProps {
  status: Status;
  createdAt: string | Date;
  confirmedAt?: string | Date | null;
  assignedAt?: string | Date | null;
  startedAt?: string | Date | null;
  resolvedAt?: string | Date | null;
  rejectedAt?: string | Date | null;
  confirmedBy?: string | null;
  assignedTo?: string | null;
}

export function StatusTracker({ 
  status, 
  createdAt, 
  confirmedAt, 
  assignedAt, 
  startedAt, 
  resolvedAt, 
  rejectedAt,
  confirmedBy,
  assignedTo
}: StatusTrackerProps) {
  
  const stages = [
    { key: 'OPEN', label: 'Reported', icon: Calendar, time: createdAt },
    { key: 'CONFIRMED', label: 'Confirmed', icon: ShieldCheck, time: confirmedAt, by: confirmedBy },
    { key: 'ASSIGNED', label: 'Assigned', icon: UserCircle2, time: assignedAt, to: assignedTo },
    { key: 'IN_PROGRESS', label: 'In Progress', icon: PlayCircle, time: startedAt },
    { key: 'RESOLVED', label: 'Resolved', icon: CheckCircle, time: resolvedAt },
  ];

  if (status === 'REJECTED') {
    stages.push({ key: 'REJECTED', label: 'Rejected', icon: XCircle, time: rejectedAt });
  }

  const getStatusIndex = (s: string) => {
    const order = ['OPEN', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
    return order.indexOf(s);
  };

  const currentIndex = getStatusIndex(status);

  const calculateTimeDiff = (start: string | Date, end: string | Date) => {
    const diff = differenceInMinutes(new Date(end), new Date(start));
    if (diff < 60) return `${diff}m`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hours}h ${mins}m`;
  };

  const getTotalTime = () => {
    const end = resolvedAt || rejectedAt || new Date();
    return calculateTimeDiff(createdAt, end);
  };

  return (
    <div className="w-full bg-card/50 border border-white/5 rounded-[2.5rem] p-8 md:p-10 space-y-10 relative overflow-hidden backdrop-blur-xl">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 blur-[100px] opacity-[0.03] pointer-events-none bg-accent-cyan" />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="space-y-1">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 font-bold">Progress Protocol</h3>
          <h2 className="text-2xl font-display font-bold text-white uppercase tracking-tight">Status Tracker</h2>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">Total Elapsed</span>
          <span className="text-lg font-display font-bold text-cyan">{getTotalTime()}</span>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative pt-10 pb-4">
        <div className="flex justify-between relative z-10">
          {stages.slice(0, 5).map((stage, idx) => {
            const isCompleted = getStatusIndex(stage.key) < currentIndex || status === 'RESOLVED';
            const isCurrent = stage.key === status;
            const isUpcoming = getStatusIndex(stage.key) > currentIndex && status !== 'RESOLVED';
            
            return (
              <div key={stage.key} className="flex flex-col items-center group">
                <div className="relative">
                   {/* Connection Line */}
                   {idx < 4 && (
                     <div className={`absolute left-full top-1/2 -translate-y-1/2 w-[calc(100vw/5-40px)] md:w-[120px] h-[2px] z-0 transition-all duration-700 ${
                       getStatusIndex(stages[idx+1].key) <= currentIndex || status === 'RESOLVED' ? 'bg-cyan' : 'bg-white/5'
                     }`} />
                   )}
                   
                   <motion.div 
                     initial={false}
                     animate={isCurrent ? { scale: [1, 1.2, 1], opacity: 1 } : { scale: 1 }}
                     transition={isCurrent ? { repeat: Infinity, duration: 2 } : {}}
                     className={`w-10 h-10 rounded-full flex items-center justify-center relative z-10 border-2 transition-all duration-500 ${
                       isCompleted ? 'bg-cyan border-cyan text-black' : 
                       isCurrent ? 'bg-black border-cyan text-cyan shadow-[0_0_20px_rgba(0,245,212,0.4)]' : 
                       'bg-black border-white/10 text-white/20'
                     }`}
                   >
                     {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <stage.icon className="w-5 h-5" />}
                   </motion.div>
                </div>
                
                <div className="mt-4 text-center">
                  <p className={`text-[9px] font-mono uppercase tracking-widest font-bold transition-colors ${
                    isCompleted || isCurrent ? 'text-white' : 'text-white/20'
                  }`}>
                    {stage.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline Feed */}
      <div className="space-y-8 pt-8 border-t border-white/5 relative z-10">
        {stages.map((stage, idx) => {
          if (!stage.time) return null;
          
          const prevStage = idx > 0 ? stages[idx-1] : null;
          const timeTaken = prevStage?.time ? calculateTimeDiff(prevStage.time, stage.time) : null;

          return (
            <motion.div 
              key={stage.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="flex items-start gap-6 group"
            >
              <div className="flex flex-col items-center py-1">
                <div className={`w-2 h-2 rounded-full ${stage.key === status ? 'bg-cyan animate-pulse' : 'bg-white/20'}`} />
                {idx < stages.filter(s => s.time).length - 1 && (
                  <div className="w-[1px] h-16 bg-white/5 group-hover:bg-white/10 transition-colors mt-2" />
                )}
              </div>
              
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-black text-white/80">{stage.label}</span>
                    {timeTaken && idx > 0 && (
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                        {timeTaken} jump
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-white/20">{format(new Date(stage.time), 'MMM d, h:mm a')}</span>
                </div>
                
                <div className="flex items-center gap-4 text-[11px] text-white/40 font-body">
                  {stage.key === 'OPEN' && (
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3 text-cyan/50" />
                      <span>Initial transmission received</span>
                    </div>
                  )}
                  {stage.key === 'CONFIRMED' && stage.by && (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-cyan/50" />
                      <span>Verified by {stage.by}</span>
                    </div>
                  )}
                  {stage.key === 'ASSIGNED' && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-amber/50" />
                      <span>Dispatch assigned to {stage.to || 'Field Team'}</span>
                    </div>
                  )}
                  {stage.key === 'IN_PROGRESS' && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-lime/50" />
                      <span>Operations active on-site</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

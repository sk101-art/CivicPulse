'use client';

import { useState, useEffect } from 'react';
import { X, Send, MapPin, AlertCircle, User, Loader2, Plus, Users, CheckCircle2, Sparkles } from 'lucide-react';
import { motion as m, AnimatePresence } from 'framer-motion';
import { modalBackdrop, modalContent } from '@/lib/framer';

interface Personnel {
  id: string;
  name: string;
  role: string;
}

interface AssignModalProps {
  issue?: {
    id: string;
    title: string;
    category: string;
    address: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onAssign: (personnelId: string) => void;
}

export function AssignModal({ issue, isOpen, onClose, onAssign }: AssignModalProps) {
  const [selectedAuth, setSelectedAuth] = useState('');
  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deployedName, setDeployedName] = useState('');
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Field Worker', contact: '' });

  useEffect(() => {
    async function fetchStaff() {
      try {
        const res = await fetch('/api/personnels');
        if (res.ok) {
          const data = await res.json();
          setPersonnels(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchStaff();
  }, []);

  const suggestion = issue ? `Deploy specialized repair unit to ${issue.address}. Category [${issue.category}] requires immediate intervention to maintain grid stability.` : '';

  const handleConfirm = async () => {
    if (!selectedAuth) return;
    setSubmitting(true);
    const person = personnels.find(p => p.id === selectedAuth);
    setDeployedName(person?.name || 'Operative');
    
    try {
      await onAssign(selectedAuth);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch {
      setSubmitting(false);
    }
  };

  const handleAddAndAssign = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/personnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff)
      });
      if (res.ok) {
        const data = await res.json();
        setDeployedName(newStaff.name);
        await onAssign(data.id);
        setShowSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1800);
      }
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaff.name) return;
    try {
      const res = await fetch('/api/personnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff)
      });
      if (res.ok) {
        const data = await res.json();
        setPersonnels(prev => [...prev, data]);
        setSelectedAuth(data.id);
        setShowAddForm(false);
        setNewStaff({ name: '', role: 'Field Worker', contact: '' });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && issue && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={onClose}
        >
          <m.div 
            variants={modalBackdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          
          <m.div 
            variants={modalContent}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl p-8 md:p-10 space-y-8 shadow-2xl overflow-hidden rounded-[2rem] bg-card border border-white/5"
          >
            <div className="absolute top-0 right-0 w-64 h-64 blur-[80px] opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, var(--accent-amber), transparent 70%)' }}
            />

            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors z-20"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Success State */}
            <AnimatePresence>
              {showSuccess && (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-card rounded-[2rem] p-8"
                >
                  <m.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="w-20 h-20 rounded-full bg-lime/15 border border-lime/30 flex items-center justify-center mb-6 shadow-xl shadow-lime/10"
                  >
                    <CheckCircle2 className="w-10 h-10 text-lime" />
                  </m.div>
                  <m.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-center space-y-2"
                  >
                    <div className="flex items-center justify-center gap-2 text-lime">
                      <Sparkles className="w-4 h-4" />
                      <h3 className="text-xl font-display font-bold uppercase tracking-tight">Deployed</h3>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-white/60 font-medium">{deployedName} assigned to mission</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/25">{issue.title}</p>
                  </m.div>
                </m.div>
              )}
            </AnimatePresence>

            <div className="space-y-4 relative z-10">
               <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold text-amber">Staff Deployment</p>
               </div>
               <h2 className="text-3xl font-display font-bold text-white tracking-tight uppercase">Assign Personnel</h2>
               
               <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                  <div className="space-y-1">
                     <p className="text-[9px] font-mono uppercase tracking-widest text-white/20 font-bold">Case Reference</p>
                     <p className="text-sm font-bold text-white uppercase">{issue.title}</p>
                  </div>
                  <div className="flex items-center gap-2 text-white/40">
                     <MapPin className="w-3.5 h-3.5" />
                     <p className="text-[10px] font-mono uppercase tracking-widest">{issue.address}</p>
                  </div>
               </div>
            </div>

            <div className="space-y-6 relative z-10 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
               {!showAddForm ? (
                 <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">Existing Field Staff</label>
                        <button 
                          onClick={() => setShowAddForm(true)}
                          className="text-[9px] font-mono uppercase font-bold text-cyan flex items-center gap-1 hover:underline"
                        >
                          <Plus className="w-3 h-3" />
                          Add New Operative
                        </button>
                      </div>
                      
                      {loading ? (
                        <div className="flex flex-col items-center justify-center py-10 text-white/20 gap-3">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-[10px] font-mono uppercase tracking-widest">Accessing Roster...</span>
                        </div>
                      ) : personnels.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl">
                           <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">No staff available</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          {personnels.map(auth => (
                            <button
                              key={auth.id}
                              onClick={() => setSelectedAuth(auth.id)}
                              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                                selectedAuth === auth.id ? 'bg-amber/10 border-amber/40 text-white' : 'bg-white/2 border-white/5 text-white/40 hover:border-white/20'
                              }`}
                            >
                              <div className="flex items-center gap-3 text-left">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedAuth === auth.id ? 'bg-amber/20 text-amber' : 'bg-white/5 text-white/20'}`}>
                                  <User className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold uppercase">{auth.name}</div>
                                  <div className="text-[9px] font-mono opacity-40 uppercase tracking-widest">{auth.role}</div>
                                </div>
                              </div>
                              {selectedAuth === auth.id && <div className="w-2 h-2 rounded-full bg-amber shadow-[0_0_10px_rgba(255,184,0,0.5)]" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>
               ) : (
                 <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">New Operative Details</label>
                       <button 
                        onClick={() => setShowAddForm(false)}
                        className="text-[9px] font-mono uppercase font-bold text-white/20 flex items-center gap-1 hover:text-white"
                       >
                         <Users className="w-3 h-3" />
                         Back to Roster
                       </button>
                    </div>
                    <div className="space-y-4">
                       <input 
                          type="text" 
                          placeholder="Full Name"
                          value={newStaff.name}
                          onChange={(e) => setNewStaff({...newStaff, name: e.target.value})}
                          className="neon-input w-full p-4 text-xs"
                       />
                       <select 
                          value={newStaff.role}
                          onChange={(e) => setNewStaff({...newStaff, role: e.target.value})}
                          className="neon-input w-full p-4 text-xs appearance-none cursor-pointer"
                       >
                          <option value="Field Worker">Field Worker</option>
                          <option value="Specialist Engineer">Specialist Engineer</option>
                          <option value="Maintenance Crew">Maintenance Crew</option>
                          <option value="Dispatch Driver">Dispatch Driver</option>
                       </select>
                       <input 
                          type="text" 
                          placeholder="Contact (Phone/Email)"
                          value={newStaff.contact}
                          onChange={(e) => setNewStaff({...newStaff, contact: e.target.value})}
                          className="neon-input w-full p-4 text-xs"
                       />
                    </div>

                    {/* Add to Roster button (doesn't deploy yet) */}
                    <button
                      type="button"
                      onClick={handleAddStaff}
                      disabled={!newStaff.name}
                      className="w-full py-3 rounded-xl bg-cyan/10 text-cyan border border-cyan/20 font-display font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-cyan/20 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add to Roster & Select
                    </button>
                 </div>
               )}

               <div className="space-y-3">
                  <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">Suggested Protocol</label>
                  <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-[11px] font-mono text-white/50 leading-relaxed italic">
                     {suggestion}
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-3 relative z-10">
               <button 
                 type="button"
                 onClick={onClose}
                 className="flex-1 py-4 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 hover:bg-white/5 transition-all"
               >
                 Cancel
               </button>
               <button 
                 type="button"
                 onClick={handleConfirm}
                 disabled={!selectedAuth || submitting}
                 className="flex-[2] py-4 rounded-xl bg-amber text-black font-display font-bold text-xs uppercase tracking-widest shadow-xl shadow-amber/20 flex items-center justify-center gap-3 disabled:opacity-30 transition-all active:scale-95"
               >
                 {submitting ? (
                   <>
                     <Loader2 className="w-4 h-4 animate-spin" />
                     Deploying...
                   </>
                 ) : (
                   <>
                     <Send className="w-4 h-4" />
                     Confirm Deployment
                   </>
                 )}
               </button>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}

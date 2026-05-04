'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Shield, HardHat, Truck, Trash2, Plus, 
  Phone, Mail, X, Send, Loader2, Info
} from 'lucide-react';
import { fadeUp, staggerContainer, modalBackdrop, modalContent } from '@/lib/framer';
import { useRouter } from 'next/navigation';

interface Personnel {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
}

export function PersonnelManager({ initialPersonnels }: { initialPersonnels: Personnel[] }) {
  const [personnels, setPersonnels] = useState(initialPersonnels);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'Field Worker', contact: '' });
  const router = useRouter();

  const handleAdd = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/personnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const newP = await res.json();
        setPersonnels([newP, ...personnels]);
        setIsAdding(false);
        setFormData({ name: '', role: 'Field Worker', contact: '' });
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this personnel?')) return;
    try {
      const res = await fetch(`/api/personnels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPersonnels(personnels.filter(p => p.id !== id));
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role.toLowerCase().includes('engineer')) return <HardHat className="w-4 h-4" />;
    if (role.toLowerCase().includes('driver')) return <Truck className="w-4 h-4" />;
    if (role.toLowerCase().includes('lead')) return <Shield className="w-4 h-4" />;
    return <User className="w-4 h-4" />;
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-display font-bold text-xl text-white uppercase tracking-tight">Active Personnel</h3>
          <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">{personnels.length} Verified Records</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-cyan text-black rounded-xl font-display font-bold text-xs uppercase tracking-widest shadow-lg shadow-cyan/20 hover:scale-105 transition-all"
        >
          <Plus className="w-4 h-4" />
          Enlist Staff
        </button>
      </div>

      <motion.div 
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      >
        {personnels.map((p) => (
          <motion.div 
            key={p.id}
            variants={fadeUp}
            className="group rounded-[2rem] p-6 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all relative overflow-hidden"
          >
            <div className="relative z-10 flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan/10 border border-cyan/20 flex items-center justify-center text-cyan">
                  {getRoleIcon(p.role)}
                </div>
                <div className="space-y-1">
                  <h4 className="font-display font-bold text-lg text-white uppercase tracking-tight">{p.name}</h4>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-cyan font-bold opacity-70">{p.role}</p>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(p.id)}
                className="p-2 rounded-xl bg-magenta/10 text-magenta border border-magenta/20 hover:bg-magenta/20 transition-all"
                title="Remove Personnel"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
              <div className="flex items-center gap-3">
                <Phone className="w-3.5 h-3.5 text-white/20" />
                <span className="text-[11px] font-mono text-white/40 tracking-wider">{p.contact}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-lime" />
                <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-lime opacity-50">Operational</span>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {personnels.length === 0 && (
        <div className="py-32 flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-[3rem] bg-white/[0.01]">
           <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
              <User className="w-6 h-6 text-white/20" />
           </div>
           <h4 className="text-xl font-display font-bold text-white/40 uppercase tracking-tight">No Personnel Logged</h4>
           <p className="text-sm text-white/20 mt-2">Begin recruitment by clicking the Enlist Staff button.</p>
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {isAdding && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
            onClick={() => setIsAdding(false)}
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
               className="relative w-full max-w-lg p-10 space-y-10 shadow-2xl overflow-hidden rounded-[2.5rem] bg-card border border-white/5"
             >
                <div className="space-y-2">
                   <h2 className="text-3xl font-display font-bold text-white tracking-tight uppercase">Staff Enlistment</h2>
                   <p className="text-xs text-secondary font-mono tracking-widest uppercase opacity-40">Register new field operative</p>
                </div>

                <div className="space-y-6">
                   <div className="space-y-3">
                      <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">Operative Name</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="neon-input w-full p-4 text-sm"
                        placeholder="e.g. John Wick"
                      />
                   </div>
                   <div className="space-y-3">
                      <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">Assignment Role</label>
                      <select 
                        value={formData.role}
                        onChange={(e) => setFormData({...formData, role: e.target.value})}
                        className="neon-input w-full p-4 text-sm appearance-none cursor-pointer"
                      >
                        <option value="Field Worker">Field Worker</option>
                        <option value="Specialist Engineer">Specialist Engineer</option>
                        <option value="Maintenance Crew">Maintenance Crew</option>
                        <option value="Sanitation Lead">Sanitation Lead</option>
                        <option value="Dispatch Driver">Dispatch Driver</option>
                      </select>
                   </div>
                   <div className="space-y-3">
                      <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30 block">Communication Link</label>
                      <input 
                        type="text" 
                        value={formData.contact}
                        onChange={(e) => setFormData({...formData, contact: e.target.value})}
                        className="neon-input w-full p-4 text-sm"
                        placeholder="Email or Terminal Phone"
                      />
                   </div>
                </div>

                 <div className="flex items-center gap-4">
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="flex-1 py-4 rounded-2xl text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 hover:bg-white/5 transition-all"
                    >
                      Abort
                    </button>
                    <button 
                      type="button"
                      onClick={handleAdd}
                      disabled={loading || !formData.name || !formData.contact}
                      className="flex-[2] py-4 rounded-2xl bg-white text-black font-display font-bold text-xs uppercase tracking-widest shadow-xl shadow-white/20 flex items-center justify-center gap-3 disabled:opacity-30"
                    >
                       {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                       Deploy Record
                    </button>
                 </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

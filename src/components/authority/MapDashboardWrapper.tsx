'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Send, Loader2, MapPin, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdrop, modalContent } from '@/lib/framer';

const CivicMap = dynamic(() => import('./AuthorityMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-bg-secondary border border-white/5 rounded-3xl animate-pulse flex flex-col items-center justify-center text-white/20 gap-3">
    <Radio className="w-8 h-8 animate-pulse" />
    <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Synchronizing Orbital Data...</span>
  </div>
});

interface MapWrapperProps {
  reports: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    status: string;
    category: string;
    priorityScore?: number;
  }>;
  showReportButton?: boolean;
}

const CATEGORIES = ['POTHOLES', 'DRAINAGE', 'STREETLIGHTS', 'SIDEWALKS', 'TRAFFIC_SIGNS', 'GRAFFITI', 'TRASH', 'OTHER'];

export function MapDashboardWrapper({ reports, showReportButton = false }: MapWrapperProps) {
  const router = useRouter();
  const [reportModal, setReportModal] = useState<{ lat: number; lng: number } | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', category: 'POTHOLES' });
  const [submitting, setSubmitting] = useState(false);

  const handleReportLocation = (lat: number, lng: number) => {
    setReportModal({ lat, lng });
  };

  const handleSubmitReport = async () => {
    if (!reportModal || !formData.title || !formData.description) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports/authority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          latitude: reportModal.lat,
          longitude: reportModal.lng,
          address: `Map Pin (${reportModal.lat.toFixed(4)}, ${reportModal.lng.toFixed(4)})`
        })
      });

      if (res.ok) {
        setReportModal(null);
        setFormData({ title: '', description: '', category: 'POTHOLES' });
        router.refresh();
      } else {
        const errData = await res.text();
        alert(`Submission Failed: ${errData}`);
      }
    } catch (e) {
      console.error('Report submission failed:', e);
      alert('Critical error during report submission.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col relative">
      <div className="flex-1 rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative group min-h-[500px]">
        <CivicMap 
          reports={reports} 
          showReportButton={showReportButton}
          onReportLocation={showReportButton ? handleReportLocation : undefined}
        />
        
        {/* Map Overlay Decoration */}
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none">
           <div className="px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/10 bg-black/40 text-[9px] font-mono uppercase tracking-widest text-white/40">
             Grid: S-12 // Node: ACTIVE
           </div>
        </div>
      </div>

      <AnimatePresence>
        {reportModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
            <motion.div 
              variants={modalBackdrop}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setReportModal(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            
            <motion.div 
              variants={modalContent}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative w-full max-w-xl p-8 md:p-10 space-y-8 shadow-2xl overflow-hidden rounded-3xl bg-card border border-white/5"
            >
              {/* Decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 blur-[80px] opacity-10 pointer-events-none"
                style={{ background: 'radial-gradient(circle, var(--accent-amber), transparent 70%)' }}
              />

              <button onClick={() => setReportModal(null)}
                className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                   <MapPin className="w-3.5 h-3.5 text-amber" />
                   <p className="text-[10px] font-mono uppercase tracking-widest font-bold text-amber">Field Observation</p>
                </div>
                <h2 className="text-3xl font-display font-bold text-white tracking-tight uppercase">Report Field Issue</h2>
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                  LOC: {reportModal.lat.toFixed(6)} N, {reportModal.lng.toFixed(6)} E
                </p>
              </div>

              <div className="space-y-6 relative z-10">
                <div className="space-y-3">
                  <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30">Category Selection</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CATEGORIES.map(cat => (
                      <button key={cat} type="button" onClick={() => setFormData({ ...formData, category: cat })}
                        className={`py-2 px-1 rounded-xl text-[9px] font-display font-bold uppercase border transition-all ${
                          formData.category === cat ? 'bg-amber text-black border-amber' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'
                        }`}
                      >
                        {cat.split('_')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30">Issue Title</label>
                  <input type="text" placeholder="Brief identifying title..." value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="neon-input w-full p-4 text-sm font-bold rounded-xl" />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30">Field Observations</label>
                  <textarea placeholder="Provide detailed field observations..." rows={3} value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="neon-input w-full p-4 text-sm leading-relaxed resize-none rounded-xl" />
                </div>

                <button onClick={handleSubmitReport} disabled={submitting || !formData.title || !formData.description}
                  className="neon-btn w-full py-4 flex items-center justify-center gap-3 disabled:opacity-50 text-sm tracking-widest font-bold uppercase"
                  style={{ background: 'var(--accent-amber)', color: '#0A0A0B' }}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Uploading Entry...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit Field Report
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Category } from '@prisma/client';
import { 
  ChevronLeft, Camera, MapPin, Send, Loader2, 
  ArrowRight, Check, AlertCircle, Trash2, 
  Lightbulb, Droplets, Construction, Signpost,
  Palette, Trash, HelpCircle, Zap
} from 'lucide-react';
import Link from 'next/link';
import { SMOOTH, fadeUp, staggerContainer } from '@/lib/framer';
import dynamic from 'next/dynamic';
import { AppHeader } from "@/components/layout/AppHeader";

const ReportPickerMap = dynamic(() => import('@/components/citizen/ReportPickerMap'), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-white/5 animate-pulse flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-white/20">Initializing Map Core...</div>
});

const categories: { id: Category; label: string; icon: any; color: string }[] = [
  { id: 'POTHOLES',      label: 'Potholes',      icon: Construction, color: 'var(--cat-potholes)' },
  { id: 'DRAINAGE',      label: 'Drainage',      icon: Droplets,     color: 'var(--cat-drainage)' },
  { id: 'STREETLIGHTS',  label: 'Streetlights',  icon: Lightbulb,    color: 'var(--cat-streetlights)' },
  { id: 'SIDEWALKS',     label: 'Sidewalks',     icon: Signpost,     color: 'var(--cat-sidewalks)' },
  { id: 'TRAFFIC_SIGNS', label: 'Traffic Signs', icon: AlertCircle,  color: 'var(--cat-traffic-signs)' },
  { id: 'GRAFFITI',      label: 'Graffiti',      icon: Palette,      color: 'var(--cat-graffiti)' },
  { id: 'TRASH',         label: 'Trash/Litter',  icon: Trash,        color: 'var(--cat-trash)' },
  { id: 'OTHER',         label: 'Other',         icon: HelpCircle,   color: 'var(--cat-other)' },
];

type Step = 'CATEGORY' | 'DETAILS' | 'LOCATION' | 'SUBMIT';

function FileReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('CATEGORY');
  const [loading, setLoading] = useState(false);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'POTHOLES' as Category,
    latitude: searchParams.get('lat') ? parseFloat(searchParams.get('lat') as string) : 0,
    longitude: searchParams.get('lng') ? parseFloat(searchParams.get('lng') as string) : 0,
    address: ''
  });

  const steps: Step[] = ['CATEGORY', 'DETAILS', 'LOCATION', 'SUBMIT'];
  const currentStepIndex = steps.indexOf(step);

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setStep(steps[currentStepIndex + 1]);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        router.push('/citizen/dashboard');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = useMemo(
    () => ({
      CATEGORY: 'Category',
      DETAILS: 'Details',
      LOCATION: 'Location',
      SUBMIT: 'Submit',
    }),
    []
  );

  useEffect(() => {
    if (!descRef.current) return;
    descRef.current.style.height = '0px';
    descRef.current.style.height = `${Math.max(120, descRef.current.scrollHeight)}px`;
  }, [formData.description]);

  useEffect(() => {
    if (!useMyLocation) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setFormData(prev => ({
        ...prev,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }));
    });
  }, [useMyLocation]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-primary w-full pb-24 lg:pb-0">
      <AppHeader 
        title={
          step === 'CATEGORY' ? 'Select Category' :
          step === 'DETAILS' ? 'Report Details' :
          step === 'LOCATION' ? 'Set Location' :
          'Review & Submit'
        }
        subtitle={`STEP ${currentStepIndex + 1} OF 4`}
        actionButton={
          <div className="flex items-center gap-4">
            <button 
              onClick={currentStepIndex === 0 ? () => router.back() : prevStep}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-sm border border-white/10 flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="hidden lg:block w-48">
              <div className="relative h-1.5 rounded-full overflow-hidden bg-white/5">
                <motion.div
                  initial={false}
                  animate={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                  className="absolute inset-y-0 left-0 bg-cyan shadow-[0_0_10px_var(--accent-cyan)]"
                />
              </div>
            </div>
          </div>
        }
      />

      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 md:px-8 py-8 md:py-12 relative">
        <div className="flex-1 flex flex-col">
            {/* ── STEP 1: CATEGORY ── */}
            {step === 'CATEGORY' && (
              <div className="space-y-12">
                <p className="text-sm font-medium tracking-wide leading-relaxed opacity-40 max-w-lg">
                  Initiate protocol selection. What kind of incident are you reporting? Our AI engine will route this to the appropriate task force.
                </p>
                <motion.div 
                  className="grid grid-cols-2 sm:grid-cols-4 gap-8"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  {categories.map((cat) => (
                    <motion.button
                      key={cat.id}
                      variants={fadeUp}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setFormData({ ...formData, category: cat.id });
                        nextStep();
                      }}
                      className="rounded-[2rem] p-10 flex flex-col items-center justify-center text-center gap-6 group transition-all duration-500 relative overflow-hidden shadow-2xl"
                      style={{ 
                        border: '1px solid rgba(255,255,255,0.05)',
                        background: formData.category === cat.id ? 'rgba(0,245,212,0.08)' : 'rgba(255,255,255,0.02)'
                      }}
                    >
                      {formData.category === cat.id && (
                        <motion.div layoutId="active-cat" className="absolute inset-0 border-2 border-accent-cyan z-0 opacity-20" style={{ borderColor: 'var(--accent-cyan)' }} />
                      )}
                      <div 
                        className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.2)]"
                        style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}25` }}
                      >
                        <cat.icon className="w-8 h-8" style={{ color: cat.color }} />
                      </div>
                      <span className="font-display font-black text-xs uppercase tracking-widest text-white">{cat.label}</span>
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            )}

            {/* ── STEP 2: DETAILS ── */}
            {step === 'DETAILS' && (
              <div className="space-y-12">
                <div className="space-y-4">
                  <label className="text-[10px] font-mono uppercase tracking-[0.3em] font-black block mb-4 opacity-30">
                    Mission Designation (Title)
                  </label>
                  <input
                    autoFocus
                    required
                    type="text"
                    placeholder="Brief title (e.g. Broken streetlight)"
                    className="neon-input w-full p-8 text-lg font-black uppercase tracking-tight"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    maxLength={100}
                  />
                  <div className="flex justify-end pt-2">
                    <span className="text-[10px] font-mono opacity-20 tracking-widest">
                      {formData.title.length}/100 CHARS
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-mono uppercase tracking-[0.3em] font-black block mb-4 opacity-30">
                    Incident Parameters (Description)
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe the issue in detail. What's wrong? How long has it been like this?"
                    className="neon-input w-full p-8 text-base leading-relaxed resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    ref={descRef}
                  />
                </div>

                <div className="space-y-4">
                   <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Photo (Optional)
                  </label>
                  <div
                    className="aspect-video rounded-3xl border-2 border-dashed border-white/5 overflow-hidden"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <label className="relative w-full h-full flex flex-col items-center justify-center text-center cursor-pointer hover:border-white/10 group transition-all">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                      />

                      {photoPreviewUrl ? (
                        <div className="relative w-full h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoPreviewUrl} alt="Selected report photo" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setPhoto(null); }}
                            className="absolute top-3 right-3 p-2 rounded-xl bg-black/50 border border-white/10 text-white/70 hover:text-white hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-all"
                            aria-label="Remove photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Camera className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                          </div>
                          <p className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>Add Photo</p>
                          <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>Tap to upload</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    disabled={!formData.title || !formData.description}
                    onClick={nextStep}
                    className="neon-btn neon-btn-cyan w-full py-5 flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    Continue to Location
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: LOCATION ── */}
            {step === 'LOCATION' && (
              <div className="flex-1 flex flex-col space-y-6">
                <div className="flex-1 flex flex-col rounded-[3rem] p-8 md:p-12 shadow-2xl relative box-border" style={{ background: 'rgba(20,20,22,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-6 shrink-0 mb-8">
                    <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg" style={{ background: 'rgba(0,245,212,0.1)' }}>
                      <MapPin className="w-8 h-8" style={{ color: 'var(--accent-cyan)' }} />
                    </div>
                    <div>
                      <h3 className="font-display font-black text-2xl text-white tracking-tighter uppercase">Geospatial Lock</h3>
                      <p className="text-xs font-medium tracking-wide opacity-40 mt-1">
                        Map coordinate verification and address parsing protocol.
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 min-h-[300px] md:min-h-[400px] rounded-[2.5rem] bg-white/5 border border-white/5 overflow-hidden relative shadow-inner mb-8">
                    <ReportPickerMap 
                      latitude={formData.latitude} 
                      longitude={formData.longitude} 
                      onChange={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 shrink-0">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between h-8 mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.3em] font-black opacity-30">
                          Automatic Telemetry
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newValue = !useMyLocation;
                            setUseMyLocation(newValue);
                            if (newValue) {
                              setFormData(prev => ({
                                ...prev,
                                latitude: 12.990939,
                                longitude: 77.678665
                              }));
                            }
                          }}
                          className="relative w-14 h-7 shrink-0 rounded-full border transition-colors"
                          style={{
                            background: useMyLocation ? 'rgba(0,245,212,0.18)' : 'rgba(255,255,255,0.06)',
                            borderColor: useMyLocation ? 'rgba(0,245,212,0.35)' : 'rgba(255,255,255,0.12)',
                            boxShadow: useMyLocation ? '0 0 20px rgba(0,245,212,0.18)' : 'none',
                          }}
                          aria-pressed={useMyLocation}
                        >
                          <motion.span
                            animate={{ x: useMyLocation ? 34 : 4 }}
                            transition={{ type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                            style={{
                              background: useMyLocation ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.35)',
                              left: 0
                            }}
                          />
                        </button>
                      </div>

                      <button 
                        type="button"
                        className="w-full py-5 rounded-2xl text-[10px] font-mono uppercase tracking-[0.3em] font-black border border-white/5 flex items-center justify-center gap-4 transition-all hover:bg-white/5"
                        style={{ background: 'rgba(255,255,255,0.02)', color: 'white' }}
                        onClick={() => {
                          navigator.geolocation.getCurrentPosition((pos) => {
                            setFormData(prev => ({ 
                              ...prev, 
                              latitude: pos.coords.latitude, 
                              longitude: pos.coords.longitude 
                            }));
                          });
                        }}
                      >
                        <Zap className="w-5 h-5" style={{ color: 'var(--accent-cyan)' }} />
                        RE-SYNC GPS COORDINATES
                      </button>

                      <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[9px] font-mono uppercase tracking-[0.4em] font-black opacity-30 mb-2">Validated Coordinates</div>
                        <div className="text-sm font-mono tabular-nums text-white/60">
                          {formData.latitude !== 0
                            ? `${formData.latitude.toFixed(6)}°N, ${formData.longitude.toFixed(6)}°E`
                            : 'AWAITING LOCK...'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-4">
                      <label className="text-[10px] font-mono uppercase tracking-[0.3em] font-black opacity-30 block h-8 flex items-center mb-2">
                        Manual Address Override
                      </label>
                      <div className="relative mb-2">
                        <input 
                          type="text"
                          placeholder="Type address for parsing..."
                          className="neon-input w-full p-6 pl-14 text-sm font-medium"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                        <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <p className="text-[10px] font-mono opacity-20 tracking-wider leading-relaxed mt-2">
                        If GPS precision is insufficient, manually define the nearest intersection or street address.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 shrink-0 pb-8">
                  <button 
                    disabled={formData.latitude === 0 && !formData.address}
                    onClick={nextStep}
                    className="neon-btn neon-btn-cyan w-full py-6 flex items-center justify-center gap-4 disabled:opacity-50 text-base font-black uppercase tracking-[0.3em]"
                  >
                    Review & Transmit
                    <ArrowRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 4: SUBMIT ── */}
            {step === 'SUBMIT' && (
              <div className="space-y-12">
                <div className="rounded-[3rem] p-16 space-y-12 shadow-2xl relative overflow-hidden" style={{ background: 'rgba(20,20,22,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-8">
                    <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg" style={{ background: 'rgba(0,245,212,0.1)' }}>
                      <Check className="w-8 h-8" style={{ color: 'var(--accent-cyan)' }} />
                    </div>
                    <div>
                      <h3 className="font-display font-black text-3xl text-white tracking-tighter uppercase">Final Validation</h3>
                      <p className="text-sm font-medium tracking-wide opacity-40 mt-1">
                        Verify all parameters before transmitting to the city mainframe.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-10">
                      <div className="space-y-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.4em] font-black opacity-30">Category</label>
                        <div className="flex items-center gap-4 text-xl font-display font-black text-white uppercase tracking-tight">
                          <div className="w-2 h-2 rounded-full" style={{ background: categories.find(c => c.id === formData.category)?.color }} />
                          {formData.category.replace('_', ' ')}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.4em] font-black opacity-30">Mission Title</label>
                        <div className="text-2xl font-display font-black text-white uppercase tracking-tight leading-none">{formData.title}</div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.4em] font-black opacity-30">Incident Details</label>
                        <div className="text-base text-white/50 leading-relaxed max-w-md">{formData.description}</div>
                      </div>
                    </div>

                    <div className="space-y-10">
                      <div className="space-y-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.4em] font-black opacity-30">Geospatial Lock</label>
                        <div className="text-sm font-mono text-white/60">
                          {formData.latitude.toFixed(6)}°N, {formData.longitude.toFixed(6)}°E
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.4em] font-black opacity-30">Address Context</label>
                        <div className="text-lg font-display font-black text-white uppercase tracking-tight">
                          {formData.address || 'AUTOMATIC COORDINATE LOCK'}
                        </div>
                      </div>
                      {photoPreviewUrl && (
                        <div className="space-y-3">
                          <label className="text-[10px] font-mono uppercase tracking-[0.4em] font-black opacity-30">Visual Proof</label>
                          <div className="aspect-video rounded-[2rem] overflow-hidden border border-white/5">
                            <img src={photoPreviewUrl} alt="Report preview" className="w-full h-full object-cover" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-8">
                  <button 
                    onClick={handleSubmit}
                    disabled={loading}
                    className="neon-btn neon-btn-cyan w-full py-8 flex items-center justify-center gap-6 disabled:opacity-50 text-xl font-black uppercase tracking-[0.4em]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-8 h-8 animate-spin" />
                        TRANSMITTING...
                      </>
                    ) : (
                      <>
                        <Send className="w-8 h-8" />
                        FINALIZE & TRANSMIT
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default function FileReport() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-primary text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <FileReportContent />
    </Suspense>
  );
}

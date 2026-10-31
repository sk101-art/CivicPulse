'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Category } from '@prisma/client';
import { 
  ChevronLeft, Send, Loader2, 
  ArrowRight, Check, AlertCircle,
  Lightbulb, Droplets, Construction, Signpost,
  Palette, Trash, HelpCircle, type LucideIcon
} from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/framer';
import { AppHeader } from "@/components/layout/AppHeader";
import { CaptureCamera, type CapturedEvidence } from "@/components/evidence/CaptureCamera";
import { useOfflineSync, newClientReportId } from "@/hooks/useOfflineSync";
import { signEvidencePayload, type EvidencePayload } from "@/lib/evidence/sign";
import { getOrCreateDeviceKey } from "@/lib/evidence/deviceKey";
import { TEXT_LIMITS } from "@/lib/validation/limits";

const DRAFT_KEY = 'civicpulse:report-draft';

interface ReportDraft {
  category: Category;
  note: string;
  sizeClass: SizeClass;
  blockedShare: BlockedShare;
  clientReportId: string;
}

function readDraft(): Partial<ReportDraft> {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') as Partial<ReportDraft>;
  } catch {
    return {};
  }
}

const categories: { id: Category; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'POTHOLES',      label: 'Potholes',      icon: Construction, color: 'var(--cat-potholes)' },
  { id: 'DRAINAGE',      label: 'Drainage',      icon: Droplets,     color: 'var(--cat-drainage)' },
  { id: 'STREETLIGHTS',  label: 'Streetlights',  icon: Lightbulb,    color: 'var(--cat-streetlights)' },
  { id: 'SIDEWALKS',     label: 'Sidewalks',     icon: Signpost,     color: 'var(--cat-sidewalks)' },
  { id: 'TRAFFIC_SIGNS', label: 'Traffic Signs', icon: AlertCircle,  color: 'var(--cat-traffic-signs)' },
  { id: 'GRAFFITI',      label: 'Graffiti',      icon: Palette,      color: 'var(--cat-graffiti)' },
  { id: 'TRASH',         label: 'Trash/Litter',  icon: Trash,        color: 'var(--cat-trash)' },
  { id: 'OTHER',         label: 'Other',         icon: HelpCircle,   color: 'var(--cat-other)' },
];

type SizeClass = 'small' | 'medium' | 'large';
type BlockedShare = 'none' | 'part lane' | 'one lane' | 'full';
type Step = 'CATEGORY' | 'CAPTURE' | 'DETAILS' | 'REVIEW';

function FileReportContent() {
  const router = useRouter();
  const { isOnline, queueReport } = useOfflineSync();

  const [step, setStep] = useState<Step>('CATEGORY');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [category, setCategory] = useState<Category>('POTHOLES');
  const [capturedEvidence, setCapturedEvidence] = useState<CapturedEvidence | null>(null);

  const [note, setNote] = useState<string>('');
  const [sizeClass, setSizeClass] = useState<SizeClass>('medium');
  const [blockedShare, setBlockedShare] = useState<BlockedShare>('none');
  // One id per draft: every retry of this report (double click, offline re-sync) reuses it.
  const [clientReportId, setClientReportId] = useState<string>('');
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Restore the text parts of a draft after Back / reload (the photo must always be a fresh capture).
  useEffect(() => {
    const d = readDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from sessionStorage */
    if (d.category) setCategory(d.category);
    if (typeof d.note === 'string') setNote(d.note.slice(0, TEXT_LIMITS.description));
    if (d.sizeClass) setSizeClass(d.sizeClass);
    if (d.blockedShare) setBlockedShare(d.blockedShare);
    setClientReportId(d.clientReportId || newClientReportId());
    setDraftLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      const draft: ReportDraft = { category, note, sizeClass, blockedShare, clientReportId };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage unavailable (private mode): the draft just isn't kept
    }
  }, [draftLoaded, category, note, sizeClass, blockedShare, clientReportId]);

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const steps: Step[] = ['CATEGORY', 'CAPTURE', 'DETAILS', 'REVIEW'];
  const currentStepIndex = steps.indexOf(step);

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setStep(steps[currentStepIndex + 1]);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1]);
    } else {
      router.back();
    }
  };

  const handleCaptured = (evidence: CapturedEvidence) => {
    setCapturedEvidence(evidence);
    setStep('DETAILS');
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSubmit = async () => {
    if (!capturedEvidence) {
      setErrorMessage("Please capture a photo, upload an image from your device, or click 'Skip Photo'.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    try {
      const photoBase64 = await blobToBase64(capturedEvidence.blob);
      const shouldQueueOffline = !isOnline || capturedEvidence.payload.nonce === 'offline';

      if (shouldQueueOffline) {
        // Queue offline report with valid offline signature
        const { keyPair } = await getOrCreateDeviceKey();
        let payload = capturedEvidence.payload;
        let signature = capturedEvidence.signature;

        if (payload.nonce !== 'offline') {
          payload = { ...payload, nonce: 'offline' };
          signature = await signEvidencePayload(payload, keyPair.privateKey);
        }

        await queueReport({
          category,
          payload,
          signature,
          photoBase64,
          mimeType: 'image/jpeg',
          note,
          sizeClass,
          blockedShare,
          offline: true,
          clientReportId,
        });

        clearDraft();
        router.refresh();
        router.push('/citizen/dashboard');
        return;
      }

      // Online submission
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          payload: capturedEvidence.payload,
          signature: capturedEvidence.signature,
          photoBase64,
          mimeType: 'image/jpeg',
          note,
          sizeClass,
          blockedShare,
          clientReportId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to file report');
      }

      const json = await res.json();
      const issueId = json.issue?.id;

      clearDraft();
      router.refresh();
      if (issueId) {
        router.push(`/citizen/report/${issueId}${json.merged ? '?merged=1' : ''}`);
      } else {
        router.push('/citizen/dashboard');
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        try {
          const { keyPair } = await getOrCreateDeviceKey();
          const offlinePayload: EvidencePayload = {
            ...capturedEvidence.payload,
            nonce: 'offline',
          };
          const offlineSig = await signEvidencePayload(offlinePayload, keyPair.privateKey);

          await queueReport({
            category,
            payload: offlinePayload,
            signature: offlineSig,
            photoBase64: await blobToBase64(capturedEvidence.blob),
            mimeType: 'image/jpeg',
            note,
            sizeClass,
            blockedShare,
            offline: true,
            clientReportId,
          });

          clearDraft();
          router.refresh();
          router.push('/citizen/dashboard');
          return;
        } catch {
          // ignore fallback error
        }
      }
      setErrorMessage(err instanceof Error ? err.message : 'Report submission failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-primary w-full pb-24 lg:pb-0">
      <AppHeader
        title={
          step === 'CATEGORY' ? 'Select Category' :
          step === 'CAPTURE' ? 'Capture Signed Evidence' :
          step === 'DETAILS' ? 'Report Details' :
          'Review & File Report'
        }
        subtitle={`STEP ${currentStepIndex + 1} OF 4`}
        actionButton={
          <div className="flex items-center gap-4">
            <button
              onClick={prevStep}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-sm border border-white/10 flex items-center gap-2 cursor-pointer"
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
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── STEP 1: CATEGORY ── */}
          {step === 'CATEGORY' && (
            <div className="space-y-8">
              <p className="text-sm font-medium tracking-wide leading-relaxed opacity-40 max-w-lg">
                Select the incident category. Each verified report contributes directly to your civic XP and city priority ranking.
              </p>
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-4 gap-6"
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
                      setCategory(cat.id);
                      setStep('CAPTURE');
                    }}
                    className="rounded-[2rem] p-8 flex flex-col items-center justify-center text-center gap-4 group transition-all duration-300 relative overflow-hidden shadow-2xl cursor-pointer"
                    style={{
                      border: '1px solid rgba(255,255,255,0.05)',
                      background: category === cat.id ? 'rgba(0,245,212,0.08)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    {category === cat.id && (
                      <motion.div
                        layoutId="active-cat"
                        className="absolute inset-0 border-2 border-accent-cyan z-0 opacity-20"
                        style={{ borderColor: 'var(--accent-cyan)' }}
                      />
                    )}
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                      style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}25` }}
                    >
                      <cat.icon className="w-8 h-8" style={{ color: cat.color }} />
                    </div>
                    <span className="font-display font-black text-xs uppercase tracking-widest text-white">
                      {cat.label}
                    </span>
                  </motion.button>
                ))}
              </motion.div>
            </div>
          )}

          {/* ── STEP 2: CAPTURE EVIDENCE (CAMERA & GPS GATE) ── */}
          {step === 'CAPTURE' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-mono tracking-widest text-zinc-400">
                  Category: <strong className="text-white">{category}</strong>
                </span>
                <span className="text-xs text-cyan-400 font-mono font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Hardware-Signed Evidence Required
                </span>
              </div>

              <CaptureCamera
                role="REPORT"
                onCapture={handleCaptured}
                onCancel={prevStep}
              />
            </div>
          )}

          {/* ── STEP 3: DETAILS (NOTE, SIZE, BLOCKED SHARE) ── */}
          {step === 'DETAILS' && (
            <div className="space-y-8 max-w-2xl mx-auto w-full">
              {/* Optional Note */}
              <div className="space-y-3">
                <label htmlFor="report-note" className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold block text-zinc-400">
                  Optional Note & Landmarks
                </label>
                <textarea
                  id="report-note"
                  rows={3}
                  maxLength={TEXT_LIMITS.description}
                  aria-describedby="note-counter"
                  placeholder="e.g. Near bus stop, left lane heading towards junction..."
                  className="w-full p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan transition"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, TEXT_LIMITS.description))}
                />
                <p id="note-counter" className="text-[11px] font-mono text-zinc-500 text-right">
                  {note.length} / {TEXT_LIMITS.description}
                </p>
              </div>

              {/* Defect Size Class */}
              <div className="space-y-3">
                <label className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold block text-zinc-400">
                  Defect Size Class
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['small', 'medium', 'large'] as SizeClass[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSizeClass(size)}
                      className={`py-3 px-4 rounded-xl text-xs font-semibold capitalize border transition-all cursor-pointer ${
                        sizeClass === size
                          ? 'bg-cyan/15 border-cyan text-white shadow-[0_0_15px_rgba(0,245,212,0.2)]'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Blocked Road Share */}
              <div className="space-y-3">
                <label className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold block text-zinc-400">
                  Road Blockage Share
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['none', 'part lane', 'one lane', 'full'] as BlockedShare[]).map((share) => (
                    <button
                      key={share}
                      type="button"
                      onClick={() => setBlockedShare(share)}
                      className={`py-3 px-3 rounded-xl text-xs font-semibold capitalize border transition-all cursor-pointer ${
                        blockedShare === share
                          ? 'bg-amber-500/15 border-amber-500 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {share}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-8 flex items-center justify-between border-t border-white/5">
                <button
                  type="button"
                  onClick={prevStep}
                  className="px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition font-mono text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="px-8 py-3.5 rounded-full font-display font-bold text-sm tracking-wider uppercase transition shadow-[0_0_25px_rgba(0,245,212,0.35)] flex items-center gap-2 cursor-pointer text-black hover:opacity-95 active:scale-95 bg-cyan"
                  style={{ background: 'var(--accent-cyan)' }}
                >
                  <span>Review Evidence</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: REVIEW & SUBMIT ── */}
          {step === 'REVIEW' && capturedEvidence && (
            <div className="space-y-8 max-w-xl mx-auto w-full">
              <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 space-y-6 shadow-2xl">
                {/* Photo Preview */}
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-zinc-800">
                  <Image
                    src={capturedEvidence.previewUrl}
                    alt="Captured evidence"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-mono text-zinc-300 border border-white/10">
                    GPS: ±{Math.round(capturedEvidence.payload.accuracy)}m
                  </div>
                </div>

                {/* Metadata summary */}
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <span className="text-zinc-500 block">Category</span>
                    <span className="text-zinc-200 font-bold">{category}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <span className="text-zinc-500 block">Coordinates</span>
                    <span className="text-zinc-200 font-bold">
                      {capturedEvidence.payload.lat.toFixed(4)}, {capturedEvidence.payload.lng.toFixed(4)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <span className="text-zinc-500 block">Size Class</span>
                    <span className="text-zinc-200 font-bold capitalize">{sizeClass}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <span className="text-zinc-500 block">Road Blockage</span>
                    <span className="text-zinc-200 font-bold capitalize">{blockedShare}</span>
                  </div>
                </div>

                {note && (
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs">
                    <span className="text-zinc-500 font-mono block mb-1">Notes</span>
                    <p className="text-zinc-300">{note}</p>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Hardware signed with ECDSA P-256 and single-use server nonce</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={loading}
                  className="px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition font-mono text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back to Details</span>
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ background: 'var(--accent-cyan)' }}
                  className="px-10 py-4 rounded-full bg-cyan text-black font-display font-bold text-sm tracking-wider uppercase hover:opacity-90 transition shadow-[0_0_25px_rgba(0,245,212,0.3)] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Filing Evidence...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>File & Sign Report (+10 XP)</span>
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

export default function FileReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-primary flex items-center justify-center text-zinc-500">Loading Report Terminal...</div>}>
      <FileReportContent />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Category } from '@prisma/client';
import { 
  ChevronRight, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  Info, 
  Home, 
  MapPin, 
  Loader2 
} from 'lucide-react';
import { CaptureCamera, type CapturedEvidence } from "@/components/evidence/CaptureCamera";
import { useOfflineSync, newClientReportId } from "@/hooks/useOfflineSync";
import { signEvidencePayload, type EvidencePayload } from "@/lib/evidence/sign";
import { getOrCreateDeviceKey } from "@/lib/evidence/deviceKey";
import { TEXT_LIMITS } from "@/lib/validation/limits";
import { CivicHallArt } from "@/components/ui/CivicHallArt";
import { useOptionalGeoContext } from "@/context/GeoContext";

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

interface CategoryCardItem {
  id: Category;
  label: string;
  description: string;
  image: string;
}

const categoryList: CategoryCardItem[] = [
  {
    id: 'POTHOLES',
    label: 'Potholes',
    description: 'Road surface damage and deep pits',
    image: '/images/categories/cat-potholes.png',
  },
  {
    id: 'DRAINAGE',
    label: 'Drainage',
    description: 'Blocked or overflowing drains',
    image: '/images/categories/cat-drainage.png',
  },
  {
    id: 'STREETLIGHTS',
    label: 'Streetlights',
    description: 'Not working or damaged lights',
    image: '/images/categories/cat-streetlights.png',
  },
  {
    id: 'SIDEWALKS',
    label: 'Sidewalks',
    description: 'Broken, uneven or obstructed footpaths',
    image: '/images/categories/cat-sidewalks.png',
  },
  {
    id: 'TRAFFIC_SIGNS',
    label: 'Traffic Signs',
    description: 'Missing, damaged or unclear signage',
    image: '/images/categories/cat-traffic-signs.png',
  },
  {
    id: 'GRAFFITI',
    label: 'Graffiti',
    description: 'Unauthorized markings on public property',
    image: '/images/categories/cat-graffiti.png',
  },
  {
    id: 'TRASH',
    label: 'Trash / Litter',
    description: 'Garbage, dumping or uncollected waste',
    image: '/images/categories/cat-trash.png',
  },
  {
    id: 'OTHER',
    label: 'Other',
    description: 'Any other civic infrastructure issue',
    image: '/images/categories/cat-other.png',
  },
];

type SizeClass = 'small' | 'medium' | 'large';
type BlockedShare = 'none' | 'part lane' | 'one lane' | 'full';
type Step = 'CATEGORY' | 'CAPTURE' | 'DETAILS' | 'REVIEW';

function FileReportContent() {
  const router = useRouter();
  const { isOnline, queueReport } = useOfflineSync();
  const geo = useOptionalGeoContext();
  const currentWard = geo?.currentWard ?? null;

  const [step, setStep] = useState<Step>('CATEGORY');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [category, setCategory] = useState<Category>('POTHOLES');
  const [capturedEvidence, setCapturedEvidence] = useState<CapturedEvidence | null>(null);

  const [note, setNote] = useState<string>('');
  const [sizeClass, setSizeClass] = useState<SizeClass>('medium');
  const [blockedShare, setBlockedShare] = useState<BlockedShare>('none');
  const [clientReportId, setClientReportId] = useState<string>('');
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    const d = readDraft();
    if (d.category) setCategory(d.category);
    if (typeof d.note === 'string') setNote(d.note.slice(0, TEXT_LIMITS.description));
    if (d.sizeClass) setSizeClass(d.sizeClass);
    if (d.blockedShare) setBlockedShare(d.blockedShare);
    setClientReportId(d.clientReportId || newClientReportId());
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      const draft: ReportDraft = { category, note, sizeClass, blockedShare, clientReportId };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // private mode storage fallback
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
      router.push('/citizen/dashboard');
    }
  };

  const handleCaptured = (evidence: CapturedEvidence) => {
    setCapturedEvidence(evidence);
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
    setLoading(true);
    setErrorMessage(null);

    try {
      let photoBase64 = '';
      let evidencePayload: EvidencePayload;
      let signature = '';

      if (capturedEvidence) {
        photoBase64 = await blobToBase64(capturedEvidence.blob);
        evidencePayload = capturedEvidence.payload;
        signature = capturedEvidence.signature;
      } else {
        // Fallback demo evidence payload for testing
        const sampleRes = await fetch('/images/camera-preview-sample.jpg');
        const blob = await sampleRes.blob();
        photoBase64 = await blobToBase64(blob);

        const { keyPair } = await getOrCreateDeviceKey();
        evidencePayload = {
          accuracy: 4.8,
          capturedAt: new Date().toISOString(),
          lat: 12.9716,
          lng: 77.5946,
          nonce: 'offline',
          photoHash: 'hash-preview-' + Date.now(),
          role: 'REPORT',
        };
        signature = await signEvidencePayload(evidencePayload, keyPair.privateKey);
      }

      const shouldQueueOffline = !isOnline || evidencePayload.nonce === 'offline';

      if (shouldQueueOffline) {
        await queueReport({
          category,
          payload: evidencePayload,
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

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          payload: evidencePayload,
          signature,
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
      setErrorMessage(err instanceof Error ? err.message : 'Report submission failed');
      setLoading(false);
    }
  };

  const getBreadcrumbLabel = () => {
    switch (step) {
      case 'CATEGORY':
        return 'Report an Issue';
      case 'CAPTURE':
        return 'Capture Evidence';
      case 'DETAILS':
        return 'Add Details';
      case 'REVIEW':
        return 'Review';
    }
  };

  const getPageTitle = () => {
    switch (step) {
      case 'CATEGORY':
        return 'Report a Civic Issue';
      case 'CAPTURE':
        return 'Capture Evidence';
      case 'DETAILS':
        return 'Add Report Details';
      case 'REVIEW':
        return 'Review Your Report';
    }
  };

  const getPageSubtitle = () => {
    switch (step) {
      case 'CATEGORY':
        return 'Help us keep the city safer and more liveable by reporting infrastructure issues around you.';
      case 'CAPTURE':
        return 'Take a clear photo of the issue with location verification to create a trusted report.';
      case 'DETAILS':
        return 'Provide additional notes, defect severity and traffic impact.';
      case 'REVIEW':
        return 'Verify the recorded civic evidence and submit to municipal ledger.';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1240px] mx-auto w-full relative">
        
        {/* Subtle Watermark Civic Hall Artwork in Header */}
        <div className="absolute top-2 right-6 pointer-events-none overflow-hidden h-28 w-64 hidden xl:block opacity-25">
          <CivicHallArt className="w-full h-full object-contain" />
        </div>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-[#65736B] font-medium">
          <Link href="/citizen/dashboard" className="flex items-center gap-1 hover:text-[#293732] transition-colors">
            <Home className="w-3.5 h-3.5 text-[#527B7A]" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-[#929B92]" />
          {step === 'CATEGORY' ? (
            <span className="text-[#293732] font-semibold">Report an Issue</span>
          ) : (
            <>
              <button 
                type="button" 
                onClick={() => setStep('CATEGORY')}
                className="hover:text-[#293732] transition-colors"
              >
                Report an Issue
              </button>
              <ChevronRight className="w-3 h-3 text-[#929B92]" />
              <span className="text-[#293732] font-semibold">{getBreadcrumbLabel()}</span>
            </>
          )}
        </div>

        {/* Editorial Heading */}
        <div className="space-y-1">
          <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
            {getPageTitle()}
          </h1>
          <p className="text-sm sm:text-base text-[#65736B] max-w-2xl font-body">
            {getPageSubtitle()}
          </p>
        </div>

        {/* Stepper Pill Bar */}
        <div className="flex justify-center sm:justify-start">
          <div className="bg-[#E9ECE6] border border-[#DDDCD3] rounded-full px-5 sm:px-8 py-2.5 flex items-center gap-3 sm:gap-6 shadow-[inset_0_1px_2px_rgba(41,55,50,0.05)] w-full max-w-2xl justify-between">
            {/* Step 1: Category */}
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                currentStepIndex > 0
                  ? 'bg-[#527B7A] text-white shadow-sm'
                  : currentStepIndex === 0
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-[#DDDCD3] text-[#65736B]'
              }`}>
                {currentStepIndex > 0 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '1'}
              </div>
              <span className={`text-xs font-semibold ${currentStepIndex >= 0 ? 'text-[#293732]' : 'text-[#65736B]'}`}>
                Category
              </span>
            </div>

            <div className={`flex-1 h-0.5 rounded-full ${currentStepIndex > 0 ? 'bg-[#527B7A]' : 'bg-[#DDDCD3]'}`} />

            {/* Step 2: Evidence */}
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                currentStepIndex > 1
                  ? 'bg-[#527B7A] text-white shadow-sm'
                  : currentStepIndex === 1
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-[#DDDCD3] text-[#65736B]'
              }`}>
                {currentStepIndex > 1 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '2'}
              </div>
              <span className={`text-xs font-semibold ${currentStepIndex >= 1 ? 'text-[#293732]' : 'text-[#65736B]'}`}>
                Evidence
              </span>
            </div>

            <div className={`flex-1 h-0.5 rounded-full ${currentStepIndex > 1 ? 'bg-[#527B7A]' : 'bg-[#DDDCD3]'}`} />

            {/* Step 3: Details */}
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                currentStepIndex > 2
                  ? 'bg-[#527B7A] text-white shadow-sm'
                  : currentStepIndex === 2
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-[#DDDCD3] text-[#65736B]'
              }`}>
                {currentStepIndex > 2 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '3'}
              </div>
              <span className={`text-xs font-semibold ${currentStepIndex >= 2 ? 'text-[#293732]' : 'text-[#65736B]'}`}>
                Details
              </span>
            </div>

            <div className={`flex-1 h-0.5 rounded-full ${currentStepIndex > 2 ? 'bg-[#527B7A]' : 'bg-[#DDDCD3]'}`} />

            {/* Step 4: Review */}
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                currentStepIndex === 3
                  ? 'bg-[#355858] text-white shadow-sm'
                  : 'bg-[#DDDCD3] text-[#65736B]'
              }`}>
                4
              </div>
              <span className={`text-xs font-semibold ${currentStepIndex === 3 ? 'text-[#293732]' : 'text-[#65736B]'}`}>
                Review
              </span>
            </div>
          </div>
        </div>

        {/* Error Alert if any */}
        {errorMessage && (
          <div className="p-4 bg-[#FBF1EF] border border-[#EAC8C1] rounded-2xl text-xs sm:text-sm text-[#B76F60] flex items-center gap-3 font-medium">
            <AlertCircle className="w-5 h-5 text-[#B76F60] shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ── STEP 1: CATEGORY SELECTION (IMAGE 4) ── */}
        {step === 'CATEGORY' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-9 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg sm:text-xl text-[#293732]">
                Select Issue Category
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-[#65736B] hover:text-[#293732] cursor-pointer">
                <Info className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Need help?</span>
              </div>
            </div>

            {/* 8 Category Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {categoryList.map((cat) => {
                const isSelected = category === cat.id;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-between text-center transition-all duration-200 cursor-pointer relative min-h-[170px] ${
                      isSelected
                        ? 'bg-[#F2F7F5] border-2 border-[#527B7A] shadow-[0_4px_14px_rgba(82,123,122,0.18)] scale-[1.01]'
                        : 'bg-white border border-[#DDDCD3] shadow-[0_2px_6px_rgba(41,55,50,0.04)] hover:border-[#527B7A]/50 hover:shadow-md'
                    }`}
                  >
                    {/* Active Selected Check Badge */}
                    {isSelected && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#527B7A] text-white flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}

                    {/* Illustration */}
                    <div className="w-full h-16 flex items-center justify-center mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cat.image}
                        alt={cat.label}
                        className="max-h-14 max-w-full object-contain"
                      />
                    </div>

                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-sm text-[#293732]">
                        {cat.label}
                      </h3>
                      <p className="text-[11px] text-[#65736B] leading-tight line-clamp-2 font-medium">
                        {cat.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E5E9E3]">
              <Link
                href="/citizen/dashboard"
                className="text-xs font-semibold text-[#65736B] hover:text-[#293732] cursor-pointer"
              >
                Cancel
              </Link>

              <button
                type="button"
                onClick={() => setStep('CAPTURE')}
                className="py-3 px-6 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer"
              >
                <span>Next: Capture Evidence</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: EVIDENCE CAPTURE (IMAGE 5) ── */}
        {step === 'CAPTURE' && (
          <div className="space-y-6">
            <CaptureCamera
              role="REPORT"
              onCapture={handleCaptured}
              onCancel={prevStep}
            />

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={prevStep}
                className="py-2.5 px-5 rounded-xl font-medium text-xs sm:text-sm text-[#293732] bg-white border border-[#DDDCD3] shadow-[0_2px_5px_rgba(41,55,50,0.06)] hover:bg-[#FAF9F5] active:translate-y-px transition-all cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={() => setStep('DETAILS')}
                className="py-3 px-6 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer"
              >
                <span>Next: Add Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: DETAILS (IMAGE 1) ── */}
        {step === 'DETAILS' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-9 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
            <h2 className="font-display font-semibold text-lg sm:text-xl text-[#293732]">
              Add Report Details
            </h2>

            {/* Additional Notes Recessed Field */}
            <div className="space-y-2">
              <label htmlFor="report-notes-field" className="block text-xs font-semibold text-[#293732]">
                Additional Notes <span className="text-[#929B92] font-normal">(Optional)</span>
              </label>
              <textarea
                id="report-notes-field"
                rows={3}
                value={note}
                maxLength={TEXT_LIMITS.description}
                onChange={(e) => setNote(e.target.value.slice(0, TEXT_LIMITS.description))}
                placeholder="Large pothole causing vehicle slowdown."
                className="w-full p-4 bg-[#F6F7F4] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all placeholder:text-[#929B92] resize-none"
              />
              <div className="text-right text-[11px] font-mono text-[#929B92]">
                {note.length} / {TEXT_LIMITS.description}
              </div>
            </div>

            {/* Defect Size Segmented Control */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[#293732]">
                Defect Size
              </label>
              <div className="bg-[#E9ECE6] p-1.5 rounded-2xl border border-[#D8DED7] flex items-center gap-1 shadow-[inset_0_1px_2px_rgba(41,55,50,0.05)] max-w-md">
                {(['small', 'medium', 'large'] as SizeClass[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSizeClass(size)}
                    className={`flex-1 py-2.5 text-xs font-semibold rounded-xl capitalize transition-all duration-150 cursor-pointer ${
                      sizeClass === size
                        ? 'bg-[#355858] text-white shadow-[0_2px_6px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)]'
                        : 'text-[#65736B] hover:text-[#293732]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Road Blockage Segmented Control */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[#293732]">
                Road Blockage
              </label>
              <div className="bg-[#E9ECE6] p-1.5 rounded-2xl border border-[#D8DED7] flex items-center gap-1 shadow-[inset_0_1px_2px_rgba(41,55,50,0.05)] max-w-lg">
                {[
                  { id: 'none' as BlockedShare, label: 'No Blockage' },
                  { id: 'part lane' as BlockedShare, label: 'Partially Blocked' },
                  { id: 'full' as BlockedShare, label: 'Fully Blocked' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBlockedShare(item.id)}
                    className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all duration-150 cursor-pointer ${
                      blockedShare === item.id
                        ? 'bg-[#355858] text-white shadow-[0_2px_6px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)]'
                        : 'text-[#65736B] hover:text-[#293732]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E5E9E3]">
              <button
                type="button"
                onClick={prevStep}
                className="py-2.5 px-5 rounded-xl font-medium text-xs sm:text-sm text-[#293732] bg-white border border-[#DDDCD3] shadow-[0_2px_5px_rgba(41,55,50,0.06)] hover:bg-[#FAF9F5] active:translate-y-px transition-all cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={() => setStep('REVIEW')}
                className="py-3 px-6 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: REVIEW & SUBMIT (IMAGE 1) ── */}
        {step === 'REVIEW' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-9 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
            <h2 className="font-display font-semibold text-lg sm:text-xl text-[#293732]">
              Review Your Report
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left Column: Evidence Photo Preview */}
              <div className="md:col-span-5 aspect-[4/3] rounded-2xl overflow-hidden border border-[#DDDCD3] bg-[#F6F7F4] shadow-sm relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capturedEvidence?.previewUrl || '/images/pothole-clean-evidence.jpg'}
                  alt="Evidence Preview"
                  className="w-full h-full object-cover"
                />
                {/* Corner viewfinder reticles */}
                <div className="absolute inset-3 pointer-events-none">
                  <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-white/90 rounded-tl" />
                  <div className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-white/90 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-white/90 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-white/90 rounded-br" />
                </div>
              </div>

              {/* Right Column: Structured Record Metadata */}
              <div className="md:col-span-7 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] font-bold">
                    <MapPin className="w-5 h-5 text-[#355858]" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-base sm:text-lg text-[#293732] capitalize">
                      {category.replace(/_/g, ' ').toLowerCase()}
                    </h3>
                    <div className="text-xs text-[#65736B]">
                      {currentWard?.fullName || currentWard?.wardLabel || 'Bengaluru Municipal Grid'}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-[#F6F7F4] rounded-xl border border-[#E5E9E3] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#65736B]">Coordinates:</span>
                    <span className="font-mono font-semibold text-[#293732]">
                      {capturedEvidence
                        ? `${capturedEvidence.payload.lat.toFixed(6)}° N, ${capturedEvidence.payload.lng.toFixed(6)}° E`
                        : 'Pending GPS capture'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[#65736B]">Accuracy:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-[#293732]">
                        {capturedEvidence ? `± ${capturedEvidence.payload.accuracy.toFixed(1)} m` : '—'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
                        {capturedEvidence ? 'verified' : 'pending'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#F6F7F4] border border-[#E5E9E3]">
                    <div className="text-[#929B92] text-[11px]">Defect Size</div>
                    <div className="font-semibold text-[#293732] capitalize pt-0.5">{sizeClass}</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F6F7F4] border border-[#E5E9E3]">
                    <div className="text-[#929B92] text-[11px]">Road Blockage</div>
                    <div className="font-semibold text-[#293732] capitalize pt-0.5">
                      {blockedShare === 'none' ? 'No Blockage' : blockedShare}
                    </div>
                  </div>
                </div>

                {note && (
                  <div className="p-3 rounded-xl bg-[#F6F7F4] border border-[#E5E9E3] text-xs space-y-1">
                    <div className="text-[#929B92] text-[11px]">Notes</div>
                    <p className="text-[#293732] font-medium italic">&quot;{note}&quot;</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E5E9E3]">
              <button
                type="button"
                onClick={prevStep}
                className="py-2.5 px-5 rounded-xl font-medium text-xs sm:text-sm text-[#293732] bg-white border border-[#DDDCD3] shadow-[0_2px_5px_rgba(41,55,50,0.06)] hover:bg-[#FAF9F5] active:translate-y-px transition-all cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="py-3 px-8 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Record...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Report</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function FileReportPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-12 bg-[#F3F2EB]">
        <div className="w-8 h-8 rounded-full border-2 border-[#527B7A] border-t-transparent animate-spin" />
      </div>
    }>
      <FileReportContent />
    </Suspense>
  );
}

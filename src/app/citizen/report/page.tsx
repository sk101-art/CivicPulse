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
  Loader2,
  Droplets,
  Footprints,
  Hammer,
  Trees,
  CheckCircle2,
  WifiOff,
  Edit3,
} from 'lucide-react';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';
import { useOfflineSync, newClientReportId } from '@/hooks/useOfflineSync';
import { TEXT_LIMITS } from '@/lib/validation/limits';
import { CivicHallArt } from '@/components/ui/CivicHallArt';
import { useOptionalGeoContext } from '@/context/GeoContext';
import { formatDateTimeIST } from '@/lib/time/ist';

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
  image?: string;
  icon?: 'droplets' | 'footprints' | 'hammer' | 'trees';
}

const REPORT_CATEGORIES: CategoryCardItem[] = [
  {
    id: Category.POTHOLES,
    label: 'Potholes',
    description: 'Road surface damage and deep pits',
    image: '/images/categories/cat-potholes.png',
  },
  {
    id: Category.DRAINAGE,
    label: 'Drainage',
    description: 'Blocked or overflowing drains',
    image: '/images/categories/cat-drainage.png',
  },
  {
    id: Category.WATERLOGGING,
    label: 'Waterlogging',
    description: 'Standing rainwater flooding roads',
    icon: 'droplets',
  },
  {
    id: Category.STREETLIGHTS,
    label: 'Streetlights',
    description: 'Not working or damaged lights',
    image: '/images/categories/cat-streetlights.png',
  },
  {
    id: Category.SIDEWALKS,
    label: 'Sidewalks',
    description: 'Damaged or uneven road shoulders',
    image: '/images/categories/cat-sidewalks.png',
  },
  {
    id: Category.FOOTPATH,
    label: 'Footpaths',
    description: 'Broken or obstructed pedestrian paths',
    icon: 'footprints',
  },
  {
    id: Category.TRAFFIC_SIGNS,
    label: 'Traffic Signs',
    description: 'Missing, damaged or unclear signage',
    image: '/images/categories/cat-traffic-signs.png',
  },
  {
    id: Category.ROAD_CUT,
    label: 'Road Cuts',
    description: 'Unrestored utility trenches or excavations',
    icon: 'hammer',
  },
  {
    id: Category.TREE_FALL,
    label: 'Tree Fall',
    description: 'Fallen branches or uprooted trees',
    icon: 'trees',
  },
  {
    id: Category.GRAFFITI,
    label: 'Graffiti',
    description: 'Unauthorized markings on public property',
    image: '/images/categories/cat-graffiti.png',
  },
  {
    id: Category.TRASH,
    label: 'Trash / Litter',
    description: 'Garbage, dumping or uncollected waste',
    image: '/images/categories/cat-trash.png',
  },
  {
    id: Category.OTHER,
    label: 'Other',
    description: 'Any other civic infrastructure issue',
    image: '/images/categories/cat-other.png',
  },
];

type SizeClass = 'small' | 'medium' | 'large';
type BlockedShare = 'none' | 'part lane' | 'one lane' | 'full';
type Step = 'CATEGORY' | 'CAPTURE' | 'DETAILS' | 'REVIEW';

function renderCategoryVisual(cat: CategoryCardItem) {
  if (cat.image) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={cat.image} alt={cat.label} className="max-h-14 max-w-full object-contain" />
    );
  }
  const IconComp =
    cat.icon === 'droplets'
      ? Droplets
      : cat.icon === 'footprints'
        ? Footprints
        : cat.icon === 'hammer'
          ? Hammer
          : Trees;
  return (
    <div className="w-12 h-12 rounded-2xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858]">
      <IconComp className="w-6 h-6" />
    </div>
  );
}

function FileReportContent() {
  const router = useRouter();
  const { isOnline, queueReport } = useOfflineSync();
  const geo = useOptionalGeoContext();
  const currentWard = geo?.currentWard ?? null;

  const [step, setStep] = useState<Step>('CATEGORY');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHelpPopover, setShowHelpPopover] = useState(false);

  const [category, setCategory] = useState<Category>(Category.POTHOLES);
  const [capturedEvidence, setCapturedEvidence] = useState<CapturedEvidence | null>(null);

  const [note, setNote] = useState<string>('');
  const [sizeClass, setSizeClass] = useState<SizeClass>('medium');
  const [blockedShare, setBlockedShare] = useState<BlockedShare>('none');
  const [clientReportId, setClientReportId] = useState<string>('');
  const [draftLoaded, setDraftLoaded] = useState(false);

  const [submissionState, setSubmissionState] = useState<
    | { kind: 'offline_queued'; clientReportId: string }
    | { kind: 'submitted'; issueId: string; merged: boolean }
    | null
  >(null);

  useEffect(() => {
    const d = readDraft();
    if (d.category && Object.values(Category).includes(d.category)) setCategory(d.category);
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

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const steps: Step[] = ['CATEGORY', 'CAPTURE', 'DETAILS', 'REVIEW'];
  const currentStepIndex = steps.indexOf(step);

  const goToStep = (target: Step) => {
    const targetIdx = steps.indexOf(target);
    if (targetIdx > 1 && !capturedEvidence) {
      setErrorMessage('Capture or upload a GPS-verified photograph before proceeding.');
      return;
    }
    setErrorMessage(null);
    setStep(target);
  };

  const prevStep = () => {
    setErrorMessage(null);
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1]);
    } else {
      router.push('/citizen/dashboard');
    }
  };

  const handleCaptured = (evidence: CapturedEvidence) => {
    setCapturedEvidence(evidence);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!capturedEvidence) {
      setErrorMessage('Authentic photographic and GPS evidence is required before submitting.');
      setStep('CAPTURE');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const photoBase64 = await blobToBase64(capturedEvidence.blob);
      const evidencePayload = capturedEvidence.payload;
      const signature = capturedEvidence.signature;
      const mimeType = capturedEvidence.blob.type || 'image/jpeg';

      const shouldQueueOffline = !isOnline || evidencePayload.nonce === 'offline';

      if (shouldQueueOffline) {
        await queueReport({
          category,
          payload: evidencePayload,
          signature,
          photoBase64,
          mimeType,
          note,
          sizeClass,
          blockedShare,
          offline: true,
          clientReportId,
        });

        clearDraft();
        setSubmissionState({ kind: 'offline_queued', clientReportId });
        setLoading(false);
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
          mimeType,
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
      const issueId: string = json.issue?.id || '';
      const merged = Boolean(json.merged);

      clearDraft();
      void geo?.refreshWardData();
      router.refresh();
      setSubmissionState({ kind: 'submitted', issueId, merged });
      setLoading(false);
      if (issueId) {
        router.push(`/citizen/report/${issueId}${merged ? '?merged=1' : ''}`);
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
        return 'Take a clear photo of the issue with GPS verification to create a trusted report.';
      case 'DETAILS':
        return 'Provide additional notes, defect severity and traffic impact.';
      case 'REVIEW':
        return 'Verify the recorded civic evidence and submit to the municipal ledger.';
    }
  };

  if (submissionState?.kind === 'offline_queued') {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
        <div className="p-6 md:p-8 lg:p-10 max-w-2xl mx-auto w-full">
          <div
            data-testid="offline-queued-confirmation"
            className="bg-white rounded-[26px] p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06)] space-y-5 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#FDF6ED] border border-[#F4E3CB] text-[#B68B63] flex items-center justify-center mx-auto">
              <WifiOff className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#FDF6ED] text-[#B68B63] border border-[#F4E3CB]">
                Saved Locally • Pending Sync
              </span>
              <h1 className="font-display text-2xl font-semibold text-[#293732]">
                Report Saved on This Device
              </h1>
              <p className="text-sm text-[#65736B] leading-relaxed">
                Your signed evidence has been stored locally in IndexedDB and has not yet reached the municipal server. It will synchronize automatically when connectivity is restored.
              </p>
            </div>
            <div className="text-xs font-mono text-[#65736B] bg-[#F6F7F4] rounded-xl p-3 border border-[#E5E9E3]">
              Draft Reference: {submissionState.clientReportId}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href="/citizen/dashboard"
                className="px-5 py-2.5 rounded-xl bg-[#355858] text-white text-xs font-semibold hover:bg-[#2E5453] transition-colors"
              >
                Go to Home
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSubmissionState(null);
                  setCapturedEvidence(null);
                  setNote('');
                  setClientReportId(newClientReportId());
                  setStep('CATEGORY');
                }}
                className="px-5 py-2.5 rounded-xl bg-white border border-[#DDDCD3] text-[#293732] text-xs font-semibold hover:bg-[#FAF9F5] cursor-pointer"
              >
                File Another Report
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1240px] mx-auto w-full relative">
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
                onClick={() => goToStep('CATEGORY')}
                className="hover:text-[#293732] transition-colors cursor-pointer"
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

        {/* Clickable Stepper Pill Bar */}
        <div className="flex justify-center sm:justify-start">
          <div className="bg-[#E9ECE6] border border-[#DDDCD3] rounded-full px-5 sm:px-8 py-2.5 flex items-center gap-3 sm:gap-5 shadow-[inset_0_1px_2px_rgba(41,55,50,0.05)] w-full max-w-2xl justify-between">
            {[
              { id: 'CATEGORY' as Step, label: 'Category', num: '1' },
              { id: 'CAPTURE' as Step, label: 'Evidence', num: '2' },
              { id: 'DETAILS' as Step, label: 'Details', num: '3' },
              { id: 'REVIEW' as Step, label: 'Review', num: '4' },
            ].map((s, idx) => {
              const isCompleted = currentStepIndex > idx;
              const isCurrent = currentStepIndex === idx;
              const canJump = idx < currentStepIndex || (idx <= 1) || Boolean(capturedEvidence);

              return (
                <div key={s.id} className="contents">
                  <button
                    type="button"
                    disabled={!canJump}
                    onClick={() => canJump && goToStep(s.id)}
                    className={`flex items-center gap-2 ${canJump ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                        isCompleted
                          ? 'bg-[#527B7A] text-white shadow-sm'
                          : isCurrent
                            ? 'bg-[#355858] text-white shadow-sm'
                            : 'bg-[#DDDCD3] text-[#65736B]'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.num}
                    </div>
                    <span className={`text-xs font-semibold ${isCurrent || isCompleted ? 'text-[#293732]' : 'text-[#65736B]'}`}>
                      {s.label}
                    </span>
                  </button>
                  {idx < 3 && (
                    <div className={`flex-1 h-0.5 rounded-full ${currentStepIndex > idx ? 'bg-[#527B7A]' : 'bg-[#DDDCD3]'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <div
            data-testid="report-error-alert"
            className="p-4 bg-[#FBF1EF] border border-[#EAC8C1] rounded-2xl text-xs sm:text-sm text-[#B76F60] flex items-center gap-3 font-medium"
          >
            <AlertCircle className="w-5 h-5 text-[#B76F60] shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: CATEGORY SELECTION (All 12 Prisma Categories) */}
        {step === 'CATEGORY' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-9 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
            <div className="flex items-center justify-between relative">
              <h2 className="font-display font-semibold text-lg sm:text-xl text-[#293732]">
                Select Issue Category
              </h2>
              <button
                type="button"
                onClick={() => setShowHelpPopover((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-[#65736B] hover:text-[#293732] cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Need help?</span>
              </button>

              {showHelpPopover && (
                <div className="absolute right-0 top-9 z-30 w-72 p-4 rounded-2xl bg-white border border-[#DDDCD3] shadow-lg text-xs text-[#293732] space-y-1.5">
                  <div className="font-semibold text-[#355858]">Choosing a Category</div>
                  <p className="text-[#65736B] leading-relaxed">
                    Pick the primary infrastructure defect visible in your photo. Road surface craters belong under <strong>Potholes</strong>; open utility trenches under <strong>Road Cuts</strong>; standing floodwater under <strong>Waterlogging</strong>.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {REPORT_CATEGORIES.map((cat) => {
                const isSelected = category === cat.id;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid={`category-card-${cat.id}`}
                    onClick={() => setCategory(cat.id)}
                    className={`rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-between text-center transition-all duration-200 cursor-pointer relative min-h-[164px] ${
                      isSelected
                        ? 'bg-[#F2F7F5] border-2 border-[#527B7A] shadow-[0_4px_14px_rgba(82,123,122,0.18)] scale-[1.01]'
                        : 'bg-white border border-[#DDDCD3] shadow-[0_2px_6px_rgba(41,55,50,0.04)] hover:border-[#527B7A]/50 hover:shadow-md'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#527B7A] text-white flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}

                    <div className="w-full h-16 flex items-center justify-center mb-2">
                      {renderCategoryVisual(cat)}
                    </div>

                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-sm text-[#293732]">{cat.label}</h3>
                      <p className="text-[11px] text-[#65736B] leading-tight line-clamp-2 font-medium">
                        {cat.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#E5E9E3]">
              <Link
                href="/citizen/dashboard"
                className="text-xs font-semibold text-[#65736B] hover:text-[#293732] cursor-pointer"
              >
                Cancel
              </Link>

              <button
                type="button"
                onClick={() => goToStep('CAPTURE')}
                className="py-3 px-6 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer"
              >
                <span>Next: Capture Evidence</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: EVIDENCE CAPTURE */}
        {step === 'CAPTURE' && (
          <div className="space-y-6">
            <CaptureCamera
              role="REPORT"
              onCapture={handleCaptured}
              onCancel={prevStep}
            />

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
                onClick={() => goToStep('DETAILS')}
                disabled={!capturedEvidence}
                className="py-3 px-6 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Next: Add Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {step === 'DETAILS' && (
          <div className="bg-white rounded-[26px] p-6 sm:p-9 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
            <h2 className="font-display font-semibold text-lg sm:text-xl text-[#293732]">
              Add Report Details
            </h2>

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
                placeholder="Describe visible damage, safety hazards, or landmarks nearby."
                className="w-full p-4 bg-[#F6F7F4] border border-[#DDDCD3] rounded-xl text-sm text-[#293732] shadow-[inset_0_2px_4px_rgba(41,55,50,0.06)] focus:bg-white focus:border-[#527B7A] focus:ring-2 focus:ring-[#527B7A]/20 outline-none transition-all placeholder:text-[#929B92] resize-none"
              />
              <div className="text-right text-[11px] font-mono text-[#929B92]">
                {note.length} / {TEXT_LIMITS.description}
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[#293732]">Defect Size</label>
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

            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[#293732]">Road Blockage</label>
              <div className="bg-[#E9ECE6] p-1.5 rounded-2xl border border-[#D8DED7] grid grid-cols-2 sm:grid-cols-4 gap-1 shadow-[inset_0_1px_2px_rgba(41,55,50,0.05)] max-w-2xl">
                {[
                  { id: 'none' as BlockedShare, label: 'No Blockage' },
                  { id: 'part lane' as BlockedShare, label: 'Part Lane' },
                  { id: 'one lane' as BlockedShare, label: 'One Lane' },
                  { id: 'full' as BlockedShare, label: 'Full Blockage' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBlockedShare(item.id)}
                    className={`py-2.5 px-2 text-xs font-semibold rounded-xl transition-all duration-150 cursor-pointer ${
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
                onClick={() => goToStep('REVIEW')}
                className="py-3 px-6 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer"
              >
                <span>Next: Review</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW & SUBMIT */}
        {step === 'REVIEW' && capturedEvidence && (
          <div className="bg-white rounded-[26px] p-6 sm:p-9 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-lg sm:text-xl text-[#293732]">
                Review Your Report
              </h2>
              {submissionState?.kind === 'submitted' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Submitted ({submissionState.issueId})</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left Column: Actual Evidence Photo Preview */}
              <div className="md:col-span-5 space-y-2">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[#DDDCD3] bg-[#F6F7F4] shadow-sm relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturedEvidence.previewUrl}
                    alt="Evidence Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => goToStep('CAPTURE')}
                  className="text-xs font-semibold text-[#527B7A] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Evidence</span>
                </button>
              </div>

              {/* Right Column: Structured Record Metadata */}
              <div className="md:col-span-7 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] font-bold">
                      <MapPin className="w-5 h-5 text-[#355858]" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-base sm:text-lg text-[#293732]">
                        {REPORT_CATEGORIES.find((c) => c.id === category)?.label || category.replace(/_/g, ' ')}
                      </h3>
                      <div className="text-xs text-[#65736B]">
                        {currentWard?.fullName || currentWard?.wardLabel || 'Bengaluru Municipal Grid'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToStep('CATEGORY')}
                    className="text-xs font-semibold text-[#527B7A] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </div>

                <div className="p-3.5 bg-[#F6F7F4] rounded-xl border border-[#E5E9E3] space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#65736B]">Selected Issue Pin:</span>
                    <span className="font-mono font-semibold text-[#293732]">
                      {capturedEvidence.payload.lat.toFixed(6)}° N, {capturedEvidence.payload.lng.toFixed(6)}° E
                    </span>
                  </div>

                  {capturedEvidence.captureCoords && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#65736B]">Device Capture GPS:</span>
                      <span className="font-mono text-[#65736B]">
                        {capturedEvidence.captureCoords.lat.toFixed(6)}° N, {capturedEvidence.captureCoords.lng.toFixed(6)}° E
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#65736B]">GPS Accuracy:</span>
                    <span className="font-mono font-semibold text-[#293732]">
                      ± {capturedEvidence.payload.accuracy.toFixed(1)} m
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#65736B]">Captured at:</span>
                    <span className="font-mono font-semibold text-[#293732]">
                      {formatDateTimeIST(capturedEvidence.payload.capturedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#65736B]">Signing Mode:</span>
                    <span className="font-mono font-semibold text-[#537C60]">
                      {capturedEvidence.payload.nonce === 'offline' || !isOnline
                        ? 'Signed Locally (Offline Queue)'
                        : 'ECDSA P-256 + Server Nonce'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#293732]">Severity & Notes</span>
                    <button
                      type="button"
                      onClick={() => goToStep('DETAILS')}
                      className="text-xs font-semibold text-[#527B7A] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Details</span>
                    </button>
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
            </div>

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
                    <span>{isOnline ? 'Submit Report' : 'Save Offline Draft'}</span>
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
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-12 bg-[#F3F2EB]">
          <div className="w-8 h-8 rounded-full border-2 border-[#527B7A] border-t-transparent animate-spin" />
        </div>
      }
    >
      <FileReportContent />
    </Suspense>
  );
}

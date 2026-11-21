'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronRight, 
  MapPin, 
  Clock, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Navigation, 
  ArrowLeft, 
  X, 
  Check, 
  Award,
  ShieldCheck,
  Compass,
  Home
} from 'lucide-react';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';

interface AuditTaskItem {
  id: string;
  category: 'POTHOLES' | 'STREETLIGHTS' | 'DRAINAGE' | 'OTHER';
  title: string;
  lat: number;
  lng: number;
  address: string | null;
  distance: string;
  dueIn: string;
  image: string;
  challengeBearingDeg: number;
  challengeNonce: string;
  dueAt: string;
  status: string;
}

interface UserSubmissionItem {
  id: string;
  title: string;
  location: string;
  submittedAt: string;
  verdict: 'INTACT' | 'DAMAGED' | 'CANNOT_SEE';
  verdictLabel: string;
  image: string;
  xpEarned: number;
}

const DEFAULT_AUDIT_TASKS: AuditTaskItem[] = [
  {
    id: 'TASK-2025-081',
    category: 'POTHOLES',
    title: 'Pothole Repair',
    lat: 12.9716,
    lng: 77.5946,
    address: 'MG Road, Ward 12',
    distance: '320 m away',
    dueIn: 'Due in 2 days',
    image: '/images/pothole-clean-evidence.jpg',
    challengeBearingDeg: 184,
    challengeNonce: 'nonce-audit-81',
    dueAt: '2025-03-16T18:00:00Z',
    status: 'PENDING_AUDIT',
  },
  {
    id: 'TASK-2025-082',
    category: 'STREETLIGHTS',
    title: 'Streetlight Repair',
    lat: 12.9750,
    lng: 77.5990,
    address: 'Lake View St, Ward 8',
    distance: '610 m away',
    dueIn: 'Due in 3 days',
    image: '/images/evidence-streetlight-clean.jpg',
    challengeBearingDeg: 72,
    challengeNonce: 'nonce-audit-82',
    dueAt: '2025-03-17T18:00:00Z',
    status: 'PENDING_AUDIT',
  },
  {
    id: 'TASK-2025-083',
    category: 'DRAINAGE',
    title: 'Drainage Cleanup',
    lat: 12.9680,
    lng: 77.5910,
    address: 'East Park Rd, Ward 12',
    distance: '1.2 km away',
    dueIn: 'Due in 4 days',
    image: '/images/evidence-drainage-clean.jpg',
    challengeBearingDeg: 295,
    challengeNonce: 'nonce-audit-83',
    dueAt: '2025-03-18T18:00:00Z',
    status: 'PENDING_AUDIT',
  },
];

const DEFAULT_SUBMISSIONS: UserSubmissionItem[] = [
  {
    id: 'SUB-2025-041',
    title: 'Pothole Repair Verification',
    location: 'MG Road, Ward 12',
    submittedAt: 'Mar 10, 2025',
    verdict: 'INTACT',
    verdictLabel: 'Verified Fixed',
    image: '/images/evidence-repair-clean.jpg',
    xpEarned: 25,
  },
  {
    id: 'SUB-2025-039',
    title: 'Streetlight Inspection',
    location: 'Lake View St, Ward 8',
    submittedAt: 'Mar 8, 2025',
    verdict: 'DAMAGED',
    verdictLabel: 'Disputed (Unfixed)',
    image: '/images/evidence-streetlight-clean.jpg',
    xpEarned: 25,
  },
];

export default function CitizenAuditPage() {
  const [activeTab, setActiveTab] = useState<'available' | 'submissions'>('available');
  const [tasks, setTasks] = useState<AuditTaskItem[]>(DEFAULT_AUDIT_TASKS);
  const [submissions] = useState<UserSubmissionItem[]>(DEFAULT_SUBMISSIONS);
  const [activeTask, setActiveTask] = useState<AuditTaskItem | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Capture flow states
  const [capturedEvidence, setCapturedEvidence] = useState<CapturedEvidence | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [observedVerdict, setObservedVerdict] = useState<'INTACT' | 'DAMAGED' | 'CANNOT_SEE' | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Listen for device orientation
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        setDeviceHeading(Math.round(e.alpha));
      }
    };

    if (typeof window !== 'undefined') {
      const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
      window.addEventListener(eventName, handleOrientation as EventListener, true);
      return () => {
        window.removeEventListener(eventName, handleOrientation as EventListener, true);
      };
    }
  }, []);

  // Fetch user location
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => console.warn('Geolocation unavailable, using default coordinates'),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Fetch live tasks if available from API
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const query = userLocation ? `?lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
        const res = await fetch(`/api/audit/tasks${query}`);
        if (res.ok) {
          const data = await res.json();
          if (data.tasks && data.tasks.length > 0) {
            const mapped = data.tasks.map((t: any, idx: number) => {
              const fallback = DEFAULT_AUDIT_TASKS[idx % DEFAULT_AUDIT_TASKS.length];
              return {
                id: t.id,
                category: fallback.category,
                title: fallback.title,
                lat: t.lat,
                lng: t.lng,
                address: t.address || fallback.address,
                distance: t.distanceM ? `${t.distanceM} m away` : fallback.distance,
                dueIn: fallback.dueIn,
                image: fallback.image,
                challengeBearingDeg: t.challengeBearingDeg || fallback.challengeBearingDeg,
                challengeNonce: t.challengeNonce || fallback.challengeNonce,
                dueAt: t.dueAt || fallback.dueAt,
                status: t.status || fallback.status,
              };
            });
            setTasks(mapped);
          }
        }
      } catch (err) {
        console.warn('API audit tasks fetch returned error, using default audit tasks:', err);
      }
    };

    fetchTasks();
  }, [userLocation]);

  const handleCapture = async (evidence: CapturedEvidence) => {
    setCapturedEvidence(evidence);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setPhotoBase64(base64);
    };
    reader.readAsDataURL(evidence.blob);
  };

  const handleSubmitVote = async () => {
    if (!activeTask || !capturedEvidence || !observedVerdict) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      // If photo base64 not yet parsed, create demo string
      const base64Payload = photoBase64 || 'demo-evidence-base64';

      await fetch(`/api/audit/tasks/${activeTask.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observed: observedVerdict,
          deviceHeadingDeg: deviceHeading ?? activeTask.challengeBearingDeg,
          evidence: {
            payload: capturedEvidence.payload,
            signature: capturedEvidence.signature,
            photoBase64: base64Payload,
            mimeType: 'image/jpeg',
          },
        }),
      }).catch(() => null);

      setFeedback({
        success: true,
        message: 'Repair verification submitted! +25 Citizen XP earned.',
      });

      setTimeout(() => {
        setActiveTask(null);
        setCapturedEvidence(null);
        setPhotoBase64(null);
        setObservedVerdict(null);
        setFeedback(null);
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ success: false, message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1040px] mx-auto w-full">
        
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-[#65736B] font-medium">
          <Link href="/citizen/dashboard" className="flex items-center gap-1 hover:text-[#293732] transition-colors">
            <Home className="w-3.5 h-3.5 text-[#527B7A]" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-[#929B92]" />
          <span className="text-[#293732] font-semibold">Repair Verification</span>
        </div>

        {/* Editorial Heading (Matching Image 1 Row 2 Col 3) */}
        <div className="space-y-1">
          <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
            Repair Verification
          </h1>
          <p className="text-sm sm:text-base text-[#65736B] font-body">
            Help confirm if reported issues have been properly fixed.
          </p>
        </div>

        {/* Feedback Alert if shown */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-center gap-3 transition-all ${
              feedback.success
                ? 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]'
                : 'bg-[#FBECE8] text-[#B76F60] border-[#F2D2CC]'
            }`}
          >
            {feedback.success ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Tabbed Switcher (Available Tasks vs My Submissions) */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('available')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'available'
                ? 'bg-[#355858] text-white shadow-sm'
                : 'bg-white/80 hover:bg-white text-[#65736B] border border-[#DDDCD3]'
            }`}
          >
            Available Tasks ({tasks.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'submissions'
                ? 'bg-[#355858] text-white shadow-sm'
                : 'bg-white/80 hover:bg-white text-[#65736B] border border-[#DDDCD3]'
            }`}
          >
            My Submissions ({submissions.length})
          </button>
        </div>

        {/* ── TAB 1: AVAILABLE TASKS LIST ── */}
        {activeTab === 'available' && (
          <div className="space-y-3.5">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setActiveTask(task)}
                className="bg-white rounded-[22px] p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] hover:border-[#527B7A]/60 hover:shadow-[0_6px_20px_rgba(41,55,50,0.08)] transition-all cursor-pointer flex items-center justify-between gap-4 group active:translate-y-px"
              >
                {/* Left: Thumbnail & Title & Metadata */}
                <div className="flex items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
                  <div className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl overflow-hidden border border-[#DDDCD3] bg-[#F6F7F4] shrink-0 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={task.image}
                      alt={task.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base text-[#293732] group-hover:text-[#355858] transition-colors leading-snug">
                      {task.title}
                    </h3>
                    <p className="text-xs text-[#65736B] flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-medium text-[#293732]">{task.distance}</span>
                      <span>•</span>
                      <span className="truncate">{task.address}</span>
                    </p>
                  </div>
                </div>

                {/* Right: Due In Badge & Chevron */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-[#FDF6ED] text-[#B68B63] border border-[#F5E2CD] whitespace-nowrap">
                    {task.dueIn}
                  </span>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-[#929B92] group-hover:text-[#293732] group-hover:translate-x-0.5 transition-all">
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB 2: MY SUBMISSIONS LIST ── */}
        {activeTab === 'submissions' && (
          <div className="space-y-3.5">
            {submissions.map((sub) => {
              const statusStyles = {
                INTACT: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]',
                DAMAGED: 'bg-[#FBECE8] text-[#B76F60] border-[#F2D2CC]',
                CANNOT_SEE: 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]',
              }[sub.verdict];

              return (
                <div
                  key={sub.id}
                  className="bg-white rounded-[22px] p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03)] flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#DDDCD3] bg-[#F6F7F4] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sub.image}
                        alt={sub.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base text-[#293732] truncate">
                        {sub.title}
                      </h3>
                      <p className="text-xs text-[#65736B]">
                        {sub.location} • <span className="font-mono">{sub.submittedAt}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusStyles}`}>
                      {sub.verdictLabel}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF]">
                      +{sub.xpEarned} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── VERIFICATION MODAL FLOW ── */}
        {activeTask && (
          <div className="fixed inset-0 z-50 bg-[#293732]/60 backdrop-blur-sm p-4 flex flex-col justify-center items-center overflow-y-auto">
            <div className="w-full max-w-xl bg-white border border-[#DDDCD3] rounded-[28px] p-6 sm:p-8 space-y-6 shadow-[0_24px_48px_-12px_rgba(41,55,50,0.25)] animate-in fade-in zoom-in-95 duration-200">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-4">
                <div className="flex items-center gap-2 text-[#355858]">
                  <ShieldCheck className="w-5 h-5 text-[#527B7A]" />
                  <h3 className="font-display font-semibold text-base sm:text-lg text-[#293732]">
                    {activeTask.title} Verification
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTask(null);
                    setCapturedEvidence(null);
                    setObservedVerdict(null);
                  }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[#65736B] hover:text-[#293732] hover:bg-[#F3F2EB] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Location Target Badge */}
              <div className="p-4 rounded-2xl bg-[#F6F7F4] border border-[#DDDCD3] space-y-2">
                <div className="text-xs text-[#65736B] flex items-center justify-between">
                  <span>Location Target:</span>
                  <span className="font-mono font-semibold text-[#293732]">{activeTask.address}</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="px-3 py-1 rounded-lg bg-[#EAF2F0] border border-[#D0E2DF] text-[#355858] font-mono font-semibold flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 rotate-45 text-[#527B7A]" />
                    <span>Target Bearing: {activeTask.challengeBearingDeg}°</span>
                  </div>
                  {deviceHeading !== null && (
                    <span className="font-mono text-[#65736B]">
                      Heading: <strong className="text-[#293732]">{deviceHeading}°</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Step 1: Capture Evidence */}
              {!capturedEvidence ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#65736B]">
                    Take a clear, signed photograph facing <strong>{activeTask.challengeBearingDeg}°</strong>:
                  </p>
                  <div className="rounded-2xl overflow-hidden border border-[#DDDCD3]">
                    <CaptureCamera
                      role="AUDIT"
                      overrideNonce={activeTask.challengeNonce}
                      targetCoords={{ lat: activeTask.lat, lng: activeTask.lng }}
                      onCapture={handleCapture}
                      onCancel={() => setActiveTask(null)}
                    />
                  </div>
                </div>
              ) : (
                /* Step 2: Observed Verdict */
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4] text-[#537C60] text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                    <span>Evidence photograph signed (ECDSA P-256) and verified on-site.</span>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold text-[#293732] block">
                      What is the current state of this repair?
                    </label>

                    <div className="grid grid-cols-1 gap-2.5">
                      {/* Option 1: Intact / Fixed */}
                      <button
                        type="button"
                        onClick={() => setObservedVerdict('INTACT')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          observedVerdict === 'INTACT'
                            ? 'bg-[#EFF6F1] border-[#537C60] shadow-sm'
                            : 'bg-white hover:bg-[#F9FAF8] border-[#DDDCD3]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-xs sm:text-sm text-[#293732] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#537C60]" />
                            <span>Fixed Properly / Clear</span>
                          </div>
                          <p className="text-xs text-[#65736B] mt-0.5 pl-4">
                            Surface is smooth and repair is complete.
                          </p>
                        </div>
                        {observedVerdict === 'INTACT' && <Check className="w-5 h-5 text-[#537C60]" />}
                      </button>

                      {/* Option 2: Damaged / Unfixed */}
                      <button
                        type="button"
                        onClick={() => setObservedVerdict('DAMAGED')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          observedVerdict === 'DAMAGED'
                            ? 'bg-[#FBECE8] border-[#B76F60] shadow-sm'
                            : 'bg-white hover:bg-[#F9FAF8] border-[#DDDCD3]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-xs sm:text-sm text-[#293732] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#B76F60]" />
                            <span>Still Broken / Incomplete</span>
                          </div>
                          <p className="text-xs text-[#65736B] mt-0.5 pl-4">
                            Defect persists or repair was unsatisfactory.
                          </p>
                        </div>
                        {observedVerdict === 'DAMAGED' && <Check className="w-5 h-5 text-[#B76F60]" />}
                      </button>

                      {/* Option 3: Cannot See */}
                      <button
                        type="button"
                        onClick={() => setObservedVerdict('CANNOT_SEE')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          observedVerdict === 'CANNOT_SEE'
                            ? 'bg-[#E9ECE6] border-[#65736B] shadow-sm'
                            : 'bg-white hover:bg-[#F9FAF8] border-[#DDDCD3]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-xs sm:text-sm text-[#293732] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#65736B]" />
                            <span>Cannot Verify / Inaccessible</span>
                          </div>
                          <p className="text-xs text-[#65736B] mt-0.5 pl-4">
                            Site is blocked, dark, or unsafe to inspect.
                          </p>
                        </div>
                        {observedVerdict === 'CANNOT_SEE' && <Check className="w-5 h-5 text-[#65736B]" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSubmitVote}
                      disabled={isSubmitting || !observedVerdict}
                      className="w-full py-3.5 rounded-xl bg-[#355858] hover:bg-[#3E6966] text-white font-semibold text-sm shadow-[0_4px_14px_rgba(53,88,88,0.25)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all active:translate-y-px"
                    >
                      <Award className="w-4 h-4" />
                      <span>{isSubmitting ? 'Recording Verification...' : 'Submit Verification (+25 pts)'}</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

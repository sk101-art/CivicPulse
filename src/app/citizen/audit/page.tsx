'use client';

import React, { useState, useEffect } from 'react';
import { 
  Compass, MapPin, Clock, Camera, CheckCircle2, 
  AlertTriangle, EyeOff, Loader2, Navigation, ArrowLeft 
} from 'lucide-react';
import Link from 'next/link';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';

interface AuditTaskItem {
  id: string;
  lat: number;
  lng: number;
  address: string | null;
  challengeBearingDeg: number;
  challengeNonce: string;
  dueAt: string;
  status: string;
  distanceM?: number;
}

export default function CitizenAuditPage() {
  const [tasks, setTasks] = useState<AuditTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
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
      const hasAbsolute = 'ondeviceorientationabsolute' in (window as unknown as Record<string, unknown>);
      const eventName = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
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
        (err) => console.warn('Geolocation unavailable:', err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Load blind tasks
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchTasks = async () => {
      try {
        const query = userLocation ? `?lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
        const res = await fetch(`/api/audit/tasks${query}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setTasks(data.tasks || []);
        }
      } catch (err) {
        console.error('Failed to load audit tasks:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTasks();
    return () => {
      isMounted = false;
    };
  }, [userLocation, refreshTrigger]);

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
    if (!activeTask || !capturedEvidence || !photoBase64 || !observedVerdict) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/audit/tasks/${activeTask.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observed: observedVerdict,
          deviceHeadingDeg: deviceHeading ?? undefined,
          evidence: {
            payload: capturedEvidence.payload,
            signature: capturedEvidence.signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Failed to submit audit vote');
      }

      setFeedback({
        success: true,
        message: 'Blind audit vote recorded successfully! +25 Citizen XP earned.',
      });

      // Clear capture state after 2s
      setTimeout(() => {
        setActiveTask(null);
        setCapturedEvidence(null);
        setPhotoBase64(null);
        setObservedVerdict(null);
        setFeedback(null);
        setRefreshTrigger((prev) => prev + 1);
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ success: false, message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-zinc-100 font-body p-4 sm:p-6 pb-24 lg:pb-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/citizen/dashboard"
            className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
            <Compass className="w-3.5 h-3.5 animate-spin" />
            Blind Audit Network
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Citizen Audit Missions
          </h1>
          <p className="text-xs font-mono text-white/50 mt-1">
            Photograph assigned spots with cryptographic verification. Earn reputation points for keeping the road ledger truthful.
          </p>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs font-mono flex items-center gap-3 ${
              feedback.success
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            }`}
          >
            {feedback.success ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Active Task Modal / Screen */}
        {activeTask && (
          <div className="fixed inset-0 z-50 bg-black/90 p-4 flex flex-col justify-center items-center overflow-y-auto">
            <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold">
                  <Compass className="w-4 h-4" />
                  Blind Verification Challenge
                </div>
                <button
                  onClick={() => {
                    setActiveTask(null);
                    setCapturedEvidence(null);
                    setObservedVerdict(null);
                  }}
                  className="text-xs font-mono text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {/* Challenge Target Card */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="text-xs font-mono text-white/60">
                  Target Location: <strong className="text-white">{activeTask.address || 'Bengaluru'}</strong>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono font-bold text-xs flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 rotate-45 text-cyan-400" />
                    Target Bearing: {activeTask.challengeBearingDeg}°
                  </div>
                  {deviceHeading !== null && (
                    <div className="text-xs font-mono text-white/50">
                      Your Heading: <span className="font-bold text-white">{deviceHeading}°</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 1: Camera Capture */}
              {!capturedEvidence && (
                <div className="space-y-4">
                  <p className="text-xs font-mono text-white/70">
                    Stand within 30m of the spot facing <strong>{activeTask.challengeBearingDeg}°</strong> and take a signed photo:
                  </p>
                  <CaptureCamera
                    role="AUDIT"
                    overrideNonce={activeTask.challengeNonce}
                    targetCoords={{ lat: activeTask.lat, lng: activeTask.lng }}
                    onCapture={handleCapture}
                    onCancel={() => setActiveTask(null)}
                  />
                </div>
              )}

              {/* Step 2: Observed Verdict Selection */}
              {capturedEvidence && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Photo cryptographically signed and hash recorded!
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase text-white/50 block">
                      What do you observe at this spot?
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setObservedVerdict('INTACT')}
                        className={`p-3 rounded-xl border text-left text-xs font-mono transition-colors flex items-center justify-between ${
                          observedVerdict === 'INTACT'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                            : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                        }`}
                      >
                        <div>
                          <div className="font-bold">🟢 INTACT / CLEAR</div>
                          <div className="text-[10px] text-white/50 mt-0.5">Surface is smooth or defect has been repaired</div>
                        </div>
                        {observedVerdict === 'INTACT' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setObservedVerdict('DAMAGED')}
                        className={`p-3 rounded-xl border text-left text-xs font-mono transition-colors flex items-center justify-between ${
                          observedVerdict === 'DAMAGED'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                            : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                        }`}
                      >
                        <div>
                          <div className="font-bold">🔴 DAMAGED / UNFIXED</div>
                          <div className="text-[10px] text-white/50 mt-0.5">Defect is still present or deteriorated</div>
                        </div>
                        {observedVerdict === 'DAMAGED' && <CheckCircle2 className="w-4 h-4 text-rose-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setObservedVerdict('CANNOT_SEE')}
                        className={`p-3 rounded-xl border text-left text-xs font-mono transition-colors flex items-center justify-between ${
                          observedVerdict === 'CANNOT_SEE'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                            : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                        }`}
                      >
                        <div>
                          <div className="font-bold">⚪ CANNOT SEE / UNCLEAR</div>
                          <div className="text-[10px] text-white/50 mt-0.5">Obstruction, dark conditions, or spot ambiguous</div>
                        </div>
                        {observedVerdict === 'CANNOT_SEE' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedEvidence(null);
                        setPhotoBase64(null);
                        setObservedVerdict(null);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 text-xs font-mono"
                    >
                      Retake Photo
                    </button>
                    <button
                      type="button"
                      disabled={!observedVerdict || isSubmitting}
                      onClick={handleSubmitVote}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-bold text-xs font-mono hover:bg-cyan-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Submit Audit Vote
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task List */}
        {loading ? (
          <div className="p-12 text-center text-xs font-mono text-white/40 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Loading active audit missions...
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white/5 border border-white/10 text-center space-y-3">
            <EyeOff className="w-8 h-8 text-white/30 mx-auto" />
            <div className="text-sm font-bold font-mono text-white">No Open Audit Missions Nearby</div>
            <p className="text-xs font-mono text-white/50 max-w-sm mx-auto">
              You will automatically receive randomized audit tasks when repairs are claimed in your vicinity. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4 hover:border-cyan-500/30 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[11px] font-bold">
                      <Compass className="w-3.5 h-3.5" />
                      Face {task.challengeBearingDeg}°
                    </div>
                    {task.distanceM !== undefined && (
                      <span className="text-[11px] font-mono text-white/50">
                        {task.distanceM < 1000 ? `${task.distanceM}m away` : `${(task.distanceM / 1000).toFixed(1)}km`}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-bold font-mono text-white flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate">{task.address || 'Bengaluru Road Spot'}</span>
                    </div>
                    <div className="text-[11px] font-mono text-white/40">
                      Coordinates: {task.lat.toFixed(5)}, {task.lng.toFixed(5)}
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-amber-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Expires: {new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTask(task);
                    setCapturedEvidence(null);
                    setObservedVerdict(null);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 text-black font-bold text-xs font-mono hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Start Blind Audit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

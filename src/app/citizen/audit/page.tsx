'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Clock,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Navigation,
  ArrowLeft,
  X,
  Check,
  ShieldCheck,
  LocateFixed,
  RefreshCw,
  Loader2,
  ExternalLink,
  Inbox,
  Compass,
} from 'lucide-react';
import { CaptureCamera, type CapturedEvidence } from '@/components/evidence/CaptureCamera';
import { useOptionalGeoContext } from '@/context/GeoContext';
import { formatDateIST, formatDateTimeIST } from '@/lib/time/ist';
import { haversineDistanceM } from '@/lib/geo/distance';
import { notifyIssueUpdated } from '@/lib/map/statusPresentation';
import {
  MAX_EVIDENCE_DISTANCE_METERS,
  getGpsAccuracyWarning,
  getEvidenceDistanceWarning,
  isValidGpsAccuracy,
  isWithinEvidenceDistance,
} from '@/lib/evidence/locationLimits';

interface NearbyAuditTask {
  id: string;
  issueId: string;
  category: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  hasValidCoordinates: boolean;
  distanceM: number | null;
  dueAt: string;
  status: string;
  challengeBearingDeg: number;
  challengeNonce: string;
  ward: {
    id: string;
    code: string;
    wardNumber: number | null;
    name: string;
    corporationName: string | null;
  } | null;
}

interface AuditSubmissionItem {
  id: string;
  taskId: string;
  issueId: string;
  category: string;
  title: string;
  location: string;
  submittedAt: string;
  observed: 'INTACT' | 'DAMAGED' | 'CANNOT_SEE';
  taskStatus: 'OPEN' | 'COMPLETED' | 'EXPIRED';
  issueStatus: string;
  weight: number;
  image: string | null;
}

const RADIUS_OPTIONS = [
  { value: 500, label: 'Within 500 m' },
  { value: 1000, label: 'Within 1 km' },
  { value: 2000, label: 'Within 2 km' },
  { value: 5000, label: 'Within 5 km' },
  { value: 10000, label: 'Within 10 km' },
];

function formatDistance(distanceM: number | null): string | null {
  if (distanceM == null || !Number.isFinite(distanceM)) return null;
  if (distanceM < 1000) return `${Math.round(distanceM)} m away`;
  return `${(distanceM / 1000).toFixed(1)} km away`;
}

function formatSubmissionStatus(sub: AuditSubmissionItem): { label: string; tone: string } {
  if (sub.issueStatus === 'VERIFIED_FIXED') {
    return { label: 'Accepted · Verified Fixed', tone: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]' };
  }
  if (sub.issueStatus === 'DISPUTED') {
    return { label: 'Disputed · Returned to Desk', tone: 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]' };
  }
  if (sub.taskStatus === 'EXPIRED') {
    return { label: 'Window Closed', tone: 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]' };
  }
  return { label: 'Submitted · Awaiting Consensus', tone: 'bg-[#F0F5F8] text-[#718F9E] border-[#D4E2E9]' };
}

export default function CitizenAuditPage() {
  const geo = useOptionalGeoContext();
  const currentWard = geo?.currentWard ?? null;
  const corporations = geo?.corporations ?? [];
  const geoSelectionMode = geo?.selectionMode ?? 'MANUAL';

  const [activeTab, setActiveTab] = useState<'available' | 'submissions'>('available');
  const [discoveryMode, setDiscoveryMode] = useState<'NEARBY' | 'WARD'>('NEARBY');
  const [radiusM, setRadiusM] = useState<number>(2000);
  const [selectedCorpId, setSelectedCorpId] = useState<string>('ALL');

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<'idle' | 'detecting' | 'ready' | 'denied' | 'unavailable' | 'unsupported'>('idle');

  const [tasks, setTasks] = useState<NearbyAuditTask[]>([]);
  const [submissions, setSubmissions] = useState<AuditSubmissionItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eligibilityNotice, setEligibilityNotice] = useState<string | null>(null);
  const [locationRequired, setLocationRequired] = useState(false);

  // Selected task detail + verification workflow
  const [activeTask, setActiveTask] = useState<NearbyAuditTask | null>(null);
  const [showCaptureStep, setShowCaptureStep] = useState(false);
  const [capturedEvidence, setCapturedEvidence] = useState<CapturedEvidence | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [observedVerdict, setObservedVerdict] = useState<'INTACT' | 'DAMAGED' | 'CANNOT_SEE' | null>(null);
  const [verdictComment, setVerdictComment] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Sync discoveryMode with GeoContext manual selection if user explicitly switched wards
  useEffect(() => {
    if (geoSelectionMode === 'MANUAL' && currentWard && discoveryMode === 'WARD') {
      // Keep WARD mode active
    }
  }, [geoSelectionMode, currentWard, discoveryMode]);

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

  const requestUserLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus('unsupported');
      return;
    }
    setLocStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus('ready');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocStatus('denied');
        } else {
          setLocStatus('unavailable');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    // Browser geolocation is an external API; its async callback owns location state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    requestUserLocation();
  }, [requestUserLocation]);

  const fetchNearbyTasks = useCallback(async () => {
    setLoadingTasks(true);
    setLoadError(null);
    setEligibilityNotice(null);
    setLocationRequired(false);

    try {
      const params = new URLSearchParams();
      params.set('mode', discoveryMode);
      if (userLocation) {
        params.set('lat', String(userLocation.lat));
        params.set('lng', String(userLocation.lng));
      }

      if (discoveryMode === 'NEARBY') {
        params.set('radiusM', String(radiusM));
      } else {
        if (currentWard && currentWard.id !== 'zone-all' && currentWard.code !== 'ALL') {
          params.set('wardId', currentWard.id);
        }
        if (selectedCorpId !== 'ALL') {
          params.set('corporationId', selectedCorpId);
        }
      }

      const res = await fetch(`/api/audit/nearby?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'Failed to load repair verification tasks.');
      }

      const data = await res.json();
      setSubmissions(data.submissions || []);

      if (data.eligible === false) {
        setTasks([]);
        setEligibilityNotice(data.message || 'You are not currently eligible to submit blind verifications.');
      } else if (data.locationRequired) {
        setTasks([]);
        setLocationRequired(true);
      } else {
        setTasks(data.tasks || []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error loading verification tasks.');
    } finally {
      setLoadingTasks(false);
    }
  }, [userLocation, discoveryMode, radiusM, currentWard, selectedCorpId]);

  useEffect(() => {
    if (discoveryMode === 'NEARBY' && locStatus === 'detecting') return;
    // This effect synchronizes the current discovery mode with the network request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNearbyTasks();
  }, [discoveryMode, locStatus, fetchNearbyTasks]);

  const resetWorkflow = () => {
    setActiveTask(null);
    setShowCaptureStep(false);
    setCapturedEvidence(null);
    setPhotoBase64(null);
    setObservedVerdict(null);
    setVerdictComment('');
    setShowConfirm(false);
    setFeedback(null);
  };

  const handleCapture = (evidence: CapturedEvidence) => {
    setCapturedEvidence(evidence);
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setPhotoBase64(base64);
    };
    reader.readAsDataURL(evidence.blob);
  };

  const handleSubmitVote = async () => {
    if (!activeTask || !capturedEvidence || !observedVerdict || !photoBase64) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/audit/tasks/${activeTask.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observed: observedVerdict,
          deviceHeadingDeg: deviceHeading ?? undefined,
          note: verdictComment.trim() || undefined,
          evidence: {
            payload: capturedEvidence.payload,
            signature: capturedEvidence.signature,
            photoBase64,
            mimeType: capturedEvidence.blob.type || 'image/jpeg',
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Verification submission failed.');
      }

      setFeedback({
        success: true,
        message: 'Verification successfully submitted. Thank you for auditing this repair.',
      });

      setTasks((prev) => prev.filter((t) => t.id !== activeTask.id));
      notifyIssueUpdated(activeTask.issueId);
      await fetchNearbyTasks();

      setTimeout(() => {
        resetWorkflow();
        setActiveTab('submissions');
      }, 1400);
    } catch (err) {
      setFeedback({
        success: false,
        message: err instanceof Error ? err.message : 'Verification submission failed.',
      });
      setShowConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const captureDistanceToIssueM =
    activeTask && capturedEvidence && activeTask.hasValidCoordinates
      ? Math.round(
          haversineDistanceM(
            capturedEvidence.payload.lat,
            capturedEvidence.payload.lng,
            activeTask.lat,
            activeTask.lng
          )
        )
      : null;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 pt-6 sm:pt-8 space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/citizen/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#65736B] hover:text-[#293732] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Citizen Dashboard</span>
          </Link>
        </div>

        {/* Page Header & Tab Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DDDCD3] pb-5">
          <div>
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-1">
              INDEPENDENT FIELD VERIFICATION
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#293732] tracking-tight">
              Repair Verification
            </h1>
            <p className="text-sm text-[#65736B] mt-1">
              Discover municipal repairs awaiting independent citizen confirmation near your location.
            </p>
          </div>

          <div className="flex items-center p-1 bg-[#E5E9E3] rounded-xl border border-[#DDDCD3] self-start">
            <button
              type="button"
              onClick={() => setActiveTab('available')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'available'
                  ? 'bg-white text-[#293732] shadow-sm'
                  : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              Available Tasks ({tasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submissions')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'submissions'
                  ? 'bg-white text-[#293732] shadow-sm'
                  : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              My Submissions ({submissions.length})
            </button>
          </div>
        </div>

        {/* ── TAB 1: AVAILABLE TASKS ── */}
        {activeTab === 'available' && !activeTask && (
          <div className="space-y-5">
            {/* Location & Discovery Filter Bar */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_2px_10px_rgba(41,55,50,0.04)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveryMode('NEARBY');
                      if (!userLocation) requestUserLocation();
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      discoveryMode === 'NEARBY'
                        ? 'bg-[#355858] text-white border-[#355858]'
                        : 'bg-[#FAF9F5] text-[#293732] border-[#DDDCD3] hover:bg-[#E5E9E3]'
                    }`}
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                    <span>Nearby (My Location)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiscoveryMode('WARD')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      discoveryMode === 'WARD'
                        ? 'bg-[#355858] text-white border-[#355858]'
                        : 'bg-[#FAF9F5] text-[#293732] border-[#DDDCD3] hover:bg-[#E5E9E3]'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Explore by Ward</span>
                  </button>
                </div>

                {/* Location Status Indicator + Refresh */}
                <div className="flex items-center gap-2 text-xs">
                  {locStatus === 'detecting' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F0F5F8] text-[#527B7A] border border-[#D4E2E9]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Detecting location...</span>
                    </span>
                  ) : locStatus === 'ready' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
                      <LocateFixed className="w-3 h-3" />
                      <span>Location active</span>
                    </span>
                  ) : locStatus === 'denied' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FBF1EF] text-[#B76F60] border border-[#EAC8C1]">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Location permission denied</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]">
                      <MapPin className="w-3 h-3" />
                      <span>Location unavailable</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={requestUserLocation}
                    title="Refresh current location"
                    className="p-1.5 rounded-lg bg-[#E9ECE6] hover:bg-[#D4E3DF] text-[#355858] transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${locStatus === 'detecting' ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Radius Filter (NEARBY mode) OR Ward/Corporation Filter (WARD mode) */}
              {discoveryMode === 'NEARBY' ? (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E9ECE6]">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#65736B] mr-1">
                    Search Radius:
                  </span>
                  {RADIUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRadiusM(opt.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        radiusM === opt.value
                          ? 'bg-[#D4E3DF] text-[#293732] border-[#527B7A] font-semibold'
                          : 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E9ECE6] text-xs">
                  <div className="text-[#65736B]">
                    Active Ward:{' '}
                    <span className="font-semibold text-[#293732]">
                      {currentWard ? `${currentWard.wardLabel} · ${currentWard.name}` : 'All Wards'}
                    </span>
                    {currentWard?.corporationName && (
                      <span className="ml-1 text-[#527B7A]">({currentWard.corporationName})</span>
                    )}
                  </div>
                  {corporations.length > 0 && (
                    <select
                      value={selectedCorpId}
                      onChange={(e) => setSelectedCorpId(e.target.value)}
                      aria-label="Filter by corporation"
                      className="px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#DDDCD3] text-xs text-[#293732]"
                    >
                      <option value="ALL">Selected Ward Only</option>
                      {corporations.map((c) => (
                        <option key={c.id} value={c.id}>
                          All in {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Permission Denied Fallback Guidance */}
              {(locStatus === 'denied' || locStatus === 'unavailable' || locStatus === 'unsupported') &&
                discoveryMode === 'NEARBY' && (
                  <div className="p-3 rounded-xl bg-[#FDF7F0] border border-[#F2DFCA] text-xs text-[#8A5A2B] flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {locStatus === 'denied'
                        ? 'Location permission was denied. Switch to Explore by Ward to find repairs in your ward, or check My Submissions.'
                        : 'Unable to detect device GPS coordinates. You can still explore repairs by ward.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDiscoveryMode('WARD')}
                      className="px-3 py-1 rounded-lg bg-white border border-[#DDDCD3] text-[#293732] font-semibold hover:bg-[#FAF9F5] cursor-pointer"
                    >
                      Explore by Ward
                    </button>
                  </div>
                )}
            </div>

            {/* Task List States */}
            {loadingTasks ? (
              <div className="bg-white rounded-2xl p-12 border border-[#DDDCD3] flex flex-col items-center justify-center gap-3 text-sm text-[#65736B]">
                <Loader2 className="w-6 h-6 animate-spin text-[#527B7A]" />
                <span>Searching nearby repairs awaiting verification...</span>
              </div>
            ) : loadError ? (
              <div className="bg-[#FBF1EF] rounded-2xl p-6 border border-[#EAC8C1] text-sm text-[#B76F60] flex items-center justify-between gap-4">
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => void fetchNearbyTasks()}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#EAC8C1] text-xs font-semibold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : eligibilityNotice ? (
              <div className="bg-white rounded-2xl p-8 border border-[#DDDCD3] text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-[#527B7A] mx-auto" />
                <p className="text-sm font-semibold text-[#293732]">Verification Eligibility</p>
                <p className="text-xs text-[#65736B] max-w-md mx-auto">{eligibilityNotice}</p>
              </div>
            ) : discoveryMode === 'NEARBY' && locationRequired ? (
              <div className="bg-white rounded-2xl p-10 border border-[#DDDCD3] text-center space-y-3">
                <LocateFixed className="w-9 h-9 text-[#527B7A] mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#293732]">
                    Location required for Nearby verification
                  </p>
                  <p className="text-xs text-[#65736B] max-w-md mx-auto">
                    Enable device GPS to discover repairs within your chosen radius, or switch to Explore by Ward.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={requestUserLocation}
                    className="px-3.5 py-2 rounded-xl bg-[#355858] text-white text-xs font-semibold cursor-pointer"
                  >
                    Retry Location
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscoveryMode('WARD')}
                    className="px-3.5 py-2 rounded-xl bg-[#E9ECE6] text-[#293732] text-xs font-semibold cursor-pointer"
                  >
                    Explore by Ward
                  </button>
                </div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 border border-[#DDDCD3] text-center space-y-3">
                <Inbox className="w-9 h-9 text-[#929B92] mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#293732]">
                    {discoveryMode === 'NEARBY'
                      ? `No eligible repairs awaiting verification within ${radiusM < 1000 ? `${radiusM} m` : `${radiusM / 1000} km`}`
                      : 'No eligible repairs awaiting verification in this ward'}
                  </p>
                  <p className="text-xs text-[#65736B] max-w-md mx-auto">
                    Try expanding your search radius or selecting another ward in the Geographical Context selector.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {discoveryMode === 'NEARBY' && radiusM < 10000 && (
                    <button
                      type="button"
                      onClick={() => setRadiusM(10000)}
                      className="px-3.5 py-2 rounded-xl bg-[#355858] text-white text-xs font-semibold cursor-pointer"
                    >
                      Expand to 10 km
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDiscoveryMode(discoveryMode === 'NEARBY' ? 'WARD' : 'NEARBY')}
                    className="px-3.5 py-2 rounded-xl bg-[#E9ECE6] text-[#293732] text-xs font-semibold cursor-pointer"
                  >
                    {discoveryMode === 'NEARBY' ? 'Explore by Ward' : 'Use My Location'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tasks.map((task) => {
                  const distLabel = formatDistance(task.distanceM);
                  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`;

                  return (
                    <div
                      key={task.id}
                      className="bg-white rounded-2xl border border-[#DDDCD3] shadow-[0_2px_10px_rgba(41,55,50,0.04)] overflow-hidden flex flex-col"
                    >
                      <div className="flex gap-4 p-4">
                        <div className="w-14 h-14 rounded-xl border border-[#DDDCD3] bg-[#E9ECE6] shrink-0 flex items-center justify-center">
                          <ShieldCheck className="w-6 h-6 text-[#527B7A]" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E5E9E3] text-[#355858]">
                              {task.category.replace(/_/g, ' ')}
                            </span>
                            {distLabel && (
                              <span className="text-[11px] font-mono font-semibold text-[#527B7A]">
                                {distLabel}
                              </span>
                            )}
                          </div>

                          <h3 className="font-display font-semibold text-base text-[#293732] truncate">
                            {task.title}
                          </h3>

                          <div className="text-xs text-[#65736B] truncate">
                            {task.address}
                            {task.ward
                              ? ` · Ward ${task.ward.wardNumber ?? task.ward.code} (${task.ward.name})`
                              : ''}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#65736B] pt-0.5">
                            <span className="inline-flex items-center gap-1 text-[#527B7A] font-medium">
                              <Clock className="w-3 h-3" />
                              Independent Site Inspection
                            </span>
                            <span>· Due {formatDateIST(task.dueAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 bg-[#FAF9F5] border-t border-[#E9ECE6] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-[#DDDCD3] text-xs font-medium text-[#527B7A] hover:bg-[#E5E9E3]/50 transition-colors"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Directions</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            resetWorkflow();
                            setActiveTask(task);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Visit and Verify
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TASK DETAIL & ON-SITE VERIFICATION WORKFLOW ── */}
        {activeTab === 'available' && activeTask && (
          <div className="bg-white rounded-2xl border border-[#DDDCD3] shadow-sm p-5 sm:p-7 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#E9ECE6] pb-4">
              <div>
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#527B7A]">
                  {activeTask.category.replace(/_/g, ' ')} · AWAITING VERIFICATION
                </div>
                <h2 className="font-display font-bold text-xl sm:text-2xl text-[#293732] mt-0.5">
                  {activeTask.title}
                </h2>
                <p className="text-xs text-[#65736B] mt-1">
                  {activeTask.address}
                  {activeTask.ward
                    ? ` · Ward ${activeTask.ward.wardNumber ?? activeTask.ward.code} (${activeTask.ward.name}${activeTask.ward.corporationName ? `, ${activeTask.ward.corporationName}` : ''})`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={resetWorkflow}
                className="p-2 rounded-xl bg-[#F3F2EB] hover:bg-[#E5E9E3] text-[#65736B] cursor-pointer"
                aria-label="Close task"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Blind Inspection Briefing (prior photos, contractor & claim details hidden before voting) */}
            <div className="p-4 rounded-xl bg-[#F0F5F8] border border-[#D4E2E9] space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#293732]">
                <ShieldCheck className="w-4 h-4 text-[#527B7A]" />
                <span>Independent Site Inspection</span>
              </div>
              <p className="text-xs text-[#65736B]">
                Record what you observe at the site using live GPS-signed camera evidence. Prior photographs,
                agency identities, and repair claim details are intentionally hidden to preserve blind audit integrity.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#FAF9F5] p-3.5 rounded-xl border border-[#E9ECE6]">
              <div>
                <div className="text-[#65736B]">Inspection Type</div>
                <div className="font-mono font-semibold text-[#293732] mt-0.5">
                  {activeTask.category.replace(/_/g, ' ')}
                </div>
              </div>
              <div>
                <div className="text-[#65736B]">Distance from You</div>
                <div className="font-mono font-semibold text-[#293732] mt-0.5">
                  {formatDistance(activeTask.distanceM) || 'Distance unavailable'}
                </div>
              </div>
              <div>
                <div className="text-[#65736B]">Verification Due</div>
                <div className="font-mono font-semibold text-[#293732] mt-0.5">
                  {formatDateIST(activeTask.dueAt)}
                </div>
              </div>
            </div>

            {!showCaptureStep ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activeTask.lat},${activeTask.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs font-semibold text-[#293732] hover:bg-[#E5E9E3]"
                >
                  <Navigation className="w-3.5 h-3.5 text-[#527B7A]" />
                  <span>Navigate to Location</span>
                </a>

                <button
                  type="button"
                  onClick={() => setShowCaptureStep(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Verify Repair at Location</span>
                </button>
              </div>
            ) : (
              <div className="space-y-5 pt-2 border-t border-[#E9ECE6]">
                <div className="text-xs text-[#65736B]">
                  Capture a live GPS-signed photograph at the repair site and record your inspection verdict.
                </div>

                {!capturedEvidence ? (
                  <CaptureCamera
                    role="AUDIT"
                    overrideNonce={activeTask.challengeNonce}
                    onCapture={handleCapture}
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#537C60]" />
                        <span className="font-semibold text-[#293732]">
                          Signed GPS evidence captured
                        </span>
                        {captureDistanceToIssueM != null && (
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[11px] border ${
                              isWithinEvidenceDistance(captureDistanceToIssueM)
                                ? 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]'
                                : 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]'
                            }`}
                          >
                            {isWithinEvidenceDistance(captureDistanceToIssueM)
                              ? `Within ${MAX_EVIDENCE_DISTANCE_METERS} m audit radius (${captureDistanceToIssueM} m away)`
                              : `${captureDistanceToIssueM} m away (must be within ${MAX_EVIDENCE_DISTANCE_METERS} m)`}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]">
                          ± {capturedEvidence.payload.accuracy.toFixed(1)} m GPS
                        </span>
                        <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]">
                          {deviceHeading !== null ? `Compass: ${deviceHeading}°` : 'Compass heading unavailable'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCapturedEvidence(null);
                          setPhotoBase64(null);
                          setShowConfirm(false);
                        }}
                        className="text-xs font-semibold text-[#527B7A] underline cursor-pointer"
                      >
                        Retake Photo
                      </button>
                    </div>

                    {/* Verdict Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[#293732] block">
                        Inspection Verdict
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          {
                            id: 'INTACT' as const,
                            label: 'Repair completed correctly',
                            desc: 'Surface or infrastructure is properly restored.',
                          },
                          {
                            id: 'DAMAGED' as const,
                            label: 'Repair not completed / damaged',
                            desc: 'Issue remains unfixed, partial, or has returned.',
                          },
                          {
                            id: 'CANNOT_SEE' as const,
                            label: 'Cannot verify clearly',
                            desc: 'Site obstructed or visibility insufficient.',
                          },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setObservedVerdict(opt.id)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              observedVerdict === opt.id
                                ? 'bg-[#E5E9E3] border-[#355858] text-[#293732]'
                                : 'bg-white border-[#DDDCD3] hover:bg-[#FAF9F5]'
                            }`}
                          >
                            <div className="text-xs font-semibold flex items-center justify-between">
                              <span>{opt.label}</span>
                              {observedVerdict === opt.id && (
                                <Check className="w-3.5 h-3.5 text-[#355858]" />
                              )}
                            </div>
                            <div className="text-[11px] text-[#65736B] mt-1">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#293732] block">
                        Field Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={verdictComment}
                        onChange={(e) => setVerdictComment(e.target.value)}
                        placeholder="Add observations about repair quality or site conditions..."
                        className="w-full rounded-xl border border-[#DDDCD3] bg-[#FAF9F5] px-3 py-2 text-xs text-[#293732]"
                      />
                    </div>

                    {feedback && (
                      <div
                        className={`p-3 rounded-xl text-xs border ${
                          feedback.success
                            ? 'bg-[#EFF6F1] border-[#CFE4D4] text-[#537C60]'
                            : 'bg-[#FBF1EF] border-[#EAC8C1] text-[#B76F60]'
                        }`}
                      >
                        {feedback.message}
                      </div>
                    )}

                    {!isValidGpsAccuracy(capturedEvidence.payload.accuracy) && (
                      <div className="p-3 rounded-xl text-xs border bg-[#FBF1EF] border-[#EAC8C1] text-[#B76F60] flex flex-wrap items-center justify-between gap-2">
                        <span>
                          GPS accuracy (± {Math.round(capturedEvidence.payload.accuracy)} m) exceeds the {MAX_EVIDENCE_DISTANCE_METERS} m limit. Retake your photo in an open area.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedEvidence(null);
                            setPhotoBase64(null);
                            setShowConfirm(false);
                          }}
                          className="px-3 py-1 rounded-lg bg-white border border-[#EAC8C1] text-xs font-semibold text-[#293732] cursor-pointer"
                        >
                          Retry Location
                        </button>
                      </div>
                    )}

                    {isValidGpsAccuracy(capturedEvidence.payload.accuracy) &&
                      getGpsAccuracyWarning(capturedEvidence.payload.accuracy) && (
                        <div className="p-3 rounded-xl text-xs border bg-[#FDF7F0] border-[#F2DFCA] text-[#8A5A2B]">
                          {getGpsAccuracyWarning(capturedEvidence.payload.accuracy)}
                        </div>
                      )}

                    {captureDistanceToIssueM !== null && !isWithinEvidenceDistance(captureDistanceToIssueM) && (
                      <div className="p-3 rounded-xl text-xs border bg-[#FBF1EF] border-[#EAC8C1] text-[#B76F60] flex flex-wrap items-center justify-between gap-2">
                        <span>
                          You are {captureDistanceToIssueM} m from the issue coordinates. Move within {MAX_EVIDENCE_DISTANCE_METERS} m and retake your photo to submit verification evidence.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedEvidence(null);
                            setPhotoBase64(null);
                            setShowConfirm(false);
                          }}
                          className="px-3 py-1 rounded-lg bg-white border border-[#EAC8C1] text-xs font-semibold text-[#293732] cursor-pointer"
                        >
                          Retry Location
                        </button>
                      </div>
                    )}

                    {captureDistanceToIssueM !== null &&
                      isWithinEvidenceDistance(captureDistanceToIssueM) &&
                      getEvidenceDistanceWarning(captureDistanceToIssueM) && (
                        <div className="p-3 rounded-xl text-xs border bg-[#FDF7F0] border-[#F2DFCA] text-[#8A5A2B]">
                          {getEvidenceDistanceWarning(captureDistanceToIssueM)}
                        </div>
                      )}

                    {!showConfirm ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={
                            !observedVerdict ||
                            !isValidGpsAccuracy(capturedEvidence.payload.accuracy) ||
                            (captureDistanceToIssueM !== null && !isWithinEvidenceDistance(captureDistanceToIssueM))
                          }
                          onClick={() => setShowConfirm(true)}
                          className="px-5 py-2.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          Review &amp; Confirm Verification
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#527B7A] space-y-3">
                        <div className="text-xs font-semibold text-[#293732]">
                          Confirm Verification Submission
                        </div>
                        <p className="text-xs text-[#65736B]">
                          Your signed verdict ({observedVerdict?.replace(/_/g, ' ')}) will be recorded in the
                          municipal audit ledger. Consensus rules determine final issue resolution.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowConfirm(false)}
                            disabled={isSubmitting}
                            className="px-3.5 py-2 rounded-xl bg-white border border-[#DDDCD3] text-xs font-semibold text-[#293732] cursor-pointer"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={handleSubmitVote}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>Submit Verification</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: MY SUBMISSIONS ── */}
        {activeTab === 'submissions' && (
          <div className="space-y-4">
            {submissions.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 border border-[#DDDCD3] text-center space-y-2">
                <Inbox className="w-8 h-8 text-[#929B92] mx-auto" />
                <p className="text-sm font-semibold text-[#293732]">No verification submissions yet</p>
                <p className="text-xs text-[#65736B]">
                  When you inspect a nearby municipal repair and submit evidence, your audit history will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {submissions.map((sub) => {
                  const statusBadge = formatSubmissionStatus(sub);
                  return (
                    <Link
                      key={sub.id}
                      href={`/issue/${sub.issueId}`}
                      className="bg-white rounded-2xl p-4 border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.04)] hover:border-[#527B7A] transition-colors flex gap-4"
                    >
                      <div className="w-20 h-20 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#E9ECE6] shrink-0 flex items-center justify-center">
                        {sub.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sub.image} alt={sub.title} className="w-full h-full object-cover" />
                        ) : (
                          <ShieldCheck className="w-6 h-6 text-[#929B92]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge.tone}`}>
                            {statusBadge.label}
                          </span>
                          <span className="text-[10px] font-mono text-[#65736B]">
                            {formatDateTimeIST(sub.submittedAt)}
                          </span>
                        </div>
                        <h3 className="font-display font-semibold text-sm text-[#293732] truncate">
                          {sub.title}
                        </h3>
                        <div className="text-xs text-[#65736B] truncate">{sub.location}</div>
                        <div className="text-[11px] font-mono text-[#355858]">
                          Verdict: {(sub.observed ?? 'SUBMITTED').replace(/_/g, ' ')}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

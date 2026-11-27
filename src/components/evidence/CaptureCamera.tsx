'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Camera,
  MapPin,
  Crosshair,
  Copy,
  Check,
  Signal,
  Zap,
  Image as ImageIcon,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  EvidenceRole,
  EvidencePayload,
  computePhotoHash,
  signEvidencePayload,
  haversineDistanceM,
} from '@/lib/evidence/sign';
import { getOrCreateDeviceKey } from '@/lib/evidence/deviceKey';
import { isDefaultedCoordinate, isInServiceArea } from '@/lib/evidence/coords';
import { SERVICE_AREA_MESSAGE } from '@/lib/validation/limits';
import {
  MAX_GPS_ACCURACY_METERS,
  MAX_EVIDENCE_DISTANCE_METERS,
  getGpsAccuracyWarning,
  getEvidenceDistanceWarning,
  isValidGpsAccuracy,
  isWithinEvidenceDistance,
} from '@/lib/evidence/locationLimits';

const ReportPickerMap = dynamic(() => import('@/components/citizen/ReportPickerMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#E9ECE6] animate-pulse flex items-center justify-center text-[11px] font-mono text-[#65736B]">
      Loading map...
    </div>
  ),
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PIN_RADIUS_METERS = MAX_EVIDENCE_DISTANCE_METERS;

export interface CapturedEvidence {
  blob: Blob;
  previewUrl: string;
  payload: EvidencePayload;
  signature: string;
  captureCoords?: { lat: number; lng: number };
}

export interface CaptureCameraProps {
  role: EvidenceRole;
  onCapture: (evidence: CapturedEvidence) => void;
  onCancel?: () => void;
  targetCoords?: { lat: number; lng: number };
  overrideNonce?: string;
}

type StepStatus = 'pending' | 'processing' | 'success' | 'failed';
type NonceStatus = 'pending' | 'processing' | 'verified' | 'offline_signed' | 'failed';

export function CaptureCamera({
  role,
  onCapture,
  onCancel,
  targetCoords,
  overrideNonce,
}: CaptureCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const hasManualPinAdjustRef = useRef<boolean>(false);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [zoomMode, setZoomMode] = useState<'1x' | '2x'>('1x');

  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    targetCoords ? { lat: targetCoords.lat, lng: targetCoords.lng, accuracy: 10 } : null
  );
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(!targetCoords);

  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number } | null>(
    targetCoords ? { lat: targetCoords.lat, lng: targetCoords.lng } : null
  );
  const [pinDistanceM, setPinDistanceM] = useState<number>(0);
  const [pinAdjustError, setPinAdjustError] = useState<string | null>(null);
  const [isAdjustingPin, setIsAdjustingPin] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const [securityState, setSecurityState] = useState<{
    image: StepStatus;
    hash: StepStatus;
    signature: StepStatus;
    nonce: NonceStatus;
  }>({
    image: 'pending',
    hash: 'pending',
    signature: 'pending',
    nonce: 'pending',
  });

  const revokeCurrentPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchSupported(false);
    setFlashOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraActive(false);
        setCameraError('Live camera is unavailable in this browser. Upload an image from your device instead.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      setCameraActive(true);
      setCameraError(null);
    } catch (err) {
      setCameraActive(false);
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setCameraError(
        isDenied
          ? 'Camera permission was denied. Enable camera access or upload an authentic photo from your gallery.'
          : 'Camera could not be started on this device. You can upload an authentic photo from your gallery.'
      );
    }
  }, []);

  const requestGps = useCallback(() => {
    if (targetCoords) {
      setGpsFix({ lat: targetCoords.lat, lng: targetCoords.lng, accuracy: 10 });
      setPinCoords({ lat: targetCoords.lat, lng: targetCoords.lng });
      setGpsError(null);
      setGpsLoading(false);
      return;
    }
    if (!navigator.geolocation) {
      setGpsLoading(false);
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    const handlePos = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      setGpsFix({ lat, lng, accuracy });
      setGpsError(null);
      setGpsLoading(false);
      if (!hasManualPinAdjustRef.current) {
        setPinCoords({ lat, lng });
        setPinDistanceM(0);
      }
    };

    const handleErr = (err: GeolocationPositionError) => {
      setGpsLoading(false);
      if (err.code === err.PERMISSION_DENIED) {
        setGpsError('Location permission denied. Enable GPS access so we can verify your on-site coordinates.');
      } else if (err.code === err.TIMEOUT) {
        setGpsError('GPS signal timed out. Move to an open area and retry location acquisition.');
      } else {
        setGpsError('Unable to acquire device GPS location. Check location services and retry.');
      }
    };

    navigator.geolocation.getCurrentPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  }, [targetCoords]);

  useEffect(() => {
    let isMounted = true;
    void startCamera();

    let watchId: number | null = null;
    if (targetCoords) {
      setGpsFix({ lat: targetCoords.lat, lng: targetCoords.lng, accuracy: 10 });
      setPinCoords({ lat: targetCoords.lat, lng: targetCoords.lng });
      setGpsLoading(false);
    } else if (navigator.geolocation) {
      requestGps();
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!isMounted) return;
          setGpsFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          setGpsError(null);
          setGpsLoading(false);
          if (!hasManualPinAdjustRef.current) {
            setPinCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setPinDistanceM(0);
          }
        },
        () => {
          // Initial getCurrentPosition surfaces explicit error state
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      setGpsLoading(false);
      setGpsError('Geolocation is not supported by this browser.');
    }

    return () => {
      isMounted = false;
      stopCamera();
      revokeCurrentPreview();
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [startCamera, stopCamera, revokeCurrentPreview, requestGps, targetCoords]);

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const nextFlash = !flashOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextFlash } as MediaTrackConstraintSet],
      });
      setFlashOn(nextFlash);
    } catch {
      setTorchSupported(false);
      setFlashOn(false);
    }
  };

  const handleMapPick = (lat: number, lng: number) => {
    setPinAdjustError(null);
    if (!gpsFix) return;
    const dist = haversineDistanceM(gpsFix.lat, gpsFix.lng, lat, lng);
    if (dist > PIN_RADIUS_METERS) {
      setPinAdjustError(
        `Selected pin is ${Math.round(dist)}m away. Pin adjustment is limited to ${PIN_RADIUS_METERS}m from your GPS fix.`
      );
      return;
    }
    hasManualPinAdjustRef.current = true;
    setPinCoords({ lat, lng });
    setPinDistanceM(Math.round(dist));
  };

  const copyCoordinates = () => {
    if (!pinCoords) return;
    const coordsStr = `${pinCoords.lat.toFixed(6)}° N, ${pinCoords.lng.toFixed(6)}° E`;
    navigator.clipboard.writeText(coordsStr);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const signAndEmitBlob = async (blob: Blob) => {
    setEvidenceError(null);

    if (!pinCoords || !gpsFix) {
      setSecurityState({ image: 'failed', hash: 'pending', signature: 'pending', nonce: 'pending' });
      throw new Error('A valid GPS fix is required before signing evidence.');
    }

    if (isDefaultedCoordinate(pinCoords.lat, pinCoords.lng)) {
      setSecurityState({ image: 'failed', hash: 'pending', signature: 'pending', nonce: 'pending' });
      throw new Error('Live GPS coordinates are required.');
    }

    if (!isInServiceArea(pinCoords.lat, pinCoords.lng)) {
      setSecurityState({ image: 'failed', hash: 'pending', signature: 'pending', nonce: 'pending' });
      throw new Error(SERVICE_AREA_MESSAGE);
    }

    if (!isValidGpsAccuracy(gpsFix.accuracy)) {
      setSecurityState({ image: 'failed', hash: 'pending', signature: 'pending', nonce: 'pending' });
      throw new Error(
        `GPS accuracy (± ${Math.round(gpsFix.accuracy)}m) exceeds the ${MAX_GPS_ACCURACY_METERS}m limit. Please move to an open area and retry location.`
      );
    }

    if (targetCoords) {
      const targetDist = haversineDistanceM(
        gpsFix.lat,
        gpsFix.lng,
        targetCoords.lat,
        targetCoords.lng
      );
      if (!isWithinEvidenceDistance(targetDist)) {
        setSecurityState({ image: 'failed', hash: 'pending', signature: 'pending', nonce: 'pending' });
        throw new Error(
          `You are ${Math.round(targetDist)}m from the issue location. Evidence must be captured within ${MAX_EVIDENCE_DISTANCE_METERS}m.`
        );
      }
    }

    setSecurityState({
      image: 'success',
      hash: 'processing',
      signature: 'pending',
      nonce: 'processing',
    });

    const arrayBuffer = await blob.arrayBuffer();
    const photoHash = await computePhotoHash(arrayBuffer);

    setSecurityState((prev) => ({
      ...prev,
      hash: 'success',
      signature: 'processing',
    }));

    let nonce = overrideNonce || 'offline';
    let nonceState: NonceStatus = overrideNonce ? 'verified' : 'offline_signed';

    if (!overrideNonce) {
      try {
        const nonceRes = await fetch('/api/evidence/nonce', { method: 'POST' });
        if (nonceRes.ok) {
          const nonceData = await nonceRes.json();
          if (nonceData.nonce) {
            nonce = nonceData.nonce;
            nonceState = 'verified';
          }
        }
      } catch {
        nonce = 'offline';
        nonceState = 'offline_signed';
      }
    }

    const payload: EvidencePayload = {
      accuracy: Math.round(gpsFix.accuracy * 10) / 10,
      capturedAt: new Date().toISOString(),
      lat: pinCoords.lat,
      lng: pinCoords.lng,
      nonce,
      photoHash,
      role,
    };

    const { keyPair } = await getOrCreateDeviceKey();
    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    setSecurityState({
      image: 'success',
      hash: 'success',
      signature: 'success',
      nonce: nonceState,
    });

    stopCamera();
    revokeCurrentPreview();
    const previewUrl = URL.createObjectURL(blob);
    previewUrlRef.current = previewUrl;
    setCapturedPreview(previewUrl);

    onCapture({
      blob,
      previewUrl,
      payload,
      signature,
      captureCoords: { lat: gpsFix.lat, lng: gpsFix.lng },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isProcessing) return;

    setEvidenceError(null);
    if (!file.type.startsWith('image/')) {
      setEvidenceError('Unsupported file type. Please select a valid JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size === 0) {
      setEvidenceError('Selected image file is empty. Please choose another photograph.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setEvidenceError('Image exceeds the 10 MB size limit. Please choose a smaller photograph.');
      return;
    }

    setIsProcessing(true);
    try {
      await signAndEmitBlob(file);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Could not process uploaded image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (isProcessing) return;
    setEvidenceError(null);

    if (!videoRef.current || !cameraActive) {
      setEvidenceError('Live camera is not active. Enable camera permissions or upload a photo from your device.');
      return;
    }

    setIsProcessing(true);
    try {
      const video = videoRef.current;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize camera canvas');

      if (zoomMode === '2x') {
        const cropW = vw * 0.5;
        const cropH = vh * 0.5;
        ctx.drawImage(video, vw * 0.25, vh * 0.25, cropW, cropH, 0, 0, vw, vh);
      } else {
        ctx.drawImage(video, 0, 0, vw, vh);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas image encoding failed'))),
          'image/jpeg',
          0.88
        );
      });

      await signAndEmitBlob(blob);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Photo capture failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    revokeCurrentPreview();
    setCapturedPreview(null);
    setEvidenceError(null);
    setSecurityState({ image: 'pending', hash: 'pending', signature: 'pending', nonce: 'pending' });
    void startCamera();
  };

  const inServiceArea = pinCoords ? isInServiceArea(pinCoords.lat, pinCoords.lng) : false;

  const renderStatusPill = (status: StepStatus | NonceStatus) => {
    switch (status) {
      case 'success':
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#537C60]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{status === 'verified' ? 'Nonce verified' : 'Done'}</span>
          </span>
        );
      case 'offline_signed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B68B63]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Signed locally (offline)</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#527B7A]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Processing</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B76F60]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </span>
        );
      default:
        return <span className="text-[11px] text-[#929B92]">Pending</span>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Live Camera / Preview Viewport */}
      <div className="lg:col-span-7 space-y-3">
        <div className="bg-[#293732] rounded-[26px] overflow-hidden border border-[#DDDCD3] shadow-[0_12px_32px_-6px_rgba(41,55,50,0.15)] relative aspect-[4/3] sm:aspect-[16/11] flex items-center justify-center select-none">
          {capturedPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={capturedPreview}
              alt="Captured Evidence Preview"
              className="w-full h-full object-cover"
            />
          ) : cameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform duration-200 ${
                zoomMode === '2x' ? 'scale-[2]' : 'scale-100'
              }`}
            />
          ) : (
            <div className="p-6 text-center text-white/85 max-w-sm space-y-3">
              <Camera className="w-10 h-10 mx-auto text-[#A8C6C3]" />
              <div className="text-sm font-semibold">Camera unavailable</div>
              <p className="text-xs text-white/75 leading-relaxed">
                {cameraError || 'Allow camera access or upload an authentic photograph from your device.'}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#293732] text-xs font-semibold shadow-sm hover:bg-[#FAF9F5] cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-[#527B7A]" />
                <span>Upload Photo</span>
              </button>
            </div>
          )}

          {/* Top-Left Status Pill */}
          <div className="absolute top-4 left-4 z-20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-[#DDDCD3] shadow-sm text-xs font-semibold text-[#293732]">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  capturedPreview
                    ? 'bg-[#537C60]'
                    : cameraActive
                      ? 'bg-[#537C60] animate-pulse'
                      : 'bg-[#B68B63]'
                }`}
              />
              <span>
                {capturedPreview ? 'Evidence Attached' : cameraActive ? 'Live Camera' : 'Upload Mode'}
              </span>
            </div>
          </div>

          {/* Right-Side Camera Controls (when live & not yet captured) */}
          {cameraActive && !capturedPreview && (
            <div className="absolute top-1/2 -translate-y-1/2 right-4 z-20">
              <div className="bg-white/85 backdrop-blur-md border border-[#DDDCD3] p-1.5 rounded-2xl flex flex-col items-center gap-2 shadow-sm">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  title="Restart Camera"
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[#293732] hover:bg-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleFlash}
                    title="Toggle Flash"
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      flashOn ? 'bg-amber-100 text-amber-700' : 'text-[#293732] hover:bg-white'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                  </button>
                )}

                <div className="w-5 border-t border-[#DDDCD3]" />

                <button
                  type="button"
                  onClick={() => setZoomMode('1x')}
                  className={`w-8 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                    zoomMode === '1x'
                      ? 'bg-[#355858] text-white shadow-sm'
                      : 'text-[#65736B] hover:text-[#293732]'
                  }`}
                >
                  1x
                </button>

                <button
                  type="button"
                  onClick={() => setZoomMode('2x')}
                  className={`w-8 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                    zoomMode === '2x'
                      ? 'bg-[#355858] text-white shadow-sm'
                      : 'text-[#65736B] hover:text-[#293732]'
                  }`}
                >
                  2x
                </button>
              </div>
            </div>
          )}

          {/* Bottom Controls Dock */}
          <div className="absolute bottom-5 inset-x-6 z-20 flex items-center justify-between pointer-events-none">
            <div className="pointer-events-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="camera-file-upload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                title="Upload Photo"
                className="px-3.5 h-11 rounded-2xl bg-white/90 backdrop-blur-md border border-[#DDDCD3] flex items-center gap-2 text-xs font-semibold text-[#293732] hover:bg-white transition-all cursor-pointer shadow-sm disabled:opacity-60"
              >
                <ImageIcon className="w-4 h-4 text-[#527B7A]" />
                <span>{capturedPreview ? 'Replace' : 'Gallery'}</span>
              </button>
            </div>

            {!capturedPreview ? (
              <div className="pointer-events-auto">
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={isProcessing || !cameraActive}
                  title={cameraActive ? 'Take Photo' : 'Camera unavailable'}
                  className="w-16 h-16 rounded-full bg-[#355858] border-4 border-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] flex items-center justify-center text-white cursor-pointer active:scale-95 transition-transform hover:bg-[#3E6966] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-7 h-7" />}
                </button>
              </div>
            ) : (
              <div className="pointer-events-auto">
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isProcessing}
                  className="px-4 h-11 rounded-2xl bg-white/90 backdrop-blur-md border border-[#DDDCD3] flex items-center gap-2 text-xs font-semibold text-[#293732] hover:bg-white transition-all cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-4 h-4 text-[#527B7A]" />
                  <span>Retake Photo</span>
                </button>
              </div>
            )}

            {onCancel ? (
              <div className="pointer-events-auto">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3.5 h-11 rounded-2xl bg-white/85 backdrop-blur-md border border-[#DDDCD3] text-xs font-semibold text-[#65736B] hover:text-[#293732] hover:bg-white transition-all cursor-pointer shadow-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="w-11" />
            )}
          </div>
        </div>

        {evidenceError && (
          <div
            data-testid="evidence-error-banner"
            className="p-3.5 rounded-xl bg-[#FBF1EF] border border-[#EAC8C1] text-xs text-[#B76F60] flex items-center gap-2 font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{evidenceError}</span>
          </div>
        )}
      </div>

      {/* Right Column: GPS, Location Picker & Evidence Security */}
      <div className="lg:col-span-5 space-y-4">
        {/* Card 1: Location Verification */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#527B7A]" />
              <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
                Location Verification
              </h4>
            </div>
            {gpsLoading ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F3F2EB] text-[#65736B] border border-[#DDDCD3]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Acquiring GPS</span>
              </span>
            ) : gpsError || !pinCoords ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FBF1EF] text-[#B76F60] border border-[#EAC8C1]">
                <AlertCircle className="w-3 h-3" />
                <span>GPS Required</span>
              </span>
            ) : inServiceArea ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
                <Check className="w-3 h-3 stroke-[3]" />
                <span>Within City Limits</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FBF1EF] text-[#B76F60] border border-[#EAC8C1]">
                <AlertCircle className="w-3 h-3" />
                <span>Outside Service Area</span>
              </span>
            )}
          </div>

          {gpsError ? (
            <div className="p-3 bg-[#FBF1EF] rounded-xl border border-[#EAC8C1] text-xs text-[#B76F60] space-y-2">
              <p>{gpsError}</p>
              <button
                type="button"
                onClick={requestGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-[#293732] font-semibold text-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Retry GPS</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-[#F6F7F4] rounded-xl border border-[#E5E9E3] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#929B92]">
                  {pinDistanceM > 0 ? `Selected Issue Pin (${pinDistanceM}m from GPS)` : 'Device GPS Location'}
                </div>
                <div className="font-mono text-xs sm:text-sm font-semibold text-[#293732] pt-0.5">
                  {pinCoords
                    ? `${pinCoords.lat.toFixed(5)}° N, ${pinCoords.lng.toFixed(5)}° E`
                    : 'Waiting for GPS fix...'}
                </div>
              </div>

              {pinCoords && (
                <button
                  type="button"
                  onClick={copyCoordinates}
                  className="p-1.5 text-[#65736B] hover:text-[#293732] hover:bg-white rounded-lg transition-colors cursor-pointer"
                  title="Copy Coordinates"
                >
                  {copiedCoords ? <Check className="w-4 h-4 text-[#537C60]" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Card 2: GPS Accuracy & Interactive Issue Pin Map */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-[#527B7A]" />
              <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
                GPS Accuracy & Pin
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#EAF2F0] text-[#527B7A] border border-[#D0E2DF]">
                {gpsFix ? `± ${gpsFix.accuracy.toFixed(1)} m` : 'No fix'}
              </span>
              <Signal className={`w-4 h-4 ${gpsFix ? 'text-[#537C60]' : 'text-[#929B92]'}`} />
            </div>
          </div>

          {gpsFix && !isValidGpsAccuracy(gpsFix.accuracy) && (
            <div className="p-3 bg-[#FBF1EF] rounded-xl border border-[#EAC8C1] text-xs text-[#B76F60] space-y-2">
              <p>
                GPS accuracy (± {Math.round(gpsFix.accuracy)} m) exceeds the {MAX_GPS_ACCURACY_METERS} m maximum. Move to an open area and retry location before capturing evidence.
              </p>
              <button
                type="button"
                onClick={requestGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-[#293732] font-semibold text-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Retry Location</span>
              </button>
            </div>
          )}

          {gpsFix && isValidGpsAccuracy(gpsFix.accuracy) && getGpsAccuracyWarning(gpsFix.accuracy) && (
            <div className="p-2.5 bg-[#FDF7F0] rounded-xl border border-[#F2DFCA] text-[11px] text-[#8A5A2B]">
              {getGpsAccuracyWarning(gpsFix.accuracy)}
            </div>
          )}

          {gpsFix && targetCoords && (() => {
            const targetDist = Math.round(
              haversineDistanceM(gpsFix.lat, gpsFix.lng, targetCoords.lat, targetCoords.lng)
            );
            if (!isWithinEvidenceDistance(targetDist)) {
              return (
                <div className="p-3 bg-[#FBF1EF] rounded-xl border border-[#EAC8C1] text-xs text-[#B76F60] space-y-2">
                  <p>
                    You are {targetDist} m from the reported issue location (maximum {MAX_EVIDENCE_DISTANCE_METERS} m). Move closer and retry location.
                  </p>
                  <button
                    type="button"
                    onClick={requestGps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DDDCD3] text-[#293732] font-semibold text-xs cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#527B7A]" />
                    <span>Retry Location</span>
                  </button>
                </div>
              );
            }
            const distWarn = getEvidenceDistanceWarning(targetDist);
            return distWarn ? (
              <div className="p-2.5 bg-[#FDF7F0] rounded-xl border border-[#F2DFCA] text-[11px] text-[#8A5A2B]">
                {distWarn}
              </div>
            ) : null;
          })()}

          {gpsFix && !targetCoords && getEvidenceDistanceWarning(pinDistanceM) && (
            <div className="p-2.5 bg-[#FDF7F0] rounded-xl border border-[#F2DFCA] text-[11px] text-[#8A5A2B]">
              {getEvidenceDistanceWarning(pinDistanceM)}
            </div>
          )}

          <div className="relative h-36 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#F3F2EB]">
            {pinCoords ? (
              <ReportPickerMap
                latitude={pinCoords.lat}
                longitude={pinCoords.lng}
                onChange={(lat, lng) => {
                  if (isAdjustingPin && !targetCoords) {
                    handleMapPick(lat, lng);
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#65736B] px-4 text-center">
                Map preview appears once GPS location is acquired.
              </div>
            )}

            {pinCoords && !targetCoords && (
              <div className="absolute bottom-2.5 right-2.5 z-[500] flex items-center gap-1.5">
                {pinDistanceM > 0 && gpsFix && (
                  <button
                    type="button"
                    onClick={() => {
                      hasManualPinAdjustRef.current = false;
                      setPinCoords({ lat: gpsFix.lat, lng: gpsFix.lng });
                      setPinDistanceM(0);
                      setPinAdjustError(null);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white/95 border border-[#DDDCD3] shadow-sm text-[11px] font-semibold text-[#527B7A] hover:bg-white cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsAdjustingPin(!isAdjustingPin);
                    setPinAdjustError(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl border shadow-sm text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                    isAdjustingPin
                      ? 'bg-[#355858] text-white border-[#355858]'
                      : 'bg-white/95 text-[#293732] border-[#DDDCD3] hover:bg-white'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>{isAdjustingPin ? `Tap Map (≤${PIN_RADIUS_METERS}m)` : 'Adjust Pin'}</span>
                </button>
              </div>
            )}
          </div>

          {pinAdjustError && (
            <div className="text-[11px] text-[#B76F60] font-medium">{pinAdjustError}</div>
          )}
        </div>

        {/* Card 3: State-Driven Evidence Security */}
        <div
          data-testid="evidence-security-panel"
          className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#527B7A]" />
            <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
              Evidence Security
            </h4>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 text-[#293732]">
              <span>Image captured</span>
              {renderStatusPill(securityState.image)}
            </div>
            <div className="flex items-center justify-between gap-2 text-[#293732]">
              <span>SHA-256 hash</span>
              {renderStatusPill(securityState.hash)}
            </div>
            <div className="flex items-center justify-between gap-2 text-[#293732]">
              <span>ECDSA P-256 signature</span>
              {renderStatusPill(securityState.signature)}
            </div>
            <div className="flex items-center justify-between gap-2 text-[#293732]">
              <span>Evidence nonce</span>
              {renderStatusPill(securityState.nonce)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

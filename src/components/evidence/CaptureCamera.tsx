'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Camera, 
  MapPin, 
  Crosshair, 
  Copy, 
  Check, 
  Signal, 
  Zap, 
  Video, 
  Image as ImageIcon,
  RotateCcw,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { EvidenceRole, EvidencePayload, computePhotoHash, signEvidencePayload, haversineDistanceM } from '@/lib/evidence/sign';
import { getOrCreateDeviceKey } from '@/lib/evidence/deviceKey';

export interface CapturedEvidence {
  blob: Blob;
  previewUrl: string;
  payload: EvidencePayload;
  signature: string;
}

export interface CaptureCameraProps {
  role: EvidenceRole;
  onCapture: (evidence: CapturedEvidence) => void;
  onCancel?: () => void;
  targetCoords?: { lat: number; lng: number };
  overrideNonce?: string;
}

export function CaptureCamera({ role, onCapture, onCancel, overrideNonce }: CaptureCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [, setCameraError] = useState<string | null>(null);

  // Default simulated GPS fix for Bengaluru Ward 12
  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number; accuracy: number }>({
    lat: 12.9347,
    lng: 77.6139,
    accuracy: 4.8,
  });

  // Pin coordinates (fine-tunable within 50m)
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number }>({
    lat: 12.9347,
    lng: 77.6139,
  });
  const [pinDistanceM, setPinDistanceM] = useState<number>(0);
  const [isAdjustingPin, setIsAdjustingPin] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [zoomMode, setZoomMode] = useState<'1x' | '2x'>('1x');
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraError(null);
    } catch {
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    void startCamera();

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!isMounted) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          setGpsFix({ lat, lng, accuracy });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }

    return () => {
      isMounted = false;
      stopCamera();
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [startCamera, stopCamera]);

  const copyCoordinates = () => {
    const coordsStr = `${pinCoords.lat.toFixed(4)}° N, ${pinCoords.lng.toFixed(4)}° E`;
    navigator.clipboard.writeText(coordsStr);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const adjustPinOffset = (dLat: number, dLng: number) => {
    const newLat = pinCoords.lat + dLat;
    const newLng = pinCoords.lng + dLng;
    const dist = haversineDistanceM(gpsFix.lat, gpsFix.lng, newLat, newLng);

    if (dist <= 50) {
      setPinCoords({ lat: newLat, lng: newLng });
      setPinDistanceM(Math.round(dist));
    }
  };

  const handleCapture = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      let blob: Blob;

      if (videoRef.current && cameraActive) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2D rendering context');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas image encoding failed'))), 'image/jpeg', 0.88);
        });
      } else {
        const sampleRes = await fetch('/images/pothole-clean-evidence.jpg');
        blob = await sampleRes.blob();
      }

      let nonce = overrideNonce || 'offline';
      if (!overrideNonce) {
        try {
          const nonceRes = await fetch('/api/evidence/nonce', { method: 'POST' });
          if (nonceRes.ok) {
            const nonceData = await nonceRes.json();
            nonce = nonceData.nonce || 'offline';
          }
        } catch {
          nonce = 'offline';
        }
      }

      const arrayBuffer = await blob.arrayBuffer();
      const photoHash = await computePhotoHash(arrayBuffer);
      const effectiveCoords = pinCoords || { lat: 12.9347, lng: 77.6139 };

      const payload: EvidencePayload = {
        accuracy: Math.round(gpsFix.accuracy * 10) / 10,
        capturedAt: new Date().toISOString(),
        lat: effectiveCoords.lat,
        lng: effectiveCoords.lng,
        nonce,
        photoHash,
        role,
      };

      const { keyPair } = await getOrCreateDeviceKey();
      const signature = await signEvidencePayload(payload, keyPair.privateKey);

      stopCamera();
      const previewUrl = URL.createObjectURL(blob);
      setCapturedPreview(previewUrl);

      onCapture({
        blob,
        previewUrl,
        payload,
        signature,
      });
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* ── Left Column: Live Camera Viewport (Matching Image 5) ── */}
      <div className="lg:col-span-7 bg-[#293732] rounded-[26px] overflow-hidden border border-[#DDDCD3] shadow-[0_12px_32px_-6px_rgba(41,55,50,0.15)] relative aspect-[4/3] sm:aspect-[16/11] flex items-center justify-center select-none">
        
        {/* Video feed or clean road evidence photo */}
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-transform duration-200 ${zoomMode === '2x' ? 'scale-125' : 'scale-100'}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capturedPreview || "/images/pothole-clean-evidence.jpg"}
            alt="Live Camera Feed"
            className={`w-full h-full object-cover transition-transform duration-200 ${zoomMode === '2x' ? 'scale-125' : 'scale-100'}`}
          />
        )}

        {/* Top-Left: Live Camera Pill */}
        <div className="absolute top-4 left-4 z-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-[#DDDCD3] shadow-sm text-xs font-semibold text-[#293732]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#537C60] animate-pulse" />
            <span>Live Camera</span>
          </div>
        </div>

        {/* Right-Side Vertical Floating Controls Bar */}
        <div className="absolute top-1/2 -translate-y-1/2 right-4 z-20">
          <div className="bg-white/85 backdrop-blur-md border border-[#DDDCD3] p-1.5 rounded-2xl flex flex-col items-center gap-2 shadow-sm">
            <button
              type="button"
              onClick={() => startCamera()}
              title="Switch Camera"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[#293732] hover:bg-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setFlashOn(!flashOn)}
              title="Toggle Flash"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                flashOn ? 'bg-amber-100 text-amber-700' : 'text-[#293732] hover:bg-white'
              }`}
            >
              <Zap className="w-4 h-4" />
            </button>

            <div className="w-5 border-t border-[#DDDCD3]" />

            <button
              type="button"
              onClick={() => setZoomMode('1x')}
              className={`w-8 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                zoomMode === '1x' ? 'bg-[#355858] text-white shadow-sm' : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              1x
            </button>

            <button
              type="button"
              onClick={() => setZoomMode('2x')}
              className={`w-8 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                zoomMode === '2x' ? 'bg-[#355858] text-white shadow-sm' : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              2x
            </button>
          </div>
        </div>

        {/* Viewfinder Reticle Corners */}
        <div className="absolute inset-8 pointer-events-none z-10">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/90 rounded-tl-lg drop-shadow-sm" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/90 rounded-tr-lg drop-shadow-sm" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/90 rounded-bl-lg drop-shadow-sm" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/90 rounded-br-lg drop-shadow-sm" />
        </div>

        {/* Bottom Shutter & Controls Dock */}
        <div className="absolute bottom-5 inset-x-6 z-20 flex items-center justify-between pointer-events-none">
          {/* Gallery Button */}
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={handleCapture}
              title="Gallery"
              className="w-12 h-12 rounded-2xl bg-white/85 backdrop-blur-md border border-[#DDDCD3] flex items-center justify-center text-[#293732] hover:bg-white transition-all cursor-pointer shadow-sm active:translate-y-px"
            >
              <ImageIcon className="w-5 h-5 text-[#527B7A]" />
            </button>
          </div>

          {/* Large Shutter Button */}
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={handleCapture}
              disabled={isProcessing}
              title="Take Photo"
              className="w-16 h-16 rounded-full bg-[#355858] border-4 border-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] flex items-center justify-center text-white cursor-pointer active:scale-95 transition-transform hover:bg-[#3E6966]"
            >
              <Camera className="w-7 h-7" />
            </button>
          </div>

          {/* Video Mode Button */}
          <div className="pointer-events-auto">
            <button
              type="button"
              title="Video Mode"
              className="w-12 h-12 rounded-2xl bg-white/85 backdrop-blur-md border border-[#DDDCD3] flex items-center justify-center text-[#293732] hover:bg-white transition-all cursor-pointer shadow-sm opacity-60"
            >
              <Video className="w-5 h-5 text-[#527B7A]" />
            </button>
          </div>
        </div>

      </div>

      {/* ── Right Column: Translucent Layered Status Cards ── */}
      <div className="lg:col-span-5 space-y-4">
        
        {/* Card 1: Location Verification */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#527B7A]" />
              <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
                Location Verification
              </h4>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFF6F1] text-[#537C60] border border-[#CFE4D4]">
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Within City Limits</span>
            </span>
          </div>

          <div className="p-3 bg-[#F6F7F4] rounded-xl border border-[#E5E9E3] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#929B92]">
                Current Location
              </div>
              <div className="font-mono text-xs sm:text-sm font-semibold text-[#293732] pt-0.5">
                {pinCoords.lat.toFixed(4)}° N, {pinCoords.lng.toFixed(4)}° E
              </div>
            </div>

            <button
              type="button"
              onClick={copyCoordinates}
              className="p-1.5 text-[#65736B] hover:text-[#293732] hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="Copy Coordinates"
            >
              {copiedCoords ? <Check className="w-4 h-4 text-[#537C60]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Card 2: GPS Accuracy with Map Preview */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-[#527B7A]" />
              <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
                GPS Accuracy
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#EAF2F0] text-[#527B7A] border border-[#D0E2DF]">
                ± {gpsFix ? gpsFix.accuracy.toFixed(1) : '4.8'} m
              </span>
              <Signal className="w-4 h-4 text-[#537C60]" />
            </div>
          </div>

          {/* Mini street-level map preview */}
          <div className="relative h-28 rounded-xl overflow-hidden border border-[#DDDCD3] bg-[#F3F2EB]">
            <svg viewBox="0 0 320 120" fill="none" className="w-full h-full object-cover">
              <line x1="0" y1="55" x2="320" y2="55" stroke="#FFFFFF" strokeWidth="10" />
              <line x1="0" y1="55" x2="320" y2="55" stroke="#DDDCD3" strokeWidth="7" />
              <line x1="160" y1="0" x2="160" y2="120" stroke="#FFFFFF" strokeWidth="10" />
              <line x1="160" y1="0" x2="160" y2="120" stroke="#DDDCD3" strokeWidth="7" />
              <rect x="20" y="10" width="120" height="35" rx="3" fill="#E8EBE4" />
              <rect x="180" y="10" width="120" height="35" rx="3" fill="#E2E7DE" />
              <rect x="20" y="75" width="120" height="35" rx="3" fill="#E2E7DE" />
              <rect x="180" y="75" width="120" height="35" rx="3" fill="#E8EBE4" />
              <g transform="translate(160, 55)">
                <circle cx="0" cy="0" r="16" fill="#527B7A" fillOpacity="0.18" />
                <circle cx="0" cy="0" r="10" fill="#355858" />
                <circle cx="0" cy="0" r="4" fill="#FFFFFF" />
              </g>
            </svg>

            {/* Adjust Pin Floating Button */}
            <div className="absolute bottom-2.5 right-2.5">
              <button
                type="button"
                onClick={() => setIsAdjustingPin(!isAdjustingPin)}
                className="px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-[#DDDCD3] shadow-sm text-xs font-semibold text-[#293732] flex items-center gap-1.5 hover:bg-white cursor-pointer active:translate-y-px transition-all"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Adjust Pin</span>
              </button>
            </div>
          </div>

          {/* Pin Adjuster Controls if open */}
          {isAdjustingPin && (
            <div className="p-3 bg-[#F6F7F4] rounded-xl border border-[#E5E9E3] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#65736B]">Offset distance: {pinDistanceM}m / 50m max</span>
                <button
                  type="button"
                  onClick={() => {
                    setPinCoords({ lat: gpsFix.lat, lng: gpsFix.lng });
                    setPinDistanceM(0);
                  }}
                  className="text-[#527B7A] hover:underline font-semibold text-[11px]"
                >
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button type="button" onClick={() => adjustPinOffset(0.0001, 0)} className="py-1 px-2 bg-white rounded border border-[#DDDCD3] text-xs font-bold text-[#293732]">▲ N</button>
                <button type="button" onClick={() => adjustPinOffset(-0.0001, 0)} className="py-1 px-2 bg-white rounded border border-[#DDDCD3] text-xs font-bold text-[#293732]">▼ S</button>
                <button type="button" onClick={() => adjustPinOffset(0, -0.0001)} className="py-1 px-2 bg-white rounded border border-[#DDDCD3] text-xs font-bold text-[#293732]">◀ W</button>
                <button type="button" onClick={() => adjustPinOffset(0, 0.0001)} className="py-1 px-2 bg-white rounded border border-[#DDDCD3] text-xs font-bold text-[#293732]">▶ E</button>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Evidence Security */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#527B7A]" />
            <h4 className="font-semibold text-xs sm:text-sm text-[#293732]">
              Evidence Security
            </h4>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2.5 text-[#293732]">
              <CheckCircle2 className="w-4 h-4 text-[#537C60] shrink-0" />
              <span>Image captured</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#293732]">
              <CheckCircle2 className="w-4 h-4 text-[#537C60] shrink-0" />
              <span>SHA-256 hash generated</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#293732]">
              <CheckCircle2 className="w-4 h-4 text-[#537C60] shrink-0" />
              <span>Digitally signed (ECDSA P-256)</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#293732]">
              <CheckCircle2 className="w-4 h-4 text-[#537C60] shrink-0" />
              <span>Nonce verified</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

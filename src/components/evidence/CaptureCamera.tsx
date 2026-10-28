'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Navigation, AlertTriangle, CheckCircle, RefreshCw, X } from 'lucide-react';
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
}

export function CaptureCamera({ role, onCapture, onCancel, targetCoords }: CaptureCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(() => {
    if (typeof navigator !== 'undefined' && !navigator.geolocation) {
      return 'Geolocation is not supported by this browser.';
    }
    return null;
  });

  // Pin coordinates (default to GPS, can be fine-tuned up to 50m)
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pinDistanceM, setPinDistanceM] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [captureStatusMessage, setCaptureStatusMessage] = useState<string>('');

  // Start Camera with environment facingMode
  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to access camera');
      setCameraActive(false);
    }
  }, []);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Initialize camera and GPS watch
  useEffect(() => {
    let isMounted = true;

    const initCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported by your browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
      } catch (err) {
        if (isMounted) {
          setCameraError(err instanceof Error ? err.message : 'Failed to access camera');
          setCameraActive(false);
        }
      }
    };

    void initCamera();

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;

          setGpsFix({ lat, lng, accuracy });
          setGpsError(null);

          setPinCoords((prev) => {
            if (!prev) return { lat, lng };
            const dist = haversineDistanceM(lat, lng, prev.lat, prev.lng);
            if (dist > 50) {
              setPinDistanceM(0);
              return { lat, lng };
            }
            setPinDistanceM(dist);
            return prev;
          });
        },
        (err) => {
          setGpsError(err.message || 'GPS location unavailable');
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }
      );
    }

    return () => {
      isMounted = false;
      stopCamera();
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [stopCamera]);

  // Handle pin offset adjustment (maximum 50m from GPS fix)
  const adjustPinOffset = (dLat: number, dLng: number) => {
    if (!gpsFix) return;
    const newLat = (pinCoords?.lat ?? gpsFix.lat) + dLat;
    const newLng = (pinCoords?.lng ?? gpsFix.lng) + dLng;
    const dist = haversineDistanceM(gpsFix.lat, gpsFix.lng, newLat, newLng);

    if (dist <= 50) {
      setPinCoords({ lat: newLat, lng: newLng });
      setPinDistanceM(dist);
    }
  };

  const resetPinToGps = () => {
    if (gpsFix) {
      setPinCoords({ lat: gpsFix.lat, lng: gpsFix.lng });
      setPinDistanceM(0);
    }
  };

  // Capture, resize to max 1600px, hash, sign, and submit
  const handleCapture = async () => {
    if (!videoRef.current || !gpsFix || isProcessing) return;

    if (gpsFix.accuracy > 30) {
      setCameraError('GPS accuracy must be 30m or better before capturing evidence.');
      return;
    }

    setIsProcessing(true);
    setCaptureStatusMessage('Capturing high-resolution frame...');

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');

      // Max 1600px dimension
      const maxDim = 1600;
      let width = video.videoWidth || 1280;
      let height = video.videoHeight || 720;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D rendering context');
      ctx.drawImage(video, 0, 0, width, height);

      setCaptureStatusMessage('Processing photo and requesting single-use nonce...');

      // Convert to JPEG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas image encoding failed'));
          },
          'image/jpeg',
          0.85
        );
      });

      // Fetch 128-bit single-use nonce
      const nonceRes = await fetch('/api/evidence/nonce', { method: 'POST' });
      if (!nonceRes.ok) {
        throw new Error(`Failed to obtain capture nonce: ${nonceRes.statusText}`);
      }
      const { nonce } = await nonceRes.json();

      setCaptureStatusMessage('Computing SHA-256 hash and cryptographic signature...');

      const arrayBuffer = await blob.arrayBuffer();
      const photoHash = await computePhotoHash(arrayBuffer);

      const effectiveCoords = pinCoords || { lat: gpsFix.lat, lng: gpsFix.lng };

      const payload: EvidencePayload = {
        accuracy: Math.round(gpsFix.accuracy * 10) / 10,
        capturedAt: new Date().toISOString(),
        lat: effectiveCoords.lat,
        lng: effectiveCoords.lng,
        nonce,
        photoHash,
        role,
      };

      // Retrieve device signing key and sign canonical payload
      const { keyPair } = await getOrCreateDeviceKey();
      const signature = await signEvidencePayload(payload, keyPair.privateKey);

      stopCamera();

      const previewUrl = URL.createObjectURL(blob);
      onCapture({
        blob,
        previewUrl,
        payload,
        signature,
      });
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Capture failed');
      setIsProcessing(false);
    }
  };

  const isGpsLocked = gpsFix !== null && gpsFix.accuracy <= 30;

  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col">
      {/* Viewport Header */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30">
            {role}
          </span>
          {targetCoords && (
            <span className="text-xs text-zinc-400">
              Target: {targetCoords.lat.toFixed(4)}, {targetCoords.lng.toFixed(4)}
            </span>
          )}
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel capture"
            className="p-2 rounded-full bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Video Viewport (No file upload input per V1 requirement) */}
      <div className="relative aspect-[4/3] sm:aspect-video bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {!cameraActive && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-2" />
            <span className="text-sm">Initialising camera feed...</span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-900/90 text-red-400">
            <AlertTriangle className="w-10 h-10 mb-2" />
            <p className="font-semibold text-sm">{cameraError}</p>
            <button
              type="button"
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition"
            >
              Retry Camera
            </button>
          </div>
        )}

        {/* GPS Gate Overlay Indicator */}
        <div className="absolute bottom-4 inset-x-4 z-20 flex flex-col space-y-2">
          {gpsFix ? (
            <div
              className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs backdrop-blur-md border ${
                isGpsLocked
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-950/80 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                {isGpsLocked ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                )}
                <span>
                  {isGpsLocked
                    ? `GPS Locked: ±${Math.round(gpsFix.accuracy)}m (${gpsFix.lat.toFixed(5)}, ${gpsFix.lng.toFixed(5)})`
                    : `Accuracy: ±${Math.round(gpsFix.accuracy)}m — Move to open sky (≤30m required)`}
                </span>
              </div>
              {pinDistanceM > 0 && (
                <span className="text-[11px] text-zinc-400">
                  Pin offset: {Math.round(pinDistanceM)}m / 50m max
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs bg-zinc-900/80 border border-zinc-700 text-zinc-300 backdrop-blur-md">
              <Navigation className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              <span>{gpsError || 'Acquiring high-accuracy GPS fix...'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls Bar */}
      <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex flex-col space-y-3">
        {/* Optional Pin Nudge (max 50m) */}
        {gpsFix && (
          <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-3">
            <span className="text-zinc-500">Fine-tune pin (max 50m):</span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => adjustPinOffset(0.0001, 0)}
                disabled={pinDistanceM >= 50 || isProcessing}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded"
              >
                N
              </button>
              <button
                type="button"
                onClick={() => adjustPinOffset(-0.0001, 0)}
                disabled={pinDistanceM >= 50 || isProcessing}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded"
              >
                S
              </button>
              <button
                type="button"
                onClick={() => adjustPinOffset(0, 0.0001)}
                disabled={pinDistanceM >= 50 || isProcessing}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded"
              >
                E
              </button>
              <button
                type="button"
                onClick={() => adjustPinOffset(0, -0.0001)}
                disabled={pinDistanceM >= 50 || isProcessing}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded"
              >
                W
              </button>
              {pinDistanceM > 0 && (
                <button
                  type="button"
                  onClick={resetPinToGps}
                  className="px-2 py-1 text-primary hover:underline ml-2"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* Capture Trigger */}
        <div className="flex items-center justify-center py-2">
          <button
            type="button"
            onClick={handleCapture}
            disabled={!isGpsLocked || !cameraActive || isProcessing}
            aria-label="Capture signed photo"
            className={`flex items-center justify-center space-x-2 px-8 py-3.5 rounded-full font-semibold transition-all shadow-lg ${
              isGpsLocked && cameraActive && !isProcessing
                ? 'bg-primary text-black hover:bg-primary/90 active:scale-95 cursor-pointer shadow-primary/20'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">{captureStatusMessage}</span>
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" />
                <span>Capture & Sign Evidence</span>
              </>
            )}
          </button>
        </div>

        {/* Status Hint */}
        <div className="text-center text-[11px] text-zinc-500">
          {!isGpsLocked
            ? 'Camera locked: Move into open sky until GPS accuracy is 30 metres or less.'
            : 'Signed with device hardware key (Web Crypto ECDSA P-256) and single-use server nonce.'}
        </div>
      </div>
    </div>
  );
}

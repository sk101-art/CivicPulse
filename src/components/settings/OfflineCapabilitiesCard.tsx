'use client';

import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Wifi,
  WifiOff,
  MapPin,
  Camera,
} from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { hasStoredDeviceKey, type DeviceKeyStatus } from '@/lib/evidence/deviceKey';

type BrowserPermissionValue = 'granted' | 'prompt' | 'denied' | 'unavailable';

function permissionBadge(state: BrowserPermissionValue): {
  label: string;
  classes: string;
} {
  switch (state) {
    case 'granted':
      return {
        label: 'Granted',
        classes: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]',
      };
    case 'prompt':
      return {
        label: 'Prompt',
        classes: 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3]',
      };
    case 'denied':
      return {
        label: 'Denied',
        classes: 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]',
      };
    default:
      return {
        label: 'Unavailable',
        classes: 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]',
      };
  }
}

function deviceKeyBadge(status: DeviceKeyStatus | 'CHECKING'): {
  label: string;
  classes: string;
  desc: string;
} {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        classes: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]',
        desc: 'Non-extractable ECDSA P-256 keypair stored locally in IndexedDB.',
      };
    case 'NOT_INITIALIZED':
      return {
        label: 'Not initialized yet',
        classes: 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3]',
        desc: 'Automatically created when you capture your first signed report or audit photo.',
      };
    case 'CHECKING':
      return {
        label: 'Checking...',
        classes: 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]',
        desc: 'Inspecting local cryptographic key storage...',
      };
    default:
      return {
        label: 'Unavailable',
        classes: 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]',
        desc: 'Browser IndexedDB or Web Crypto key inspection is unavailable in this environment.',
      };
  }
}

export function OfflineCapabilitiesCard() {
  const { isOnline, pendingCount, isSyncing, lastSyncError, syncReports } = useOfflineSync();
  const [keyStatus, setKeyStatus] = useState<DeviceKeyStatus | 'CHECKING'>('CHECKING');
  const [geoPermission, setGeoPermission] = useState<BrowserPermissionValue>('unavailable');
  const [cameraPermission, setCameraPermission] = useState<BrowserPermissionValue>('unavailable');

  // Read-only device key inspection (never creates a database or keypair)
  useEffect(() => {
    let active = true;
    void hasStoredDeviceKey().then((status) => {
      if (active) setKeyStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  // Read-only browser permissions query (never calls getCurrentPosition or getUserMedia)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setGeoPermission('unavailable');
      setCameraPermission('unavailable');
      return;
    }

    let mounted = true;
    const cleanups: Array<() => void> = [];

    const watchPermission = async (
      name: PermissionName,
      setter: React.Dispatch<React.SetStateAction<BrowserPermissionValue>>
    ) => {
      try {
        const status = await navigator.permissions.query({ name });
        if (!mounted) return;
        setter(status.state as BrowserPermissionValue);
        const onChange = () => {
          if (mounted) {
            setter(status.state as BrowserPermissionValue);
          }
        };
        status.addEventListener('change', onChange);
        cleanups.push(() => status.removeEventListener('change', onChange));
      } catch {
        if (mounted) setter('unavailable');
      }
    };

    void watchPermission('geolocation', setGeoPermission);
    void watchPermission('camera' as PermissionName, setCameraPermission);

    return () => {
      mounted = false;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);

  const keyInfo = deviceKeyBadge(keyStatus);
  const geoInfo = permissionBadge(geoPermission);
  const camInfo = permissionBadge(cameraPermission);
  const canSyncNow = isOnline && pendingCount > 0 && !isSyncing;
  const anyDenied = geoPermission === 'denied' || cameraPermission === 'denied';

  return (
    <div
      data-testid="offline-capabilities-card"
      className="bg-white rounded-[24px] sm:rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] space-y-6"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#355858] shrink-0">
          <HardDrive className="w-6 h-6 stroke-[1.8]" />
        </div>
        <div className="space-y-1 min-w-0">
          <div className="text-[11px] font-bold text-[#527B7A] tracking-wider uppercase font-mono">
            LOCAL STORAGE, SYNC &amp; PERMISSIONS
          </div>
          <h2
            id="offline-capabilities-heading"
            className="font-display text-xl sm:text-2xl text-[#293732] font-semibold tracking-tight"
          >
            Offline Evidence &amp; Sync
          </h2>
          <p className="text-xs sm:text-sm text-[#65736B] leading-relaxed">
            Queued reports are stored locally in IndexedDB and synchronize automatically when your browser reconnects, or manually below.
          </p>
        </div>
      </div>

      {/* Device Key & Offline Queue Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Cryptographic Device Key */}
        <div
          data-testid="device-key-status-tile"
          className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex flex-col justify-between gap-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <KeyRound className="w-5 h-5 text-[#527B7A] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#293732]">
                  Cryptographic Device Key
                </div>
                <div className="text-[11px] text-[#65736B] mt-0.5 leading-relaxed">
                  {keyInfo.desc}
                </div>
              </div>
            </div>
            <span
              data-testid="device-key-badge"
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${keyInfo.classes}`}
            >
              {keyInfo.label}
            </span>
          </div>
        </div>

        {/* Offline Report Queue */}
        <div
          data-testid="offline-queue-status-tile"
          className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex flex-col justify-between gap-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <ShieldCheck className="w-5 h-5 text-[#355858] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#293732]">
                  Offline Report Queue
                </div>
                <div className="text-[11px] text-[#65736B] mt-0.5">
                  <span data-testid="offline-pending-count" className="font-mono font-semibold text-[#293732]">
                    {pendingCount}
                  </span>{' '}
                  {pendingCount === 1 ? 'pending report' : 'pending reports'}
                  {isSyncing && ' • Syncing...'}
                </div>
              </div>
            </div>

            <span
              data-testid="network-status-badge"
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                isOnline
                  ? 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]'
                  : 'bg-[#FBF1EF] text-[#B76F60] border-[#EAC8C1]'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </span>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={!canSyncNow}
              onClick={() => void syncReports()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#355858] hover:bg-[#293732] disabled:bg-[#E9ECE6] disabled:text-[#929B92] text-white text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{isSyncing ? 'Syncing...' : 'Sync Pending Reports'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sync Error Banner */}
      {lastSyncError && (
        <div
          role="alert"
          data-testid="offline-sync-error"
          className="p-3.5 rounded-xl bg-[#FBF1EF] border border-[#EAC8C1] text-xs text-[#B76F60] flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{lastSyncError}</span>
        </div>
      )}

      {/* Browser Permissions (Read-Only) */}
      <div className="pt-2 border-t border-[#E9ECE6] space-y-3">
        <div className="text-xs font-semibold text-[#293732]">
          Browser Permissions (Read-Only)
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin className="w-4 h-4 text-[#527B7A] shrink-0" />
              <span className="text-xs font-medium text-[#293732]">Geolocation</span>
            </div>
            <span
              data-testid="perm-geolocation-badge"
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${geoInfo.classes}`}
            >
              {geoInfo.label}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Camera className="w-4 h-4 text-[#527B7A] shrink-0" />
              <span className="text-xs font-medium text-[#293732]">Camera</span>
            </div>
            <span
              data-testid="perm-camera-badge"
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${camInfo.classes}`}
            >
              {camInfo.label}
            </span>
          </div>
        </div>

        {anyDenied && (
          <p className="text-[11px] text-[#8A5A2B] bg-[#FDF7F0] border border-[#F2DFCA] rounded-xl px-3 py-2">
            One or more permissions are denied. Update site permissions in your browser&apos;s address bar settings to enable GPS or live camera capture.
          </p>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin,
  ChevronDown,
  Check,
  Building2,
  Shield,
  Loader2,
  LocateFixed,
  RefreshCw,
  Search,
  AlertCircle,
  Compass,
  X,
} from 'lucide-react';
import { useOptionalGeoContext, WardContextItem } from '@/context/GeoContext';
import { matchesWardSearch, findTypeAheadWardIndex } from '@/lib/geo/wardSearch';

interface GeoContextSelectorProps {
  className?: string;
}

const PAGE_SIZE = 60;

export function GeoContextSelector({ className = '' }: GeoContextSelectorProps) {
  const geo = useOptionalGeoContext();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCorpId, setSelectedCorpId] = useState<string>('ALL');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const typeAheadRef = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null; lastChar: string }>({
    text: '',
    timer: null,
    lastChar: '',
  });

  const role = geo?.role ?? null;
  const currentWard = geo?.currentWard ?? null;
  const availableWards = geo?.availableWards ?? [];
  const corporations = geo?.corporations ?? [];
  const department = geo?.department ?? null;
  const isLoading = geo?.isLoading ?? false;
  const contextError = geo?.error ?? null;
  const selectWard = geo?.selectWard ?? (() => {});
  const selectionMode = geo?.selectionMode ?? 'MANUAL';
  const locationStatus = geo?.locationStatus ?? 'idle';
  const locationMessage = geo?.locationMessage ?? null;
  const followLocation = geo?.followLocation ?? false;
  const operationalArea = geo?.operationalArea ?? null;
  const detectMyLocation = geo?.detectMyLocation ?? (async () => false);
  const setFollowLocation = geo?.setFollowLocation ?? (() => {});

  const isDetecting = locationStatus === 'detecting' || locationStatus === 'resolving';
  const isAuthority = role === 'AUTHORITY';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [searchQuery, selectedCorpId]);

  const handleSelect = (ward: WardContextItem) => {
    selectWard(ward);
    setIsOpen(false);
  };

  const handleMyLocation = async () => {
    await detectMyLocation({ userInitiated: true });
  };

  const handleChooseWard = () => {
    setTimeout(() => searchInputRef.current?.focus(), 20);
  };

  const filteredWards = useMemo(() => {
    const q = searchQuery.trim();
    return availableWards.filter((w) => {
      const isSpecial = w.id === 'zone-all' || w.code === 'ALL' || w.isPilot;
      if (selectedCorpId !== 'ALL') {
        if (isSpecial) return false;
        if (w.corporationId !== selectedCorpId) return false;
      }
      if (!q) return true;
      return matchesWardSearch(w, q);
    });
  }, [availableWards, searchQuery, selectedCorpId]);

  const jurisdictionEntries = useMemo(
    () => filteredWards.filter((w) => w.id === 'zone-all' || w.code === 'ALL' || w.isPilot),
    [filteredWards]
  );

  const municipalWards = useMemo(
    () => filteredWards.filter((w) => w.id !== 'zone-all' && w.code !== 'ALL' && !w.isPilot),
    [filteredWards]
  );

  const visibleMunicipalWards = useMemo(
    () => municipalWards.slice(0, visibleLimit),
    [municipalWards, visibleLimit]
  );

  const flatSelectableWards = useMemo(
    () => [...jurisdictionEntries, ...municipalWards],
    [jurisdictionEntries, municipalWards]
  );

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
      setHighlightedId(currentWard?.id ?? flatSelectableWards[0]?.id ?? null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll highlighted option into view
  useEffect(() => {
    if (!highlightedId) return;
    const el = optionRefs.current.get(highlightedId);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedId]);

  const handleTypeAheadChar = useCallback(
    (char: string) => {
      const lower = char.toLowerCase();
      const buf = typeAheadRef.current;
      if (buf.timer) clearTimeout(buf.timer);

      const isRepeated = buf.text.length === 1 && buf.lastChar === lower;
      const nextText = isRepeated ? lower : buf.text + lower;
      buf.text = nextText;
      buf.lastChar = lower;
      buf.timer = setTimeout(() => {
        typeAheadRef.current.text = '';
        typeAheadRef.current.lastChar = '';
      }, 700);

      const currentIdx = flatSelectableWards.findIndex((w) => w.id === highlightedId);
      const matchIdx = findTypeAheadWardIndex(flatSelectableWards, nextText, currentIdx, isRepeated);
      if (matchIdx >= 0) {
        if (matchIdx >= jurisdictionEntries.length + visibleLimit) {
          setVisibleLimit(matchIdx - jurisdictionEntries.length + PAGE_SIZE);
        }
        setHighlightedId(flatSelectableWards[matchIdx].id);
      }
    },
    [flatSelectableWards, highlightedId, jurisdictionEntries.length, visibleLimit]
  );

  const handleSelectorKeyDown = (e: React.KeyboardEvent, fromInput = false) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    const currentIdx = flatSelectableWards.findIndex((w) => w.id === highlightedId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatSelectableWards.length > 0) {
        const nextIdx = (currentIdx + 1) % flatSelectableWards.length;
        if (nextIdx >= jurisdictionEntries.length + visibleLimit) {
          setVisibleLimit(nextIdx - jurisdictionEntries.length + PAGE_SIZE);
        }
        setHighlightedId(flatSelectableWards[nextIdx].id);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatSelectableWards.length > 0) {
        const prevIdx = currentIdx <= 0 ? flatSelectableWards.length - 1 : currentIdx - 1;
        if (prevIdx >= jurisdictionEntries.length + visibleLimit) {
          setVisibleLimit(prevIdx - jurisdictionEntries.length + PAGE_SIZE);
        }
        setHighlightedId(flatSelectableWards[prevIdx].id);
      }
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      if (flatSelectableWards.length > 0) setHighlightedId(flatSelectableWards[0].id);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      if (flatSelectableWards.length > 0) {
        setVisibleLimit(municipalWards.length);
        setHighlightedId(flatSelectableWards[flatSelectableWards.length - 1].id);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target =
        flatSelectableWards.find((w) => w.id === highlightedId) ?? flatSelectableWards[0];
      if (target) handleSelect(target);
      return;
    }

    if (!fromInput && /^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      handleTypeAheadChar(e.key);
    }
  };

  // Group visible municipal wards hierarchically by City Corporation
  const groupedByCorporation = useMemo(() => {
    const groups = new Map<string, { title: string; wards: WardContextItem[] }>();
    for (const w of visibleMunicipalWards) {
      const key = w.corporationName || 'Greater Bengaluru';
      const existing = groups.get(key);
      if (existing) {
        existing.wards.push(w);
      } else {
        groups.set(key, { title: key, wards: [w] });
      }
    }
    return Array.from(groups.values());
  }, [visibleMunicipalWards]);

  const renderWardOption = (ward: WardContextItem) => {
    const isSelected = currentWard?.id === ward.id;
    const isHighlighted = highlightedId === ward.id;
    const isJurisdictionAll = ward.id === 'zone-all' || ward.code === 'ALL';
    return (
      <button
        key={ward.id}
        ref={(el) => {
          if (el) optionRefs.current.set(ward.id, el);
          else optionRefs.current.delete(ward.id);
        }}
        type="button"
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => setHighlightedId(ward.id)}
        onClick={() => handleSelect(ward)}
        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
          isHighlighted
            ? 'bg-[#E5E9E3] text-[#293732] ring-1 ring-[#527B7A]/40'
            : isSelected
              ? 'bg-[#FAF9F5] text-[#293732] font-semibold shadow-[inset_0_1px_2px_rgba(41,55,50,0.04)]'
              : 'hover:bg-[#FAF9F5] text-[#293732]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              isSelected ? 'bg-[#527B7A]' : 'bg-[#DDDCD3]'
            }`}
          />
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#293732] flex items-center gap-1.5 flex-wrap">
              <span>{ward.wardLabel}</span>
              {ward.code && (
                <span className="text-[10px] font-mono text-[#65736B] px-1 py-0.2 bg-white/80 rounded border border-[#DDDCD3]/70">
                  {ward.code}
                </span>
              )}
              {ward.isPilot && (
                <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#D4E3DF]/60 text-[#355858] border border-[#527B7A]/20">
                  Operational Area
                </span>
              )}
              {isJurisdictionAll && (
                <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#E9ECE6] text-[#355858] border border-[#DDDCD3]">
                  All Wards
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#65736B] truncate">
              {ward.name}
              {ward.zoneName && !ward.isPilot && !isJurisdictionAll ? ` · ${ward.zoneName}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {ward.issueCount !== undefined && ward.issueCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white border border-[#DDDCD3] text-[#65736B]">
              {ward.issueCount} {ward.issueCount === 1 ? 'issue' : 'issues'}
            </span>
          )}
          {isSelected && <Check className="w-4 h-4 text-[#527B7A] stroke-[2.5]" />}
        </div>
      </button>
    );
  };

  const hasStatusError =
    locationStatus === 'denied' ||
    locationStatus === 'unavailable' ||
    locationStatus === 'unsupported' ||
    locationStatus === 'no_ward' ||
    locationStatus === 'error';

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Compact Tactile Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Change geographical context"
        data-testid="geo-context-trigger"
        className="group relative flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#FAF9F5] active:bg-[#F3F2EB] border border-[#DDDCD3] rounded-2xl shadow-[0_2px_6px_rgba(41,55,50,0.06),0_1px_2px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] hover:border-[#C2D7D1] transition-all duration-150 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30"
      >
        <div className="w-6 h-6 rounded-lg bg-[#E5E9E3] border border-[#DDDCD3]/60 flex items-center justify-center shrink-0 text-[#527B7A] group-hover:bg-[#D4E3DF] transition-colors">
          {isDetecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#527B7A]" />
          ) : selectionMode === 'AUTO' ? (
            <LocateFixed className="w-3.5 h-3.5 text-[#355858] stroke-[2.2]" />
          ) : (
            <MapPin className="w-3.5 h-3.5 text-[#527B7A] stroke-[2.2]" />
          )}
        </div>

        <div className="flex flex-col min-w-0 pr-0.5">
          {isLoading && !currentWard ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <Loader2 className="w-3 h-3 animate-spin text-[#929B92]" />
              <span className="text-xs text-[#929B92] font-medium">Locating...</span>
            </div>
          ) : isAuthority ? (
            <div className="flex items-center gap-1.5">
              {department && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#E5E9E3] text-[#355858] border border-[#C2D7D1]/60 shrink-0">
                  {department.departmentCode}
                </span>
              )}
              <div className="flex items-baseline gap-1 truncate">
                <span className="text-xs font-semibold text-[#293732] truncate">
                  {currentWard?.wardLabel || currentWard?.name || department?.assignedZone || 'Assigned Zone'}
                </span>
                {currentWard?.name && currentWard.name !== currentWard.wardLabel && (
                  <span className="hidden md:inline text-[11px] text-[#65736B] font-medium truncate">
                    · {currentWard.name}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="text-xs font-semibold text-[#293732] whitespace-nowrap">
                {currentWard?.wardLabel || 'Ward'}
              </span>
              {currentWard?.name && (
                <span className="text-[11px] text-[#65736B] font-medium truncate max-w-[110px] sm:max-w-[155px]">
                  · {currentWard.name}
                </span>
              )}
              <span
                className={`hidden sm:inline-block text-[9px] font-mono uppercase px-1.5 py-0.2 rounded-full border ${
                  selectionMode === 'AUTO'
                    ? 'bg-[#D4E3DF]/60 text-[#355858] border-[#527B7A]/30'
                    : 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]'
                }`}
              >
                {selectionMode === 'AUTO' ? 'Auto' : 'Manual'}
              </span>
            </div>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-[#929B92] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#527B7A]' : 'group-hover:text-[#293732]'
          }`}
        />
      </button>

      {/* Interactive Geographical Context Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Geographical Context"
          onKeyDown={(e) => handleSelectorKeyDown(e, false)}
          className="absolute right-0 mt-2 w-[22rem] sm:w-[26rem] bg-white border border-[#DDDCD3] rounded-2xl shadow-[0_16px_36px_rgba(41,55,50,0.18),0_4px_12px_rgba(41,55,50,0.08),inset_0_1px_0_rgba(255,255,255,1)] z-[1200] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header & Current Selection */}
          <div className="p-3.5 bg-[#FAF9F5] border-b border-[#DDDCD3] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#355858]">
                <Compass className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>{isAuthority ? 'Operational Jurisdiction' : 'Geographical Context'}</span>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  selectionMode === 'AUTO'
                    ? 'bg-[#D4E3DF]/70 text-[#355858] border-[#527B7A]/30'
                    : 'bg-white text-[#65736B] border-[#DDDCD3]'
                }`}
              >
                {selectionMode === 'AUTO' ? 'Auto Location' : 'Manual Selection'}
              </span>
            </div>

            {/* Active Selection Card */}
            {currentWard && (
              <div className="p-2.5 rounded-xl bg-white border border-[#DDDCD3] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#293732] truncate">
                    {currentWard.wardLabel}
                    {currentWard.name && currentWard.name !== currentWard.wardLabel
                      ? ` · ${currentWard.name}`
                      : ''}
                  </div>
                  {currentWard.corporationName && !currentWard.isPilot && (
                    <div className="text-[11px] font-medium text-[#527B7A] truncate">
                      {currentWard.corporationName}
                      {currentWard.code ? ` · ${currentWard.code}` : ''}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#65736B] flex-wrap">
                    <span>
                      {selectionMode === 'AUTO' ? 'Detected automatically' : 'Manually selected'}
                    </span>
                    {currentWard.issueCount !== undefined && (
                      <span className="font-mono text-[#355858]">
                        · {currentWard.issueCount} {currentWard.issueCount === 1 ? 'issue' : 'issues'}
                      </span>
                    )}
                    {currentWard.isPilot && (
                      <span className="font-mono px-1.5 py-0.2 rounded bg-[#D4E3DF]/50 text-[#355858]">
                        Operational Area
                      </span>
                    )}
                  </div>
                  {operationalArea && !currentWard.isPilot && (
                    <div className="mt-1 text-[10px] text-[#527B7A] font-medium">
                      Inside operational corridor: {operationalArea.name} ({operationalArea.code})
                    </div>
                  )}
                </div>

                {selectionMode === 'AUTO' && (
                  <button
                    type="button"
                    onClick={handleMyLocation}
                    disabled={isDetecting}
                    title="Refresh my location"
                    aria-label="Refresh my location"
                    className="p-1.5 rounded-lg bg-[#E9ECE6] hover:bg-[#D4E3DF] text-[#355858] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            )}

            {/* Primary Mode Controls: My Location & Choose a Ward */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleMyLocation}
                disabled={isDetecting}
                data-testid="geo-my-location-btn"
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer disabled:opacity-60 ${
                  selectionMode === 'AUTO'
                    ? 'bg-[#355858] text-white border-[#355858] shadow-sm'
                    : 'bg-white text-[#293732] border-[#DDDCD3] hover:bg-[#E5E9E3]/60'
                }`}
              >
                {isDetecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="w-3.5 h-3.5" />
                )}
                <span>My Location</span>
              </button>

              <button
                type="button"
                onClick={handleChooseWard}
                data-testid="geo-choose-ward-btn"
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  selectionMode === 'MANUAL'
                    ? 'bg-[#E5E9E3] text-[#293732] border-[#527B7A]/50 shadow-[inset_0_1px_2px_rgba(41,55,50,0.04)]'
                    : 'bg-white text-[#293732] border-[#DDDCD3] hover:bg-[#FAF9F5]'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Choose a Ward</span>
              </button>
            </div>

            {selectionMode === 'AUTO' && (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#E9ECE6]/70 border border-[#DDDCD3]/70">
                <label
                  htmlFor="follow-location-toggle"
                  className="text-[11px] font-medium text-[#293732] cursor-pointer select-none"
                >
                  Follow My Location
                </label>
                <input
                  id="follow-location-toggle"
                  type="checkbox"
                  checked={followLocation}
                  onChange={(e) => setFollowLocation(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#355858] cursor-pointer"
                />
              </div>
            )}

            {locationMessage && (
              <div
                role={hasStatusError ? 'alert' : 'status'}
                className={`p-2 rounded-xl text-[11px] flex items-start gap-2 border ${
                  hasStatusError
                    ? 'bg-[#FBF1EF] border-[#EAC8C1] text-[#8F4A3C]'
                    : 'bg-[#EBF3ED] border-[#CDE3D2] text-[#355858]'
                }`}
              >
                {isDetecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />
                ) : hasStatusError ? (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <LocateFixed className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span>{locationMessage}</span>
                  {hasStatusError && (
                    <button
                      type="button"
                      onClick={handleChooseWard}
                      className="ml-1.5 underline font-semibold text-[#355858] cursor-pointer"
                    >
                      Select manually
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Department summary card for Authority */}
          {isAuthority && department && (
            <div className="px-3.5 py-2 bg-[#F3F2EB]/60 border-b border-[#DDDCD3] flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[#293732] truncate">
                  {department.deskTitle}
                </div>
                <div className="text-[10px] text-[#65736B] truncate">
                  Zone: {department.assignedZone}
                </div>
              </div>
              <Shield className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />
            </div>
          )}

          {/* Corporation Filter & Search */}
          <div className="p-2.5 space-y-2">
            {corporations.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCorpId('ALL')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                    selectedCorpId === 'ALL'
                      ? 'bg-[#355858] text-white border-[#355858]'
                      : 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                  }`}
                >
                  All ({availableWards.filter((w) => !w.isPilot && w.id !== 'zone-all').length})
                </button>
                {corporations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCorpId(c.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                      selectedCorpId === c.id
                        ? 'bg-[#355858] text-white border-[#355858]'
                        : 'bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                    }`}
                  >
                    {c.shortName} ({c.wardCount})
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#929B92] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls="geo-ward-listbox"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (!val.trim()) {
                    setHighlightedId(currentWard?.id ?? null);
                  } else {
                    const first = availableWards.find((w) => matchesWardSearch(w, val));
                    setHighlightedId(first?.id ?? null);
                  }
                }}
                onKeyDown={(e) => handleSelectorKeyDown(e, true)}
                placeholder="Search ward by name or number..."
                aria-label="Search ward by name or number"
                data-testid="geo-ward-search"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F3F2EB]/70 border border-[#DDDCD3] rounded-xl text-[#293732] placeholder:text-[#929B92] focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setHighlightedId(currentWard?.id ?? null);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#929B92] hover:text-[#293732] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div id="geo-ward-listbox" role="listbox" aria-label="Available wards" className="max-h-60 overflow-y-auto space-y-2 pr-0.5">
              {isLoading && availableWards.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#65736B] flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#527B7A]" />
                  <span>Loading 369 GBA wards...</span>
                </div>
              ) : contextError ? (
                <div className="p-3 text-center text-xs text-[#B76F60] bg-[#FBF1EF] rounded-xl border border-[#EAC8C1]">
                  {contextError}
                </div>
              ) : availableWards.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#65736B]">
                  No geographical contexts registered.
                </div>
              ) : filteredWards.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#65736B]">
                  No matching wards
                </div>
              ) : (
                <>
                  {jurisdictionEntries.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-[#65736B]">
                        Operational Areas
                      </div>
                      <div className="divide-y divide-[#DDDCD3]/40">
                        {jurisdictionEntries.map(renderWardOption)}
                      </div>
                    </div>
                  )}

                  {groupedByCorporation.map((group) => (
                    <div key={group.title} className="space-y-1">
                      <div className="px-2 pt-1 text-[10px] font-mono uppercase tracking-wider text-[#527B7A] flex items-center justify-between">
                        <span>{group.title}</span>
                        <span className="text-[#929B92]">Bengaluru</span>
                      </div>
                      <div className="divide-y divide-[#DDDCD3]/40">
                        {group.wards.map(renderWardOption)}
                      </div>
                    </div>
                  ))}

                  {municipalWards.length > visibleLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                      className="w-full py-2 text-xs font-semibold text-[#355858] bg-[#E9ECE6] hover:bg-[#D4E3DF] rounded-xl transition-colors cursor-pointer"
                    >
                      Show more wards ({municipalWards.length - visibleLimit} remaining)
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown, Check, Building2, Shield, Loader2 } from 'lucide-react';
import { useGeoContext, WardContextItem } from '@/context/GeoContext';

interface GeoContextSelectorProps {
  className?: string;
}

export function GeoContextSelector({ className = '' }: GeoContextSelectorProps) {
  const { role, currentWard, availableWards, department, isLoading, selectWard } = useGeoContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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

  const handleSelect = (ward: WardContextItem) => {
    selectWard(ward);
    setIsOpen(false);
  };

  const isAuthority = role === 'AUTHORITY';

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Floating Tactile Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title="Change geographical context"
        className="group relative flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#FAF9F5] active:bg-[#F3F2EB] border border-[#DDDCD3] rounded-2xl shadow-[0_2px_6px_rgba(41,55,50,0.06),0_1px_2px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] hover:border-[#C2D7D1] transition-all duration-150 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30"
      >
        {/* Refined Location Pin Icon */}
        <div className="w-6 h-6 rounded-lg bg-[#E5E9E3] border border-[#DDDCD3]/60 flex items-center justify-center shrink-0 text-[#527B7A] group-hover:bg-[#D4E3DF] transition-colors">
          <MapPin className="w-3.5 h-3.5 text-[#527B7A] stroke-[2.2]" />
        </div>

        {/* Content Area */}
        <div className="flex flex-col min-w-0 pr-0.5">
          {isLoading && !currentWard ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <Loader2 className="w-3 h-3 animate-spin text-[#929B92]" />
              <span className="text-xs text-[#929B92] font-medium">Locating...</span>
            </div>
          ) : isAuthority ? (
            /* Authority Context Display */
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
                    • {currentWard.name}
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Citizen Context Display */
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="text-xs font-semibold text-[#293732] whitespace-nowrap">
                {currentWard?.wardLabel || 'Ward'}
              </span>
              {currentWard?.name && (
                <span className="text-[11px] text-[#65736B] font-medium truncate max-w-[110px] sm:max-w-[150px]">
                  {currentWard.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Clear Dropdown Indicator */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#929B92] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#527B7A]' : 'group-hover:text-[#293732]'
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-[#DDDCD3] rounded-2xl shadow-[0_16px_36px_rgba(41,55,50,0.12),0_4px_12px_rgba(41,55,50,0.06),inset_0_1px_0_rgba(255,255,255,1)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="p-3.5 bg-[#FAF9F5] border-b border-[#DDDCD3]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#293732]">
                <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>{isAuthority ? 'Operational Jurisdiction' : 'Geographical Context'}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-[#DDDCD3] text-[#65736B]">
                {isAuthority ? 'Staff Scope' : 'Active Ward'}
              </span>
            </div>
            <p className="text-[11px] text-[#65736B] mt-1 leading-relaxed">
              {isAuthority
                ? `${department?.departmentName || 'Authority'}: Filter operational tickets and dispatch routes.`
                : 'Showing road truth ledger, issues, and civic verifications for this area.'}
            </p>
          </div>

          {/* Department summary card for Authority */}
          {isAuthority && department && (
            <div className="px-3.5 py-2.5 bg-[#F3F2EB]/60 border-b border-[#DDDCD3] flex items-center gap-2.5">
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

          {/* Wards List */}
          <div className="max-h-64 overflow-y-auto p-1.5 divide-y divide-[#DDDCD3]/40">
            {availableWards.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#65736B]">
                No geographical contexts registered.
              </div>
            ) : (
              availableWards.map((ward) => {
                const isSelected = currentWard?.id === ward.id;
                return (
                  <button
                    key={ward.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(ward)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#E5E9E3] text-[#293732] font-semibold shadow-[inset_0_1px_2px_rgba(41,55,50,0.04)]'
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
                        <div className="text-xs font-medium text-[#293732] flex items-center gap-1.5">
                          <span>{ward.wardLabel}</span>
                          {ward.code && (
                            <span className="text-[10px] font-mono text-[#65736B] px-1 py-0.2 bg-white/70 rounded border border-[#DDDCD3]/60">
                              {ward.code}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#65736B] truncate">
                          {ward.name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {ward.issueCount !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white border border-[#DDDCD3] text-[#65736B]">
                          {ward.issueCount} {ward.issueCount === 1 ? 'issue' : 'issues'}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-4 h-4 text-[#527B7A] stroke-[2.5]" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

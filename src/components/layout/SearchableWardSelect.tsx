'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import {
  matchesWardSearch,
  findTypeAheadWardIndex,
  type SearchableWardItem,
} from '@/lib/geo/wardSearch';

export interface SearchableWardOption extends SearchableWardItem {
  corporationName?: string | null;
}

interface SearchableWardSelectProps {
  wards: SearchableWardOption[];
  value: string;
  onChange: (wardId: string) => void;
  allOptionLabel?: string;
  ariaLabel?: string;
  className?: string;
}

const TYPEAHEAD_TIMEOUT_MS = 700;

export function SearchableWardSelect({
  wards,
  value,
  onChange,
  allOptionLabel = 'All Wards',
  ariaLabel = 'Filter by Ward',
  className = '',
}: SearchableWardSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const bufferRef = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null; lastChar: string }>({
    text: '',
    timer: null,
    lastChar: '',
  });

  const allEntry: SearchableWardOption = useMemo(
    () => ({ id: 'ALL', code: 'ALL', name: allOptionLabel }),
    [allOptionLabel]
  );

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim();
    const matched = q ? wards.filter((w) => matchesWardSearch(w, q)) : wards;
    if (!q || allOptionLabel.toLowerCase().includes(q.toLowerCase())) {
      return [allEntry, ...matched];
    }
    return matched;
  }, [wards, searchQuery, allEntry, allOptionLabel]);

  const selectedOption = useMemo(
    () => (value === 'ALL' ? allEntry : wards.find((w) => w.id === value) ?? allEntry),
    [value, wards, allEntry]
  );
  const activeHighlightedIndex = highlightedIndex >= 0
    ? highlightedIndex
    : Math.max(0, filteredOptions.findIndex((option) => option.id === value));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeHighlightedIndex >= 0 && optionRefs.current[activeHighlightedIndex]) {
      optionRefs.current[activeHighlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeHighlightedIndex]);

  const commitSelection = useCallback(
    (opt: SearchableWardOption) => {
      onChange(opt.id);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleTypeAheadChar = useCallback(
    (char: string) => {
      const lower = char.toLowerCase();
      const buf = bufferRef.current;
      if (buf.timer) clearTimeout(buf.timer);

      const isRepeated = buf.text.length === 1 && buf.lastChar === lower;
      const nextText = isRepeated ? lower : buf.text + lower;
      buf.text = nextText;
      buf.lastChar = lower;
      buf.timer = setTimeout(() => {
        bufferRef.current.text = '';
        bufferRef.current.lastChar = '';
      }, TYPEAHEAD_TIMEOUT_MS);

      const idx = findTypeAheadWardIndex(filteredOptions, nextText, activeHighlightedIndex, isRepeated);
      if (idx >= 0) {
        setHighlightedIndex(idx);
      }
    },
    [filteredOptions, activeHighlightedIndex]
  );

  const handleKeyDown = (e: React.KeyboardEvent, fromInput = false) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      } else if (/^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => handleTypeAheadChar(e.key), 15);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? filteredOptions.length - 1 : prev - 1));
      }
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      if (filteredOptions.length > 0) setHighlightedIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      if (filteredOptions.length > 0) setHighlightedIndex(filteredOptions.length - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeHighlightedIndex >= 0 && filteredOptions[activeHighlightedIndex]) {
        commitSelection(filteredOptions[activeHighlightedIndex]);
      }
      return;
    }

    // When focus is on the listbox/options (not inside the text input), support type-to-jump
    if (!fromInput && /^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      handleTypeAheadChar(e.key);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => handleKeyDown(e, false)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs text-[#293732] hover:border-[#527B7A] focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30 cursor-pointer text-left"
      >
        <span className="truncate">{selectedOption.name}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#65736B] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1.5 bg-white border border-[#DDDCD3] rounded-xl shadow-[0_12px_28px_rgba(41,55,50,0.14)] z-[1250] overflow-hidden"
          onKeyDown={(e) => handleKeyDown(e, false)}
        >
          <div className="p-2 border-b border-[#E9ECE6] bg-[#FAF9F5]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#929B92] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={(e) => handleKeyDown(e, true)}
                placeholder="Search ward by name or number..."
                aria-label="Search ward by name or number"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-[#DDDCD3] rounded-lg text-[#293732] placeholder:text-[#929B92] focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setHighlightedIndex(0);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#929B92] hover:text-[#293732] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto p-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-[#65736B]">No matching wards</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.id === value;
                const isHighlighted = idx === activeHighlightedIndex;
                return (
                  <button
                    key={opt.id}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => commitSelection(opt)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'bg-[#E5E9E3] text-[#293732]'
                        : isSelected
                          ? 'bg-[#FAF9F5] text-[#293732] font-semibold'
                          : 'text-[#293732] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{opt.name}</div>
                      {opt.corporationName && (
                        <div className="text-[10px] text-[#65736B] truncate">{opt.corporationName}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />}
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

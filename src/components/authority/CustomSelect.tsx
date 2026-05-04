'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
  label: string;
  value: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  enableSearch?: boolean;
}

export function CustomSelect({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  icon,
  enableSearch = false 
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-3 bg-card border border-white/5 rounded-2xl py-4 pl-10 pr-4 outline-none transition-all text-[10px] font-mono uppercase tracking-widest font-bold ${
          isOpen ? 'border-cyan/40 bg-white/[0.03]' : 'hover:border-white/20'
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {icon && <div className="text-white/30 shrink-0">{icon}</div>}
          <span className={`truncate ${selectedOption ? 'text-white' : 'text-white/40'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-white/20 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full left-0 right-0 mt-2 z-[60] bg-elevated border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl"
          >
            {enableSearch && (
              <div className="p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search options..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/20 border border-white/5 rounded-lg py-2 pl-9 pr-3 outline-none text-[10px] font-mono uppercase tracking-widest text-white placeholder:text-white/20 focus:border-cyan/30"
                  />
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center text-[9px] font-mono uppercase tracking-widest text-white/20">
                  No matches found
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
                      value === opt.value 
                        ? 'bg-cyan/10 text-cyan' 
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold">
                      {opt.label}
                    </span>
                    {value === opt.value && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

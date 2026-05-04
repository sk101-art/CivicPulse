'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search, X } from 'lucide-react';

export function CommandSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('search') || '');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const pushParams = (key: string, val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set(key, val);
    } else {
      params.delete(key);
    }
    router.push(`?${params.toString()}`);
  };

  const handleSort = (val: string) => {
    pushParams('sort', val);
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams('search', val);
    }, 400);
  };

  const clearSearch = () => {
    setQuery('');
    pushParams('search', '');
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
        <input 
          type="text" 
          placeholder="Search tickets..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="bg-white/5 border border-white/5 rounded-2xl py-2.5 pl-11 pr-10 outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all text-sm w-64 font-medium"
        />
        {query && (
          <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all cursor-pointer">
         <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sort:</span>
         <select 
            onChange={(e) => handleSort(e.target.value)}
            className="bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer appearance-none pr-5 text-white"
            defaultValue={searchParams.get('sort') || 'latest'}
         >
            <option value="latest" className="bg-slate-900">Latest</option>
            <option value="priority" className="bg-slate-900">Priority</option>
            <option value="votes" className="bg-slate-900">Votes</option>
            <option value="comments" className="bg-slate-900">Comments</option>
         </select>
         <ChevronDown className="absolute right-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Filter, SlidersHorizontal, Calendar } from 'lucide-react';
import { CustomSelect } from './CustomSelect';

const CATEGORIES = [
  { label: 'All Categories', value: '' },
  { label: 'Potholes', value: 'POTHOLES' },
  { label: 'Drainage', value: 'DRAINAGE' },
  { label: 'Streetlights', value: 'STREETLIGHTS' },
  { label: 'Sidewalks', value: 'SIDEWALKS' },
  { label: 'Traffic Signs', value: 'TRAFFIC_SIGNS' },
  { label: 'Graffiti', value: 'GRAFFITI' },
  { label: 'Trash', value: 'TRASH' },
  { label: 'Other', value: 'OTHER' },
];

const STATUSES = [
  { label: 'All Statuses', value: '' },
  { label: 'Open (Unconfirmed)', value: 'OPEN' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Personnel Assigned', value: 'ASSIGNED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const SORTS = [
  { label: 'Latest Arrival', value: 'latest' },
  { label: 'Highest Priority', value: 'priority' },
  { label: 'Most Votes', value: 'votes' },
  { label: 'Discussion Vol.', value: 'comments' },
];

export function TicketFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [query, setQuery] = useState(searchParams.get('search') || '');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const pushParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val !== null && val !== undefined && val !== '') {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    });
    router.push(`?${params.toString()}`);
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ search: val });
    }, 400);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Search Bar */}
        <div className="lg:col-span-4 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-cyan transition-colors" />
          <input 
            type="text" 
            placeholder="Search tickets..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-card border border-white/5 rounded-2xl py-4 pl-14 pr-12 outline-none focus:border-cyan/30 focus:bg-white/[0.03] transition-all text-sm font-medium text-white placeholder:text-white/20 shadow-xl"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); pushParams({ search: null }); }} 
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/5 text-white/30 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="lg:col-span-2">
          <CustomSelect 
            options={STATUSES}
            value={searchParams.get('status') || ''}
            onChange={(val) => pushParams({ status: val })}
            placeholder="All Statuses"
            icon={<Filter className="w-3.5 h-3.5" />}
          />
        </div>

        {/* Category Filter */}
        <div className="lg:col-span-3">
          <CustomSelect 
            options={CATEGORIES}
            value={searchParams.get('category') || ''}
            onChange={(val) => pushParams({ category: val })}
            placeholder="All Categories"
            icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            enableSearch
          />
        </div>

        {/* Sort Filter */}
        <div className="lg:col-span-3">
          <CustomSelect 
            options={SORTS}
            value={searchParams.get('sort') || 'latest'}
            onChange={(val) => pushParams({ sort: val })}
            placeholder="Sort Order"
            icon={<Calendar className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Active Filters Display */}
      {(searchParams.get('status') || searchParams.get('category') || searchParams.get('search')) && (
        <div className="flex items-center gap-3 flex-wrap animate-fade-in">
           <span className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30">Active Filters:</span>
           {['search', 'status', 'category'].map(key => {
             const val = searchParams.get(key);
             if (!val) return null;
             return (
               <button 
                 key={key}
                 onClick={() => pushParams({ [key]: null })}
                 className="px-3 py-1.5 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center gap-2 group transition-all hover:bg-cyan/20"
               >
                 <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-cyan">{val}</span>
                 <X className="w-3 h-3 text-cyan opacity-40 group-hover:opacity-100" />
               </button>
             );
           })}
           <button 
             onClick={() => router.push('/authority/tickets')}
             className="text-[9px] font-mono uppercase tracking-widest font-bold text-white/30 hover:text-magenta transition-colors ml-2"
           >
             Clear All
           </button>
        </div>
      )}
    </div>
  );
}

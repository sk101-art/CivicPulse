'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  MapPin, 
  Crosshair, 
  Copy, 
  Check, 
  Search, 
  ArrowUpRight, 
  ExternalLink,
  Compass, 
  FileText,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw
} from 'lucide-react';
import { useGeoContext } from '@/context/GeoContext';

export interface LocationRecord {
  id: string;
  issueId: string;
  title: string;
  category: string;
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  wardName?: string | null;
  wardCode?: string | null;
  createdAt: string | Date;
  isUserSubmission?: boolean;
}

interface ReportLocationsViewProps {
  initialUserReports: LocationRecord[];
  initialAreaIssues: LocationRecord[];
}

// Category semantic badge styling mapping
const categoryStyles: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  POTHOLES: { label: 'Potholes', bg: 'bg-[#FDF6ED]', text: 'text-[#B68B63]', border: 'border-[#F4E3CB]', dot: '#B68B63' },
  DRAINAGE: { label: 'Drainage', bg: 'bg-[#F0F5F8]', text: 'text-[#718F9E]', border: 'border-[#D4E2E9]', dot: '#718F9E' },
  WATERLOGGING: { label: 'Waterlogging', bg: 'bg-[#EEF5F7]', text: 'text-[#4A7C92]', border: 'border-[#D1E5EB]', dot: '#4A7C92' },
  STREETLIGHTS: { label: 'Streetlights', bg: 'bg-[#FDF8EC]', text: 'text-[#9A7B38]', border: 'border-[#F4E8C8]', dot: '#9A7B38' },
  SIDEWALKS: { label: 'Sidewalks', bg: 'bg-[#F3F5F1]', text: 'text-[#6B7865]', border: 'border-[#DCE2D7]', dot: '#6B7865' },
  FOOTPATH: { label: 'Footpath', bg: 'bg-[#F3F5F1]', text: 'text-[#6B7865]', border: 'border-[#DCE2D7]', dot: '#6B7865' },
  TRAFFIC_SIGNS: { label: 'Traffic Signs', bg: 'bg-[#FAF0EE]', text: 'text-[#B76F60]', border: 'border-[#F3D2CC]', dot: '#B76F60' },
  ROAD_CUT: { label: 'Road Cut', bg: 'bg-[#F6F2F7]', text: 'text-[#7A6B88]', border: 'border-[#E3D9E5]', dot: '#7A6B88' },
  TREE_FALL: { label: 'Tree Fall', bg: 'bg-[#EFF6F1]', text: 'text-[#537C60]', border: 'border-[#CFE4D4]', dot: '#537C60' },
  GRAFFITI: { label: 'Graffiti', bg: 'bg-[#FBF0F4]', text: 'text-[#A65B7E]', border: 'border-[#F3D0DF]', dot: '#A65B7E' },
  TRASH: { label: 'Trash & Waste', bg: 'bg-[#F0F5F1]', text: 'text-[#567A62]', border: 'border-[#D3E3D7]', dot: '#567A62' },
  OTHER: { label: 'Other', bg: 'bg-[#F2F4F3]', text: 'text-[#66766D]', border: 'border-[#D5DDD8]', dot: '#66766D' },
};

// Status semantic badge styling mapping
function getStatusBadge(status: string) {
  const norm = status.toUpperCase();
  switch (norm) {
    case 'IN_PROGRESS':
      return {
        label: 'In Progress',
        className: 'bg-[#EAF2F0] text-[#527B7A] border-[#D0E2DF]',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        className: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]',
      };
    case 'ASSIGNED':
      return {
        label: 'Assigned',
        className: 'bg-[#F0F2EE] text-[#65736B] border-[#DDDCD3]',
      };
    case 'CLAIMED_FIXED':
      return {
        label: 'Repair Claimed',
        className: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]',
      };
    case 'VERIFIED_FIXED':
    case 'RESOLVED':
      return {
        label: 'Verified Fixed',
        className: 'bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]',
      };
    case 'DISPUTED':
      return {
        label: 'Disputed',
        className: 'bg-[#FAF0EE] text-[#B76F60] border-[#F3D2CC]',
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        className: 'bg-[#FAF0EE] text-[#B76F60] border-[#F3D2CC]',
      };
    case 'REOPENED_IN_WARRANTY':
      return {
        label: 'Reopened',
        className: 'bg-[#FDF6ED] text-[#B68B63] border-[#F4E3CB]',
      };
    case 'OPEN':
    default:
      return {
        label: 'Open',
        className: 'bg-[#FDF6ED] text-[#B68B63] border-[#F4E3CB]',
      };
  }
}

export function ReportLocationsView({
  initialUserReports,
  initialAreaIssues,
}: ReportLocationsViewProps) {
  const { currentWard, wardData } = useGeoContext();

  // Scope switcher: 'area' (ward/area issues) or 'my_reports' (user submissions)
  const [scope, setScope] = useState<'area' | 'my_reports'>('area');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Copy-to-clipboard state tracking for individual coordinates
  const [copiedCoord, setCopiedCoord] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Active records based on scope and GeoContext
  const sourceRecords = useMemo(() => {
    if (scope === 'my_reports') {
      return initialUserReports;
    }

    // When viewing area issues, prefer live wardData.issues if available for current selected ward
    if (wardData.issues && wardData.issues.length > 0) {
      return wardData.issues.map((iss) => ({
        id: iss.id,
        issueId: iss.id,
        title: iss.title,
        category: iss.category,
        status: iss.status,
        latitude: iss.latitude ?? iss.lat,
        longitude: iss.longitude ?? iss.lng,
        address: iss.location,
        wardName: currentWard?.name,
        wardCode: currentWard?.code,
        createdAt: iss.createdAt,
        isUserSubmission: false,
      }));
    }

    // Fallback to server-rendered initialAreaIssues
    if (currentWard && currentWard.id !== 'all') {
      const wardIssues = initialAreaIssues.filter(
        (i) => i.wardCode?.toLowerCase() === currentWard.code?.toLowerCase() || i.wardName?.toLowerCase() === currentWard.name?.toLowerCase()
      );
      if (wardIssues.length > 0) return wardIssues;
    }

    return initialAreaIssues;
  }, [scope, initialUserReports, initialAreaIssues, wardData.issues, currentWard]);

  // Filtered and searched records
  const filteredRecords = useMemo(() => {
    return sourceRecords.filter((rec) => {
      // Category filter
      if (selectedCategory !== 'ALL' && rec.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'RESOLVED') {
          if (!['RESOLVED', 'CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(rec.status)) return false;
        } else if (rec.status !== selectedStatus) {
          return false;
        }
      }

      // Text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesTitle = rec.title.toLowerCase().includes(query);
        const matchesCategory = rec.category.toLowerCase().includes(query);
        const matchesAddress = (rec.address || '').toLowerCase().includes(query);
        const matchesLat = rec.latitude.toFixed(6).includes(query);
        const matchesLng = rec.longitude.toFixed(6).includes(query);
        return matchesTitle || matchesCategory || matchesAddress || matchesLat || matchesLng;
      }

      return true;
    });
  }, [sourceRecords, selectedCategory, selectedStatus, searchTerm]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = sourceRecords.length;
    const resolved = sourceRecords.filter((r) =>
      ['CLAIMED_FIXED', 'VERIFIED_FIXED', 'RESOLVED'].includes(r.status)
    ).length;
    const active = total - resolved;
    return { total, active, resolved };
  }, [sourceRecords]);

  // Copy coordinate handler
  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCoord(key);
      setTimeout(() => setCopiedCoord(null), 2000);
    }
  };

  // Formatted coordinate export text
  const exportText = useMemo(() => {
    const header = [
      `// CIVIC ATLAS — ISSUE COORDINATE REGISTRY`,
      `// Datum: WGS84 (Decimal Degrees)`,
      `// Scope: ${scope === 'my_reports' ? 'My Reported Submissions' : currentWard ? currentWard.fullName : 'All Registered Areas'}`,
      `// Total Coordinates: ${filteredRecords.length}`,
      `// Generated: ${new Date().toLocaleString('en-IN')}`,
      `// FORMAT: [Number] TITLE | CATEGORY → LATITUDE, LONGITUDE [STATUS]`,
      `--------------------------------------------------------------------------------`,
    ].join('\n');

    const rows = filteredRecords.map((r, i) => {
      const idx = String(i + 1).padStart(3, '0');
      const lat = r.latitude.toFixed(6);
      const lng = r.longitude.toFixed(6);
      return `[${idx}] ${r.title} | ${r.category} → ${lat}, ${lng} [${r.status}]`;
    }).join('\n');

    return `${header}\n${rows}`;
  }, [filteredRecords, scope, currentWard]);

  // Copy all export text
  const handleCopyAll = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(exportText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    }
  };

  return (
    <div className="flex-1 bg-[#F3F2EB] p-4 sm:p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto w-full">
      {/* Editorial Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DDDCD3] pb-6">
        <div className="space-y-2 max-w-2xl">
          {/* Eyebrow */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#527B7A]" />
            <span className="font-mono text-xs font-bold text-[#527B7A] tracking-widest uppercase">
              ISSUE COORDINATE REGISTRY
            </span>
          </div>

          {/* Title */}
          <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-bold tracking-tight">
            Report Locations
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base text-[#65736B] leading-relaxed">
            Explore the geographic locations of reported civic issues across your selected area.
          </p>
        </div>

        {/* Header Right Tactile Badges */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <div className="px-3 py-1.5 rounded-xl bg-white border border-[#DDDCD3] shadow-sm flex items-center gap-2 text-xs">
            <Crosshair className="w-3.5 h-3.5 text-[#527B7A]" />
            <span className="font-mono font-semibold text-[#293732]">WGS84</span>
            <span className="text-[#929B92]">•</span>
            <span className="text-[#65736B] text-[11px]">Decimal Degrees</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-white border border-[#DDDCD3] shadow-sm flex items-center gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
            <span className="font-semibold text-[#293732]">
              {currentWard?.wardLabel || 'Ward Area'}
            </span>
            <span className="text-[11px] font-mono text-[#65736B]">
              ({filteredRecords.length} records)
            </span>
          </div>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Registered Coordinates */}
        <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.04),0_1px_3px_rgba(41,55,50,0.02)] flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <div className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1">
              {stats.total}
            </div>
            <div className="text-xs text-[#65736B] font-medium">
              Registered Locations
            </div>
          </div>
        </div>

        {/* Card 2: Active Defects */}
        <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.04),0_1px_3px_rgba(41,55,50,0.02)] flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] flex items-center justify-center text-[#B68B63] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-mono font-bold text-2xl text-[#B68B63] leading-none mb-1">
              {stats.active}
            </div>
            <div className="text-xs text-[#65736B] font-medium">
              Active Issues
            </div>
          </div>
        </div>

        {/* Card 3: Resolved */}
        <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.04),0_1px_3px_rgba(41,55,50,0.02)] flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4] flex items-center justify-center text-[#537C60] shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-mono font-bold text-2xl text-[#537C60] leading-none mb-1">
              {stats.resolved}
            </div>
            <div className="text-xs text-[#65736B] font-medium">
              Resolved Defects
            </div>
          </div>
        </div>

        {/* Card 4: Precision Standard */}
        <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.04),0_1px_3px_rgba(41,55,50,0.02)] flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="font-mono font-bold text-lg text-[#293732] leading-none mb-1">
              6 Decimals
            </div>
            <div className="text-xs text-[#65736B] font-medium">
              Precision (~0.1m ground)
            </div>
          </div>
        </div>
      </div>

      {/* Control Toolbar: Scope Switcher + Search + Filters */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scope Toggle: Area Registry vs My Submissions */}
          <div className="flex items-center gap-1.5 bg-[#FAF9F5] p-1 rounded-xl border border-[#DDDCD3] self-start">
            <button
              type="button"
              onClick={() => setScope('area')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                scope === 'area'
                  ? 'bg-white text-[#293732] font-semibold shadow-sm border border-[#DDDCD3]'
                  : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>Area Issues</span>
              {currentWard && (
                <span className="font-mono text-[10px] text-[#527B7A] bg-[#E5E9E3] px-1.5 py-0.5 rounded-md">
                  {currentWard.code || currentWard.wardNumber || 'Ward'}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setScope('my_reports')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                scope === 'my_reports'
                  ? 'bg-white text-[#293732] font-semibold shadow-sm border border-[#DDDCD3]'
                  : 'text-[#65736B] hover:text-[#293732]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>My Reported Locations</span>
              <span className="font-mono text-[10px] bg-[#FAF9F5] border border-[#DDDCD3] px-1.5 py-0.5 rounded-md text-[#65736B]">
                {initialUserReports.length}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#929B92] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by issue title, address, or coordinate..."
              className="w-full pl-9 pr-4 py-2 bg-[#FAF9F5] hover:bg-white focus:bg-white text-xs text-[#293732] placeholder-[#929B92] rounded-xl border border-[#DDDCD3] focus:border-[#527B7A] focus:outline-none focus:ring-2 focus:ring-[#527B7A]/20 transition-all font-body"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#929B92] hover:text-[#293732]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#DDDCD3]/60">
          <div className="flex items-center gap-1.5 text-xs text-[#65736B] mr-1">
            <Filter className="w-3.5 h-3.5 text-[#527B7A]" />
            <span className="font-medium">Filter Category:</span>
          </div>

          {/* All Categories Pill */}
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-[#355858] text-white font-semibold shadow-sm'
                : 'bg-[#FAF9F5] text-[#65736B] hover:text-[#293732] border border-[#DDDCD3]'
            }`}
          >
            All Categories ({sourceRecords.length})
          </button>

          {/* Distinct Categories with Count */}
          {Object.entries(categoryStyles).map(([catKey, style]) => {
            const count = sourceRecords.filter((r) => r.category === catKey).length;
            if (count === 0 && selectedCategory !== catKey) return null;
            const isSelected = selectedCategory === catKey;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : catKey)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#355858] text-white font-semibold shadow-sm'
                    : 'bg-[#FAF9F5] text-[#65736B] hover:text-[#293732] border border-[#DDDCD3]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isSelected ? '#FFFFFF' : style.dot }}
                />
                <span>{style.label}</span>
                <span className="font-mono text-[10px] opacity-80">({count})</span>
              </button>
            );
          })}

          {/* Status Filter Dropdown / Reset */}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs bg-[#FAF9F5] text-[#293732] border border-[#DDDCD3] rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#527B7A] cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="RESOLVED">Resolved / Fixed</option>
              <option value="DISPUTED">Disputed</option>
            </select>

            {(selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSelectedStatus('ALL');
                  setSearchTerm('');
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#527B7A] hover:text-[#355858] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Coordinate Registry Table */}
      <div className="bg-white rounded-2xl border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-center text-[#929B92] mx-auto">
              <Crosshair className="w-6 h-6" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#293732]">
              {scope === 'my_reports' && initialUserReports.length === 0
                ? 'No Personal Reports Submitted Yet'
                : 'No Matching Coordinate Records'}
            </h3>
            <p className="text-xs text-[#65736B] max-w-md mx-auto leading-relaxed">
              {scope === 'my_reports' && initialUserReports.length === 0
                ? 'Reports you submit through CivicPulse will log their geographic GPS coordinates here.'
                : 'No registered locations match your active filter criteria. Try adjusting the search term or category filter.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              {scope === 'my_reports' && (
                <button
                  type="button"
                  onClick={() => setScope('area')}
                  className="px-4 py-2 rounded-xl bg-[#355858] text-white text-xs font-semibold hover:bg-[#2A4848] transition-colors cursor-pointer"
                >
                  View Area Issue Coordinates
                </button>
              )}
              {(selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setSelectedStatus('ALL');
                    setSearchTerm('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-[#293732] text-xs font-semibold hover:bg-[#E5E9E3] transition-colors cursor-pointer"
                >
                  Reset All Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9F5] border-b border-[#DDDCD3] text-[10px] font-mono font-bold uppercase tracking-wider text-[#65736B]">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 min-w-[280px]">Issue Details</th>
                  <th className="py-3 px-4 min-w-[140px]">Latitude</th>
                  <th className="py-3 px-4 min-w-[140px]">Longitude</th>
                  <th className="py-3 px-4 min-w-[120px]">Status</th>
                  <th className="py-3 px-4 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDDCD3]/60 text-xs">
                {filteredRecords.map((record, index) => {
                  const catStyle = categoryStyles[record.category] || categoryStyles.OTHER;
                  const statusBadge = getStatusBadge(record.status);
                  const latStr = record.latitude.toFixed(6);
                  const lngStr = record.longitude.toFixed(6);
                  const coordKey = `${record.id}-pair`;
                  const latKey = `${record.id}-lat`;
                  const lngKey = `${record.id}-lng`;

                  return (
                    <tr
                      key={record.id}
                      className="group hover:bg-[#FAF9F5]/70 transition-colors"
                    >
                      {/* Number (#) */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-[#929B92]">
                        <span className="w-7 h-7 rounded-lg bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-center mx-auto group-hover:border-[#527B7A]/40 group-hover:text-[#355858] transition-colors">
                          {index + 1}
                        </span>
                      </td>

                      {/* Issue */}
                      <td className="py-3.5 px-4 min-w-[280px]">
                        <div className="space-y-1">
                          <Link
                            href={`/issue/${record.issueId}`}
                            className="font-display font-semibold text-sm text-[#293732] hover:text-[#527B7A] transition-colors line-clamp-1 inline-flex items-center gap-1.5"
                          >
                            <span>{record.title}</span>
                            <ArrowUpRight className="w-3 h-3 text-[#929B92] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </Link>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Category Chip */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border uppercase tracking-wider ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                            >
                              {catStyle.label}
                            </span>

                            {/* Address / Location */}
                            {record.address && (
                              <span className="text-[11px] text-[#65736B] truncate max-w-[220px]">
                                {record.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Latitude */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleCopy(latStr, latKey)}
                          title="Click to copy latitude"
                          className="group/coord inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] hover:border-[#527B7A]/40 transition-all font-mono text-xs font-semibold tabular-nums text-[#293732] cursor-pointer"
                        >
                          <span>{latStr}°</span>
                          {copiedCoord === latKey ? (
                            <Check className="w-3 h-3 text-[#537C60]" />
                          ) : (
                            <Copy className="w-3 h-3 text-[#929B92] group-hover/coord:text-[#527B7A] opacity-60 group-hover/coord:opacity-100 transition-opacity" />
                          )}
                        </button>
                      </td>

                      {/* Longitude */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleCopy(lngStr, lngKey)}
                          title="Click to copy longitude"
                          className="group/coord inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] hover:border-[#527B7A]/40 transition-all font-mono text-xs font-semibold tabular-nums text-[#293732] cursor-pointer"
                        >
                          <span>{lngStr}°</span>
                          {copiedCoord === lngKey ? (
                            <Check className="w-3 h-3 text-[#537C60]" />
                          ) : (
                            <Copy className="w-3 h-3 text-[#929B92] group-hover/coord:text-[#527B7A] opacity-60 group-hover/coord:opacity-100 transition-opacity" />
                          )}
                        </button>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Locate on Map */}
                          <Link
                            href={`/citizen/map?lat=${record.latitude}&lng=${record.longitude}`}
                            title="Locate on Interactive Map"
                            className="p-1.5 rounded-lg text-[#65736B] hover:text-[#527B7A] hover:bg-[#E5E9E3] transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </Link>

                          {/* Inspect Issue Details */}
                          <Link
                            href={`/issue/${record.issueId}`}
                            title="Open Issue Dossier"
                            className="p-1.5 rounded-lg text-[#65736B] hover:text-[#527B7A] hover:bg-[#E5E9E3] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>

                          {/* Quick Copy Coordinates */}
                          <button
                            type="button"
                            onClick={() => handleCopy(`${latStr}, ${lngStr}`, coordKey)}
                            title="Copy coordinate pair (lat, lng)"
                            className="p-1.5 rounded-lg text-[#65736B] hover:text-[#527B7A] hover:bg-[#E5E9E3] transition-colors cursor-pointer"
                          >
                            {copiedCoord === coordKey ? (
                              <Check className="w-3.5 h-3.5 text-[#537C60]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer Summary */}
        <div className="p-4 bg-[#FAF9F5] border-t border-[#DDDCD3] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#65736B]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#293732]">
              Showing {filteredRecords.length} of {sourceRecords.length} location records
            </span>
            <span className="text-[#929B92]">•</span>
            <span>Georeferenced via PostGIS</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/citizen/map"
              className="text-xs font-semibold text-[#527B7A] hover:text-[#355858] flex items-center gap-1 transition-colors"
            >
              <span>Explore All on Interactive Map</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Raw Coordinate Export Section (Civic Atlas Styling) */}
      {filteredRecords.length > 0 && (
        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD3]/60 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Copy className="w-4 h-4 text-[#527B7A]" />
                <h3 className="font-display font-bold text-lg text-[#293732] tracking-tight">
                  Coordinate Export Ledger
                </h3>
              </div>
              <p className="text-xs text-[#65736B]">
                WGS84 decimal degree coordinates formatted for municipal GIS dispatch and surveyor audits.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyAll}
              className="px-4 py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] active:bg-[#DDDCD3] border border-[#DDDCD3] text-[#293732] text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm self-start sm:self-auto"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#537C60]" />
                  <span className="text-[#537C60]">Copied All Coordinates!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#527B7A]" />
                  <span>Copy Coordinate Ledger</span>
                </>
              )}
            </button>
          </div>

          {/* Formatted Text Box */}
          <div className="relative">
            <pre className="p-4 bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl font-mono text-[11px] leading-relaxed text-[#293732] overflow-x-auto max-h-64 custom-scrollbar selection:bg-[#D4E3DF]">
              {exportText}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}

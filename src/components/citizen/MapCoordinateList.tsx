'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Copy,
  Check,
  Search,
  ArrowUpRight,
  ExternalLink,
  RotateCcw,
  Map as MapIcon,
  List as ListIcon,
  Crosshair,
  AlertTriangle,
  Loader2,
  Inbox,
} from 'lucide-react';
import {
  getMapStatusMeta,
  MAP_STATUS_FILTER_OPTIONS,
} from '@/lib/map/statusPresentation';
import type { IssueItem } from './IssuesNearMeMap';
import type { WardContextItem, WardPagination } from '@/context/GeoContext';

const PRIORITY_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

interface MapCoordinateListProps {
  currentWard: WardContextItem | null;
  issues: IssueItem[];
  totalWardIssues: number;
  pagination?: WardPagination;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedPriority: string;
  onPriorityChange: (prio: string) => void;
  categoryFilters: Array<{ id: string; label: string; count: number; color: string }>;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onSwitchToMap: () => void;
  onLocateOnMap: (issue: IssueItem) => void;
  onRefresh: () => void;
  onLoadMore?: () => Promise<void>;
}

export function MapCoordinateList({
  currentWard,
  issues,
  totalWardIssues,
  pagination,
  isLoading,
  error,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedStatus,
  onStatusChange,
  selectedPriority,
  onPriorityChange,
  categoryFilters,
  onClearFilters,
  hasActiveFilters,
  onSwitchToMap,
  onLocateOnMap,
  onRefresh,
  onLoadMore,
}: MapCoordinateListProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    setCopyError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopyError('Unable to copy to clipboard. Check browser clipboard permissions.');
    }
  };

  const exportText = useMemo(() => {
    const scopeLabel = currentWard?.fullName || currentWard?.wardLabel || 'Selected Ward';
    const filterNote = [
      selectedCategory !== 'ALL' ? `Category=${selectedCategory}` : null,
      selectedStatus !== 'ALL' ? `Status=${selectedStatus}` : null,
      selectedPriority !== 'ALL' ? `Priority=${selectedPriority}` : null,
      searchQuery.trim() ? `Search="${searchQuery.trim()}"` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'None';

    const header = [
      '// CIVIC ATLAS — ISSUE COORDINATE REGISTRY',
      '// Datum: WGS84 (Decimal Degrees)',
      `// Ward: ${scopeLabel}`,
      `// Filters: ${filterNote}`,
      `// Exported Records: ${issues.length}${pagination?.hasMore ? ` (loaded subset of ${pagination.total} total ward matches)` : ''}`,
      '--------------------------------------------------------------------------------',
    ].join('\n');

    const rows = issues
      .map((r, i) => {
        const idx = String(i + 1).padStart(3, '0');
        const lat = r.lat.toFixed(6);
        const lng = r.lng.toFixed(6);
        const addr = r.location || 'Ward location';
        return `[${idx}] ${r.id} | ${r.category} | ${r.title} | ${addr} -> ${lat}, ${lng} [${r.status} | ${r.priority}]`;
      })
      .join('\n');

    return `${header}\n${rows}`;
  }, [issues, currentWard, selectedCategory, selectedStatus, selectedPriority, searchQuery, pagination]);

  const handleCopyAll = async () => {
    setCopyError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(exportText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      setCopyError('Failed to copy coordinate ledger to clipboard.');
    }
  };

  return (
    <div
      data-testid="map-list-view"
      className="flex-1 overflow-y-auto bg-[#F3F2EB] p-4 sm:p-6 lg:p-8 pb-24 lg:pb-12"
    >
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Top Bar with Mode Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DDDCD3] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-[#527B7A]" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#527B7A]">
                Coordinate Registry & List View
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#293732] tracking-tight">
              {currentWard?.fullName || 'Ward Issues'}
            </h1>
            <p className="text-xs sm:text-sm text-[#65736B]">
              Browse, search, and export exact WGS84 decimal-degree coordinates for issues in the selected ward.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="inline-flex items-center p-1 rounded-xl bg-white border border-[#DDDCD3] shadow-xs">
              <button
                type="button"
                data-testid="view-mode-map"
                onClick={onSwitchToMap}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-[#65736B] hover:text-[#293732] transition-colors cursor-pointer"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
              <button
                type="button"
                data-testid="view-mode-list"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#355858] text-white shadow-xs cursor-default"
              >
                <ListIcon className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>
          </div>
        </div>

        {/* Shared Search & Filter Toolbar */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-[#929B92] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                data-testid="list-search-input"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search issue title, address, notes, category, or coordinates..."
                className="w-full pl-9 pr-4 py-2 bg-[#FAF9F5] hover:bg-white focus:bg-white text-xs text-[#293732] placeholder-[#929B92] rounded-xl border border-[#DDDCD3] focus:border-[#527B7A] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter by status"
                value={selectedStatus}
                onChange={(e) => onStatusChange(e.target.value)}
                className="text-xs bg-[#FAF9F5] text-[#293732] border border-[#DDDCD3] rounded-xl px-3 py-2 focus:outline-none focus:border-[#527B7A] cursor-pointer"
              >
                {MAP_STATUS_FILTER_OPTIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                {PRIORITY_FILTERS.map((prio) => (
                  <button
                    key={prio}
                    type="button"
                    onClick={() => onPriorityChange(prio)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      selectedPriority === prio
                        ? 'bg-[#355858] text-white border-[#355858]'
                        : 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                    }`}
                  >
                    {prio === 'ALL' ? 'All Priority' : prio}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#527B7A] hover:bg-[#FAF9F5] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[#DDDCD3]/60">
            {categoryFilters.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onCategoryChange(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#355858] text-white border-[#355858]'
                      : 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                  }`}
                >
                  {cat.id !== 'ALL' && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: active ? '#FFFFFF' : cat.color }}
                    />
                  )}
                  <span>{cat.label}</span>
                  <span className="font-mono text-[10px] opacity-80">({cat.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-white border border-red-300 text-xs text-red-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {copyError && (
          <div className="p-3 rounded-xl bg-[#FBF1EF] border border-[#EAC8C1] text-xs text-[#B76F60]">
            {copyError}
          </div>
        )}

        {pagination?.hasMore && hasActiveFilters && (
          <div className="px-4 py-2.5 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] text-xs text-[#B68B63]">
            Filtering {totalWardIssues} loaded of {pagination.total} ward issues. Use Load More below to search all records.
          </div>
        )}

        {/* Coordinate Registry Table */}
        <div className="bg-white rounded-2xl border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] overflow-hidden">
          {isLoading && issues.length === 0 ? (
            <div className="p-12 space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-[#65736B]">
                <Loader2 className="w-4 h-4 animate-spin text-[#527B7A]" />
                <span>Loading coordinate records...</span>
              </div>
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 rounded-xl bg-[#FAF9F5] animate-pulse" />
              ))}
            </div>
          ) : issues.length === 0 ? (
            <div className="p-14 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-center text-[#929B92] mx-auto">
                <Inbox className="w-5 h-5" />
              </div>
              <h3 className="font-display font-semibold text-base text-[#293732]">
                No Matching Coordinate Records
              </h3>
              <p className="text-xs text-[#65736B] max-w-md mx-auto">
                {hasActiveFilters
                  ? 'No registered locations match your active search, category, status, or priority filters.'
                  : 'No civic issues are currently registered in this ward.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="px-4 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs font-semibold text-[#355858] hover:bg-[#E5E9E3] cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF9F5] border-b border-[#DDDCD3] text-[10px] font-mono font-bold uppercase tracking-wider text-[#65736B]">
                    <th className="py-3 px-3">Issue ID</th>
                    <th className="py-3 px-3 min-w-[180px]">Title</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 min-w-[160px]">Address / Location</th>
                    <th className="py-3 px-3">Latitude</th>
                    <th className="py-3 px-3">Longitude</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Priority</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDDCD3]/60">
                  {issues.map((record, idx) => {
                    const statusMeta = getMapStatusMeta(record.status);
                    const latStr = record.lat.toFixed(6);
                    const lngStr = record.lng.toFixed(6);
                    const shortId = record.id.startsWith('CP-')
                      ? record.id
                      : `CP-${record.id.slice(-4).toUpperCase()}`;

                    return (
                      <tr key={record.id} className="hover:bg-[#FAF9F5]/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-[#355858] whitespace-nowrap">
                          <span className="text-[#929B92] mr-1.5">#{idx + 1}</span>
                          {shortId}
                        </td>
                        <td className="py-3 px-3 font-semibold text-[#293732]">
                          <Link
                            href={`/issue/${record.id}`}
                            className="hover:text-[#527B7A] inline-flex items-center gap-1"
                          >
                            <span className="line-clamp-1">{record.title}</span>
                            <ArrowUpRight className="w-3 h-3 shrink-0 text-[#929B92]" />
                          </Link>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#527B7A] whitespace-nowrap">
                          {record.category.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 px-3 text-[#65736B] max-w-[220px] truncate">
                          {record.location}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleCopy(latStr, `${record.id}-lat`)}
                            title="Copy latitude"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] font-mono text-[11px] font-semibold text-[#293732] cursor-pointer"
                          >
                            <span>{latStr}°</span>
                            {copiedKey === `${record.id}-lat` ? (
                              <Check className="w-3 h-3 text-[#537C60]" />
                            ) : (
                              <Copy className="w-3 h-3 text-[#929B92]" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleCopy(lngStr, `${record.id}-lng`)}
                            title="Copy longitude"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] font-mono text-[11px] font-semibold text-[#293732] cursor-pointer"
                          >
                            <span>{lngStr}°</span>
                            {copiedKey === `${record.id}-lng` ? (
                              <Check className="w-3 h-3 text-[#537C60]" />
                            ) : (
                              <Copy className="w-3 h-3 text-[#929B92]" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                            style={{
                              backgroundColor: statusMeta.badgeBg,
                              color: statusMeta.badgeText,
                              borderColor: statusMeta.badgeBorder,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-[11px] text-[#293732] whitespace-nowrap">
                          {record.priority}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onLocateOnMap(record)}
                              title="Locate on Interactive Map"
                              className="p-1.5 rounded-lg text-[#65736B] hover:text-[#527B7A] hover:bg-[#E5E9E3] cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                            </button>
                            <Link
                              href={`/issue/${record.id}`}
                              title="Open Issue Dossier"
                              className="p-1.5 rounded-lg text-[#65736B] hover:text-[#527B7A] hover:bg-[#E5E9E3]"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleCopy(`${latStr}, ${lngStr}`, `${record.id}-pair`)}
                              title="Copy coordinate pair"
                              className="p-1.5 rounded-lg text-[#65736B] hover:text-[#527B7A] hover:bg-[#E5E9E3] cursor-pointer"
                            >
                              {copiedKey === `${record.id}-pair` ? (
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

          {/* Footer & Pagination */}
          <div className="p-4 bg-[#FAF9F5] border-t border-[#DDDCD3] flex flex-wrap items-center justify-between gap-3 text-xs text-[#65736B]">
            <span>
              Showing <strong>{issues.length}</strong> of{' '}
              <strong>{pagination?.total ?? totalWardIssues}</strong> ward records (WGS84 decimal degrees)
            </span>
            {pagination?.hasMore && onLoadMore && (
              <button
                type="button"
                onClick={() => void onLoadMore()}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#E5E9E3] border border-[#DDDCD3] font-semibold text-[#355858] cursor-pointer"
              >
                Load More ({pagination.total - totalWardIssues} remaining)
              </button>
            )}
          </div>
        </div>

        {/* Coordinate Export Ledger */}
        {issues.length > 0 && (
          <section
            data-testid="coordinate-export-ledger"
            className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD3]/60 pb-4">
              <div className="space-y-1">
                <h2 className="font-display font-bold text-lg text-[#293732] tracking-tight">
                  Coordinate Export Ledger
                </h2>
                <p className="text-xs text-[#65736B]">
                  Exporting {issues.length} matching records
                  {pagination?.hasMore
                    ? ` (first ${totalWardIssues} of ${pagination.total} loaded — click Load More above to include more)`
                    : ''}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                className="px-4 py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#293732] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#537C60]" />
                    <span className="text-[#537C60]">Copied Coordinate Ledger!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#527B7A]" />
                    <span>Copy Coordinate Ledger</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl font-mono text-[11px] leading-relaxed text-[#293732] overflow-x-auto max-h-64">
              {exportText}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}

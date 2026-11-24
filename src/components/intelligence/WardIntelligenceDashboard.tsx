'use client';

import React, { useState, useEffect } from 'react';
import { useGeoContext } from '@/context/GeoContext';
import { 
  Loader2, 
  AlertTriangle 
} from 'lucide-react';
import type { WardIntelligenceData, TimePeriod } from '@/lib/intelligence/wardAnalytics';
import { WardOverviewMetricsSection } from './WardOverviewMetrics';
import { CategoryAnalysisSection } from './CategoryAnalysisSection';
import dynamic from 'next/dynamic';

const GeoIntelligenceMap = dynamic(
  () => import('./GeoIntelligenceMap').then((mod) => mod.GeoIntelligenceMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] rounded-3xl bg-[#E9ECE6] animate-pulse flex items-center justify-center text-xs font-mono text-[#65736B]">
        Loading Cartography Engine...
      </div>
    ),
  }
);

import { ResolutionPerformanceSection } from './ResolutionPerformanceSection';
import { RecurringIssuesSection } from './RecurringIssuesSection';
import { HistoricalTrendsSection } from './HistoricalTrendsSection';
import { AiWardBriefingCard } from './AiWardBriefingCard';
import { AgencyPerformanceSection } from './AgencyPerformanceSection';
import { WardComparisonSection } from './WardComparisonSection';

interface Props {
  role?: 'CITIZEN' | 'AUTHORITY';
}

export function WardIntelligenceDashboard({ role: propRole }: Props) {
  const { currentWard, role: contextRole, availableWards, selectWard } = useGeoContext();
  const effectiveRole = propRole || contextRole || 'CITIZEN';

  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [data, setData] = useState<WardIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    if (!currentWard) return;

    const runFetch = async () => {
      try {
        const wardParam = currentWard.code || currentWard.id;
        const res = await fetch(`/api/ward/intelligence?ward=${encodeURIComponent(wardParam)}&period=${period}`);

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Failed to retrieve ward intelligence (${res.status})`);
        }

        const resData: WardIntelligenceData = await res.json();
        if (!cancelled) {
          setData(resData);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to retrieve ward intelligence records';
          console.warn('Ward intelligence fetch error:', err);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Trigger async execution
    void runFetch();

    return () => {
      cancelled = true;
    };
  }, [currentWard, period, refreshKey]);

  const handleSelectWardFromComparison = (wardCode: string) => {
    const found = availableWards.find(
      (w) => w.code.toLowerCase() === wardCode.toLowerCase() || w.id === wardCode
    );
    if (found) {
      selectWard(found);
    }
  };

  if (!currentWard && loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#527B7A]" />
        <span className="text-xs font-mono tracking-wider uppercase text-[#65736B]">
          Resolving Geographical Ward Context...
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3F2EB] p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-2xl bg-white border border-red-200 shadow-sm flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRetry}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state indicator */}
      {loading && !data && (
        <div className="p-16 text-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-[#527B7A] mx-auto" />
          <div className="text-xs font-medium text-[#65736B]">
            Loading infrastructure analytics for {currentWard?.fullName || 'Ward'}...
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Section A: Ward Overview & Core Metrics */}
          <WardOverviewMetricsSection
            metrics={data.overview}
            wardName={data.ward.name}
            wardLabel={data.ward.wardLabel}
            latestIssueDate={data.latestIssueDate}
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            lastRefreshedAt={data.lastRefreshedAt}
          />

          {/* Section H: AI Ward Briefing & Action Recommendations */}
          <AiWardBriefingCard
            briefing={data.wardBriefing}
            wardName={data.ward.name}
          />

          {/* Section C: Large Interactive Geographical Intelligence Map */}
          <GeoIntelligenceMap
            ward={data.ward}
            hotspots={data.geoIntelligence.hotspots}
            issuesGeo={data.geoIntelligence.issuesGeo}
            selectedCategory={selectedCategory}
          />

          {/* Section B: Category-Wise Issue Analysis */}
          <CategoryAnalysisSection
            categories={data.categoryAnalysis}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            totalIssues={data.overview.totalIssues}
          />

          {/* Section D: Resolution Performance */}
          <ResolutionPerformanceSection
            metrics={data.resolutionPerformance}
            wardName={data.ward.name}
          />

          {/* Section E: Recurring Infrastructure Problems & Hotspots */}
          <RecurringIssuesSection
            hotspots={data.recurringAnalysis.flaggedHotspots}
            wardName={data.ward.name}
          />

          {/* Section F: Historical Trends */}
          <HistoricalTrendsSection
            trends={data.historicalTrends}
            wardName={data.ward.name}
          />

          {/* Section G: Agency Performance (Authority Only) */}
          {effectiveRole === 'AUTHORITY' && data.authorityOnly && (
            <AgencyPerformanceSection
              agencies={data.authorityOnly.agencyPerformance}
              wardName={data.ward.name}
            />
          )}

          {/* Section I: Ward Comparison (Authority Only) */}
          {effectiveRole === 'AUTHORITY' && data.authorityOnly && (
            <WardComparisonSection
              comparison={data.authorityOnly.wardComparison}
              onSelectWard={handleSelectWardFromComparison}
            />
          )}
        </>
      )}
    </div>
  );
}

export default WardIntelligenceDashboard;

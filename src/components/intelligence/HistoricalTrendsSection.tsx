'use client';

import React from 'react';
import { LineChart as LineChartIcon } from 'lucide-react';
import type { TrendTimeBucket } from '@/lib/intelligence/wardAnalytics';

interface Props {
  trends: {
    interval: 'daily' | 'weekly' | 'monthly';
    timeBuckets: TrendTimeBucket[];
  };
  wardName: string;
}

export function HistoricalTrendsSection({ trends, wardName }: Props) {
  const { timeBuckets, interval } = trends;
  const maxVolume = Math.max(1, ...timeBuckets.map((b) => Math.max(b.newReports, b.verifiedRepairs, b.backlog)));

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <LineChartIcon className="w-4 h-4 text-[#527B7A]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              Historical Infrastructure Trends
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Temporal cadence of new ground reports versus verified resolutions for {wardName} ({interval} intervals).
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs self-start sm:self-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#527B7A]" />
            <span className="text-[#65736B]">New Reports</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#537C60]" />
            <span className="text-[#65736B]">Verified Fixed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#B76F60]" />
            <span className="text-[#65736B]">SLA Breaches</span>
          </div>
        </div>
      </div>

      {timeBuckets.length === 0 ? (
        <div className="p-6 text-center text-xs text-[#65736B]">
          Insufficient historical records available for this selected window.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Timeline Bar Visualizer */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
            {timeBuckets.map((b, idx) => {
              const reportH = Math.max(8, (b.newReports / maxVolume) * 90);
              const resolvedH = Math.max(8, (b.verifiedRepairs / maxVolume) * 90);

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] flex flex-col justify-between hover:bg-[#F3F2EB]/60 transition-colors"
                >
                  <div className="text-[11px] font-mono font-bold text-[#293732] border-b border-[#DDDCD3]/60 pb-1 mb-3 text-center">
                    {b.label}
                  </div>

                  {/* Dual Bar Representation */}
                  <div className="h-28 flex items-end justify-center gap-2 px-2 pb-2">
                    {/* New Reports Bar */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-[10px] font-mono text-[#527B7A] font-bold">
                        {b.newReports}
                      </span>
                      <div
                        style={{ height: `${reportH}px` }}
                        className="w-full bg-[#527B7A] rounded-t-md transition-all duration-300"
                        title={`New reports: ${b.newReports}`}
                      />
                    </div>

                    {/* Verified Repairs Bar */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-[10px] font-mono text-[#537C60] font-bold">
                        {b.verifiedRepairs}
                      </span>
                      <div
                        style={{ height: `${resolvedH}px` }}
                        className="w-full bg-[#537C60] rounded-t-md transition-all duration-300"
                        title={`Verified fixed: ${b.verifiedRepairs}`}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#DDDCD3]/60 text-center text-[10px] text-[#65736B] font-mono">
                    Backlog: <span className="font-bold text-[#293732]">{b.backlog}</span>
                    {b.slaBreaches > 0 && (
                      <span className="text-[#B76F60] ml-1">({b.slaBreaches} breach)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

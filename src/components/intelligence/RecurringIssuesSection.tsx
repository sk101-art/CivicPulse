'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Repeat, 
  MapPin, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import type { FlaggedRecurringHotspot } from '@/lib/intelligence/wardAnalytics';

interface Props {
  hotspots: FlaggedRecurringHotspot[];
  wardName: string;
  role?: 'CITIZEN' | 'AUTHORITY';
}

export function RecurringIssuesSection({ hotspots, wardName, role = 'CITIZEN' }: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-[#B76F60]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              Recurring Infrastructure Problems & Hotspots
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Defect locations that repeatedly fail or deteriorate despite previous municipal interventions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <span className="px-3 py-1 rounded-full bg-[#FAF0EE] border border-[#F3D2CC] text-xs font-mono font-bold text-[#B76F60]">
            {hotspots.length} Flagged Corridors
          </span>
          {role === 'CITIZEN' && (
            <Link
              href="/citizen/map"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-xs font-semibold text-[#355858] transition-colors"
            >
              <span>Explore all issues on Map View</span>
              <ExternalLink className="w-3 h-3 text-[#527B7A]" />
            </Link>
          )}
        </div>
      </div>

      {hotspots.length === 0 ? (
        <div className="p-8 text-center bg-[#FAF9F5] rounded-xl border border-[#DDDCD3] space-y-2">
          <div className="w-10 h-10 rounded-full bg-[#EFF6F1] border border-[#CFE4D4] text-[#537C60] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <h4 className="font-semibold text-sm text-[#293732]">No Chronic Recurring Hotspots Detected</h4>
          <p className="text-xs text-[#65736B] max-w-md mx-auto">
            No locations in {wardName} currently meet the geographical and temporal criteria for chronic recurring defects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hotspots.map((h) => {
            const isWarranty = h.recurrenceType === 'WARRANTY_BREACH';
            const isMulti = h.recurrenceType === 'MULTI_CATEGORY_CONVERGENCE';

            const badgeBg = isWarranty ? 'bg-[#FBF0EF] text-[#9E3B2D] border-[#F1CCC8]' : isMulti ? 'bg-[#F0F5F8] text-[#718F9E] border-[#D4E2E9]' : 'bg-[#FDF7F0] text-[#B68B63] border-[#F2DFCA]';

            return (
              <div
                key={h.id}
                className="p-4 rounded-xl border border-[#DDDCD3] bg-[#FAF9F5] hover:bg-[#F3F2EB]/50 transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border uppercase tracking-wider ${badgeBg}`}>
                      {h.typeLabel}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-[#65736B]">
                      {h.issueCount} registered reports
                    </span>
                  </div>

                  <h3 className="font-display font-semibold text-sm text-[#293732] line-clamp-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#527B7A] shrink-0" />
                    <span>{h.location}</span>
                  </h3>

                  <p className="text-xs text-[#65736B] mt-2 leading-relaxed bg-white p-2.5 rounded-lg border border-[#DDDCD3]/60">
                    <strong className="text-[#293732] font-semibold">Evidence: </strong>
                    {h.evidenceSummary}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#DDDCD3]/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#65736B]">Deterioration Score:</span>
                    <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${h.deteriorationScore > 70 ? 'bg-[#FAF0EE] text-[#B76F60]' : 'bg-[#EAECE6] text-[#293732]'}`}>
                      {h.deteriorationScore}/100
                    </span>
                  </div>

                  <span className="text-[10px] text-[#929B92] font-mono">
                    Active since {new Date(h.firstReportedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

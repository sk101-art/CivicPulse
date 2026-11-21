'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import type { AgencyPerformanceItem } from '@/lib/intelligence/wardAnalytics';

interface Props {
  agencies: AgencyPerformanceItem[];
  wardName: string;
}

export function AgencyPerformanceSection({ agencies, wardName }: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#527B7A]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              Agency & Operational Jurisdiction Performance
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Turnaround velocity, SLA compliance and resolution efficacy in {wardName} broken down by executing agency.
          </p>
        </div>

        <span className="px-3 py-1 rounded-full bg-[#E5E9E3] text-[#355858] text-xs font-mono font-bold self-start sm:self-auto border border-[#C2D7D1]">
          Authority Staff Only
        </span>
      </div>

      {agencies.length === 0 ? (
        <div className="p-6 text-center text-xs text-[#65736B] bg-[#FAF9F5] rounded-xl border border-[#DDDCD3]">
          No agency work orders registered in this geographical area.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#DDDCD3] text-[#65736B] font-mono uppercase text-[10px] tracking-wider bg-[#FAF9F5]">
                <th className="py-2.5 px-3 rounded-l-lg">Agency</th>
                <th className="py-2.5 px-3">Assigned / In Progress</th>
                <th className="py-2.5 px-3">Verified Fixed</th>
                <th className="py-2.5 px-3">Avg Resolution</th>
                <th className="py-2.5 px-3">SLA Compliance</th>
                <th className="py-2.5 px-3 rounded-r-lg">Disputed Claims</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDDCD3]/60">
              {agencies.map((ag) => (
                <tr key={ag.agencyId} className="hover:bg-[#FAF9F5] transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#293732]">{ag.agencyName}</div>
                    <div className="text-[10px] font-mono text-[#527B7A]">Code: {ag.agencyCode} • ({ag.sampleSize} reports)</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-mono font-semibold text-[#B68B63]">
                      {ag.assignedCount + ag.inProgressCount} active
                    </span>
                    <span className="text-[10px] text-[#929B92] block">({ag.inProgressCount} in progress)</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-mono font-bold text-[#537C60]">
                      {ag.verifiedResolutionsCount}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[#293732]">
                    {ag.avgResolutionHours !== null ? `${ag.avgResolutionHours} hrs` : 'N/A'}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-[#EAECE6] overflow-hidden">
                        <div
                          style={{ width: `${ag.slaComplianceRate}%` }}
                          className={`h-full rounded-full ${
                            ag.slaComplianceRate >= 90 ? 'bg-[#537C60]' : ag.slaComplianceRate >= 70 ? 'bg-[#B68B63]' : 'bg-[#B76F60]'
                          }`}
                        />
                      </div>
                      <span className="font-mono font-bold text-[11px] text-[#293732]">
                        {ag.slaComplianceRate}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {ag.disputedCount > 0 ? (
                      <span className="font-mono font-bold text-[#B76F60] bg-[#FAF0EE] px-2 py-0.5 rounded border border-[#F3D2CC]">
                        {ag.disputedCount} disputed
                      </span>
                    ) : (
                      <span className="text-[#929B92] font-mono">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

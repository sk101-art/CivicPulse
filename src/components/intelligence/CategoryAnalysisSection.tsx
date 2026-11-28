'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, CheckCircle2, Clock, AlertTriangle, ArrowRight, X } from 'lucide-react';
import type { CategoryMetric } from '@/lib/intelligence/wardAnalytics';

interface Props {
  categories: CategoryMetric[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  totalIssues: number;
  role?: 'CITIZEN' | 'AUTHORITY';
}

export function CategoryAnalysisSection({
  categories,
  selectedCategory,
  onSelectCategory,
  totalIssues,
  role = 'CITIZEN',
}: Props) {
  const selectedMeta = selectedCategory !== 'ALL'
    ? categories.find((c) => c.category === selectedCategory) || null
    : null;
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#527B7A]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              Category-Wise Defect Distribution
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Breakdown across all 12 registered municipal infrastructure classifications.
          </p>
        </div>

        {/* Category Filter Chips Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => onSelectCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-[#355858] text-white font-semibold shadow-sm'
                : 'bg-[#FAF9F5] text-[#65736B] hover:text-[#293732] border border-[#DDDCD3]'
            }`}
          >
            All Categories ({totalIssues})
          </button>
          {categories.filter(c => c.count > 0).slice(0, 5).map((cat) => {
            const isSelected = selectedCategory === cat.category;
            return (
              <button
                key={cat.category}
                type="button"
                onClick={() => onSelectCategory(isSelected ? 'ALL' : cat.category)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-[#355858] text-white font-semibold shadow-sm'
                    : 'bg-[#FAF9F5] text-[#65736B] hover:text-[#293732] border border-[#DDDCD3]'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? '#FFFFFF' : cat.color }} />
                <span>{cat.label}</span>
                <span className="font-mono text-[10px] opacity-80">({cat.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Category Feedback Banner */}
      {selectedMeta && (
        <div
          data-testid="selected-category-banner"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#F2F6F5] border border-[#C2D7D1] text-xs"
        >
          <div className="flex items-center gap-2 text-[#293732]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedMeta.color }} />
            <span>
              Selected: <strong>{selectedMeta.label}</strong> ({selectedMeta.count} {selectedMeta.count === 1 ? 'issue' : 'issues'}, {selectedMeta.activeCount} active, {selectedMeta.resolvedCount} verified fixed)
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {role === 'CITIZEN' && (
              <Link
                href={`/citizen/map?category=${selectedMeta.category}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#355858] text-white font-semibold hover:bg-[#2E5453] transition-colors"
              >
                <span>Explore {selectedMeta.label} on Map View</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => onSelectCategory('ALL')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-[#DDDCD3] text-[#65736B] hover:text-[#293732] cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}

      {/* Category Horizontal Comparison Table */}
      <div className="space-y-3">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.category;
          return (
            <div
              key={cat.category}
              onClick={() => onSelectCategory(isSelected ? 'ALL' : cat.category)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#F2F6F5] border-[#527B7A] shadow-sm'
                  : cat.count === 0
                    ? 'bg-[#FAF9F5]/60 border-[#E8E7DF] opacity-70 hover:opacity-100'
                    : 'bg-white hover:bg-[#FAF9F5] border-[#E8E7DF]'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5 min-w-[180px]">
                  <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs sm:text-sm font-semibold text-[#293732]">
                    {cat.label}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#65736B]">
                    {cat.count} {cat.count === 1 ? 'issue' : 'issues'}
                  </span>
                  <span className="text-[11px] font-mono text-[#929B92]">
                    ({cat.percentage}%)
                  </span>
                </div>

                {/* Sub-breakdown: Active vs Resolved & Priority distribution */}
                <div className="flex items-center gap-3 text-xs self-start sm:self-auto">
                  <div className="flex items-center gap-1 text-[#B68B63]">
                    <Clock className="w-3 h-3" />
                    <span>{cat.activeCount} active</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#537C60]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{cat.resolvedCount} fixed</span>
                  </div>
                  {cat.priorityBreakdown.critical > 0 && (
                    <div className="flex items-center gap-1 text-[#B76F60] font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{cat.priorityBreakdown.critical} critical</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Distribution Bar */}
              <div className="w-full h-2 rounded-full bg-[#EAECE6] overflow-hidden flex">
                <div
                  style={{
                    width: `${totalIssues > 0 ? (cat.count / totalIssues) * 100 : 0}%`,
                    backgroundColor: cat.color,
                  }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

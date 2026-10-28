import React from "react";
import { PriorityBreakdown as PriorityBreakdownType, SentenceFacts, PriorityBand } from "@/lib/priority";
import { PRIORITY_CONFIG } from "@/config/priority";

export interface PriorityBreakdownProps {
  priority: number;
  band: PriorityBand | string;
  breakdown?: PriorityBreakdownType | null;
  sentenceFacts?: SentenceFacts | null;
  piText?: string | null;
  className?: string;
}

export function PriorityBreakdown({
  priority,
  band,
  breakdown,
  sentenceFacts,
  piText,
  className = "",
}: PriorityBreakdownProps) {
  // Normalize band
  const normBand = (band || "LOW").toUpperCase() as PriorityBand;

  // Band chip styling
  const bandStyles: Record<PriorityBand, { chip: string; bg: string }> = {
    CRITICAL: {
      chip: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      bg: "border-rose-500/20 bg-rose-950/10",
    },
    HIGH: {
      chip: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      bg: "border-amber-500/20 bg-amber-950/10",
    },
    MEDIUM: {
      chip: "bg-sky-500/20 text-sky-300 border-sky-500/40",
      bg: "border-sky-500/20 bg-sky-950/10",
    },
    LOW: {
      chip: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
      bg: "border-white/10 bg-white/5",
    },
  };

  const currentBandStyle = bandStyles[normBand] || bandStyles.LOW;

  // Weighted factor contributions for the stacked bar
  const weights = PRIORITY_CONFIG.weights;
  const sContrib = breakdown ? breakdown.s * weights.severity : 0;
  const eContrib = breakdown ? breakdown.e * weights.exposure : 0;
  const vContrib = breakdown ? breakdown.v * weights.vulnerability : 0;
  const uContrib = breakdown ? breakdown.u * weights.usability : 0;
  const pContrib = breakdown ? breakdown.p * weights.persistence : 0;

  const coreSum = sContrib + eContrib + vContrib + uContrib + pContrib;
  const totalBase = coreSum > 0 ? coreSum : 1;

  const sPct = ((sContrib / totalBase) * 100).toFixed(1);
  const ePct = ((eContrib / totalBase) * 100).toFixed(1);
  const vPct = ((vContrib / totalBase) * 100).toFixed(1);
  const uPct = ((uContrib / totalBase) * 100).toFixed(1);
  const pPct = ((pContrib / totalBase) * 100).toFixed(1);

  // Template sentence built only from sentenceFacts / piText
  const templateSentence =
    sentenceFacts?.summary ||
    piText ||
    `${normBand} priority (${priority.toFixed(1)}) calculated across severity, exposure, vulnerability, usability, and persistence.`;

  return (
    <div
      data-testid="priority-breakdown"
      className={`rounded-2xl p-5 border ${currentBandStyle.bg} space-y-4 ${className}`}
    >
      {/* Top Header & Band Chip */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase text-white/50 tracking-wider block">
            Priority Index (PI)
          </span>
          <div className="flex items-baseline gap-2 pt-0.5">
            <span
              data-testid="priority-score"
              className="text-3xl font-black font-mono text-white"
            >
              {priority.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-white/40">/ 100</span>
          </div>
        </div>

        <span
          data-testid="priority-band-chip"
          className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${currentBandStyle.chip}`}
        >
          {normBand} BAND
        </span>
      </div>

      {/* Stacked Bar of Weighted Factors */}
      {breakdown && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider flex justify-between">
            <span>Factor Composition</span>
            <span>Raw PI: {breakdown.rawPi.toFixed(1)}</span>
          </div>

          <div
            data-testid="priority-stacked-bar"
            className="h-3 w-full rounded-full bg-white/10 overflow-hidden flex"
          >
            <div
              title={`Severity (S): ${(breakdown.s * 100).toFixed(0)}% (weighted ${sContrib.toFixed(3)})`}
              style={{ width: `${sPct}%` }}
              className="bg-purple-500 h-full transition-all duration-300"
            />
            <div
              title={`Exposure (E): ${(breakdown.e * 100).toFixed(0)}% (weighted ${eContrib.toFixed(3)})`}
              style={{ width: `${ePct}%` }}
              className="bg-sky-500 h-full transition-all duration-300"
            />
            <div
              title={`Vulnerability (V): ${(breakdown.v * 100).toFixed(0)}% (weighted ${vContrib.toFixed(3)})`}
              style={{ width: `${vPct}%` }}
              className="bg-amber-500 h-full transition-all duration-300"
            />
            <div
              title={`Usability (U): ${(breakdown.u * 100).toFixed(0)}% (weighted ${uContrib.toFixed(3)})`}
              style={{ width: `${uPct}%` }}
              className="bg-rose-500 h-full transition-all duration-300"
            />
            <div
              title={`Persistence (P): ${(breakdown.p * 100).toFixed(0)}% (weighted ${pContrib.toFixed(3)})`}
              style={{ width: `${pPct}%` }}
              className="bg-emerald-500 h-full transition-all duration-300"
            />
          </div>

          {/* Factor Details with 'estimated' badge on E and U */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-purple-300">
              <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
              <span>S: {breakdown.s.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-1.5 text-sky-300">
              <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
              <span>E: {breakdown.e.toFixed(2)}</span>
              <span
                data-testid="e-estimated"
                className="text-[9px] uppercase px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30"
              >
                estimated
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span>V: {breakdown.v.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-1.5 text-rose-300">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              <span>U: {breakdown.u.toFixed(2)}</span>
              <span
                data-testid="u-estimated"
                className="text-[9px] uppercase px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
              >
                estimated
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>P: {breakdown.p.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Multipliers Bar */}
      {breakdown && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5 text-[11px] font-mono text-white/60">
          <span>
            Confidence (C):{" "}
            <strong className="text-white">{breakdown.c.toFixed(2)}</strong>
          </span>
          <span>
            Season/Rain (Σ):{" "}
            <strong className="text-white">
              {breakdown.seasonMultiplier.toFixed(2)}x
            </strong>{" "}
            ({breakdown.season}
            {breakdown.rainMultiplier > 1 ? `, rain: ${breakdown.rainMultiplier}x` : ""})
          </span>
        </div>
      )}

      {/* Floor Notice */}
      {breakdown?.isFloorApplied && (
        <div
          data-testid="sla-floor-notice"
          className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5"
        >
          SLA breached (&gt; 2x SLA): minimum priority floor of 60 enforced.
        </div>
      )}

      {/* Template Sentence Facts */}
      <div className="pt-1">
        <p
          data-testid="priority-sentence"
          className="text-xs text-white/80 leading-relaxed font-sans"
        >
          {templateSentence}
        </p>

        {sentenceFacts?.details && sentenceFacts.details.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-white/50 font-mono list-disc list-inside">
            {sentenceFacts.details.map((detail, idx) => (
              <li key={idx}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

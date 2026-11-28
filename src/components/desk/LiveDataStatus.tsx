import { Activity, CloudRain, TrafficCone } from "lucide-react";
import { formatDateTimeIST } from "@/lib/time/ist";

interface FeedCoverage {
  latest: Date | null;
  freshPoints: number;
  totalPoints: number;
}

interface JobRunStatus {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  processed: number;
  failed: number;
  skipped: string | null;
  summary: string | null;
}

interface LiveDataStatusProps {
  weatherCoverage: FeedCoverage | null;
  trafficCoverage: FeedCoverage | null;
  latestTrafficProfile: Date | null;
  latestWeatherRun: JobRunStatus | null;
  latestTrafficRun: JobRunStatus | null;
  latestTrafficProfileRun: JobRunStatus | null;
}

function getFeedState(
  timestamp: Date | null,
  freshPoints: number,
  totalPoints: number,
  freshForMs: number
): "CURRENT" | "PARTIAL" | "DELAYED" | "NO DATA" {
  if (!timestamp || totalPoints === 0) return "NO DATA";
  if (Date.now() - timestamp.getTime() > freshForMs || freshPoints === 0) return "DELAYED";
  return freshPoints < totalPoints ? "PARTIAL" : "CURRENT";
}

function FeedRow({
  title,
  provider,
  coverage,
  freshForMs,
  lastRun,
  icon: Icon,
}: {
  title: string;
  provider: string;
  coverage: FeedCoverage | null;
  freshForMs: number;
  lastRun: JobRunStatus | null;
  icon: typeof Activity;
}) {
  const timestamp = coverage?.latest ?? null;
  const freshPoints = coverage?.freshPoints ?? 0;
  const totalPoints = coverage?.totalPoints ?? 0;
  const state = coverage === null
    ? "UNAVAILABLE"
    : getFeedState(timestamp, freshPoints, totalPoints, freshForMs);
  const tone = state === "CURRENT"
    ? "bg-[#EFF6F1] text-[#537C60] border-[#CFE4D4]"
    : state === "PARTIAL"
      ? "bg-[#FDF6ED] text-[#9A6D31] border-[#F4E3CB]"
      : state === "DELAYED"
        ? "bg-[#FDF6ED] text-[#9A6D31] border-[#F4E3CB]"
        : "bg-[#F3F2EB] text-[#65736B] border-[#DDDCD3]";

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E9E3] bg-white p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF2F0] text-[#527B7A]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#293732]">{title}</div>
          <div className="text-xs text-[#65736B]">{provider}</div>
          <div className="mt-0.5 text-[11px] text-[#65736B]">
            {state === "UNAVAILABLE"
              ? "Could not check stored readings"
              : timestamp
                ? `Latest stored reading: ${formatDateTimeIST(timestamp)}`
                : "No readings stored yet"}
          </div>
          <div className="text-[11px] text-[#65736B]">
            {state === "UNAVAILABLE"
              ? "Location coverage is unavailable"
              : totalPoints > 0
                ? `${freshPoints} of ${totalPoints} tracked locations updated within the freshness window`
                : "No tracked locations have readings"}
          </div>
          <div className="mt-1 text-[10px] text-[#929B92]">
            {lastRun
              ? `Refresh job ${lastRun.status.toLowerCase()} · ${lastRun.finishedAt ? formatDateTimeIST(lastRun.finishedAt) : "still running"} · ${lastRun.processed} processed${lastRun.failed ? ` · ${lastRun.failed} failed` : ""}${lastRun.skipped || lastRun.summary ? ` · ${lastRun.skipped ?? lastRun.summary}` : ""}`
              : "No refresh history recorded yet. Ask the operations administrator to check the feed schedule."}
          </div>
        </div>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold tracking-wide ${tone}`}>
        {state}
      </span>
    </div>
  );
}

export function LiveDataStatus({
  weatherCoverage,
  trafficCoverage,
  latestTrafficProfile,
  latestWeatherRun,
  latestTrafficRun,
  latestTrafficProfileRun,
}: LiveDataStatusProps) {
  return (
    <section aria-labelledby="live-data-status-title" className="rounded-2xl border border-[#DDDCD3] bg-[#F9FAF8] p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="live-data-status-title" className="font-display text-lg font-semibold text-[#293732]">
            Data sources and freshness
          </h2>
          <p className="mt-0.5 text-xs text-[#65736B]">
            Feed age comes from the latest stored source reading. A delayed badge means refresh is behind schedule, not that the provider is confirmed offline.
          </p>
        </div>
        <Activity className="mt-1 h-4 w-4 shrink-0 text-[#527B7A]" aria-hidden="true" />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <FeedRow title="Weather forecast" provider="Open-Meteo · hourly forecast" coverage={weatherCoverage} freshForMs={3 * 60 * 60 * 1000} lastRun={latestWeatherRun} icon={CloudRain} />
        <FeedRow title="Traffic observation" provider="TomTom · latest non-seed sample" coverage={trafficCoverage} freshForMs={4 * 60 * 60 * 1000} lastRun={latestTrafficRun} icon={TrafficCone} />
      </div>
      <p className="mt-3 text-[11px] text-[#65736B]">
        Traffic planning profile last rebuilt: {latestTrafficProfile ? formatDateTimeIST(latestTrafficProfile) : "No profile stored"}. A rebuilt profile may combine older observations and historical estimates; it is not itself a live reading.
      </p>
      <p className="mt-1 text-[10px] text-[#929B92]">
        Traffic profile job: {latestTrafficProfileRun ? `${latestTrafficProfileRun.status.toLowerCase()} · ${latestTrafficProfileRun.finishedAt ? formatDateTimeIST(latestTrafficProfileRun.finishedAt) : "still running"} · ${latestTrafficProfileRun.processed} processed${latestTrafficProfileRun.failed ? ` · ${latestTrafficProfileRun.failed} failed` : ""}${latestTrafficProfileRun.skipped || latestTrafficProfileRun.summary ? ` · ${latestTrafficProfileRun.skipped ?? latestTrafficProfileRun.summary}` : ""}` : "No refresh job history available"}
      </p>
      <p className="mt-1 text-[10px] text-[#929B92]">Weather data by Open-Meteo.com</p>
    </section>
  );
}

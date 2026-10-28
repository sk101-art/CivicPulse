import { notFound } from "next/navigation";
import Link from "next/link";
import { getSegmentTimeline, type TimelineItem, type TimelineEventType } from "@/lib/roads/timeline";
import { 
  ArrowLeft, Calendar, ShieldCheck, 
  Building2, ArrowRightLeft, 
  Activity, Hammer, Wrench, Droplets,
  RefreshCw, AlertCircle, FileText, HardHat
} from "lucide-react";
import { format } from "date-fns";

export const revalidate = 0;

function getEventBadge(type: TimelineEventType) {
  switch (type) {
    case "RESURFACED":
      return {
        icon: Hammer,
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
        label: "Resurfaced",
      };
    case "ROAD_CUT":
      return {
        icon: Wrench,
        color: "text-orange-400 bg-orange-500/10 border-orange-500/30",
        label: "Utility Road Cut",
      };
    case "WATERLOGGED":
      return {
        icon: Droplets,
        color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
        label: "Waterlogged",
      };
    case "RECURRENCE":
      return {
        icon: RefreshCw,
        color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
        label: "Recurrence",
      };
    case "VERIFIED_FIX":
      return {
        icon: ShieldCheck,
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
        label: "Verified Fix",
      };
    case "HANDOFF":
      return {
        icon: ArrowRightLeft,
        color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
        label: "Handoff",
      };
    case "REPORTED":
    default:
      return {
        icon: AlertCircle,
        color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
        label: "Reported",
      };
  }
}

export default async function RoadTimelinePage({
  params,
}: {
  params: Promise<{ segmentId: string }>;
}) {
  const { segmentId } = await params;
  const data = await getSegmentTimeline(segmentId);

  if (!data) {
    notFound();
  }

  const { segment, stats, timeline } = data;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="space-y-4">
          <Link
            href="/citizen/map"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Map
          </Link>

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-800 pb-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                  Segment ID: {segment.id}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-blue-950/60 text-blue-400 border border-blue-800/50">
                  Class: {segment.roadClass}
                </span>
                {segment.tracked && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                    Pilot Monitored Corridor
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                {segment.name || "Road Segment Timeline"}
              </h1>
              <p className="text-sm text-slate-400 flex items-center gap-3">
                <span>Lanes: {segment.lanes || "N/A"}</span>
                <span>•</span>
                <span>Bus Flow: {segment.busesPerHour} buses/hr</span>
                <span>•</span>
                <span>OSM Way: {segment.osmWayId}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs font-medium text-slate-400">Total Events</div>
            <div className="text-2xl font-bold text-white" data-testid="stat-total-events">{stats.totalEvents}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs font-medium text-slate-400">Active Issues</div>
            <div className="text-2xl font-bold text-rose-400" data-testid="stat-active-issues">{stats.activeIssues}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs font-medium text-slate-400">Verified Fixes</div>
            <div className="text-2xl font-bold text-emerald-400" data-testid="stat-verified-fixes">{stats.verifiedFixes}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs font-medium text-slate-400">Resurfaced</div>
            <div className="text-2xl font-bold text-blue-400" data-testid="stat-resurfaced">{stats.resurfacedCount}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs font-medium text-slate-400">Recurrences</div>
            <div className="text-2xl font-bold text-amber-400" data-testid="stat-recurrences">{stats.recurrencesCount}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-xs font-medium text-slate-400">Utility Cuts</div>
            <div className="text-2xl font-bold text-orange-400" data-testid="stat-utility-cuts">{stats.utilityCuts}</div>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Chronological Road History (Newest First)
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              Immutable municipal log
            </span>
          </div>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
            {timeline.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 text-sm">
                No recorded historical events or issues for this road segment yet.
              </div>
            ) : (
              timeline.map((item: TimelineItem) => {
                const badge = getEventBadge(item.type);
                const IconComponent = badge.icon;
                const occurredDate = new Date(item.occurredAt);

                return (
                  <div
                    key={item.id}
                    className="relative rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 hover:border-slate-700/80 transition-colors space-y-3"
                    data-testid="timeline-item"
                    data-event-type={item.type}
                  >
                    {/* Timeline Node Dot */}
                    <div
                      className={`absolute -left-[30px] top-5 w-4 h-4 rounded-full border-2 border-slate-950 ${badge.color.split(" ")[1]} flex items-center justify-center`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${badge.color.split(" ")[0].replace("text-", "bg-")}`} />
                    </div>

                    {/* Top Row: Type Badge, Seed Tag, and Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border ${badge.color}`}
                        >
                          <IconComponent className="w-3.5 h-3.5" />
                          {badge.label}
                        </span>

                        {item.isSeed && (
                          <span
                            data-testid="seed-tag"
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          >
                            Seed Data
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                        <Calendar className="w-3.5 h-3.5" />
                        <time dateTime={item.occurredAt}>
                          {format(occurredDate, "dd MMM yyyy, HH:mm")}
                        </time>
                      </div>
                    </div>

                    {/* Content / Title */}
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-slate-100">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Metadata Footer: Agency, Contractor, Work Order */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 text-xs border-t border-slate-800/60">
                      {item.agency && (
                        <span className="inline-flex items-center gap-1 text-slate-300 font-medium bg-slate-800/60 px-2 py-0.5 rounded">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {item.agency}
                        </span>
                      )}

                      {item.contractor && (
                        <span className="inline-flex items-center gap-1 text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded">
                          <HardHat className="w-3 h-3 text-orange-400" />
                          Contractor: {item.contractor}
                        </span>
                      )}

                      {item.workOrder && (
                        <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded font-mono">
                          <FileText className="w-3 h-3 text-blue-400" />
                          WO: {item.workOrder}
                        </span>
                      )}

                      {item.source && (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-mono">
                          Source: {item.source}
                        </span>
                      )}

                      {item.issueId && (
                        <Link
                          href={`/issue/${item.issueId}`}
                          className="ml-auto text-blue-400 hover:text-blue-300 underline font-medium"
                        >
                          View Linked Issue →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Framing & Public Ledger Disclaimer */}
        <footer className="pt-8 border-t border-slate-800/80 text-center text-xs text-slate-500 space-y-1">
          <p>
            CivicPulse Road Truth Ledger • Public Municipal Infrastructure Record
          </p>
          <p>
            Non-commercial civic accountability tool. Records are cryptographically logged and publicly auditable.
          </p>
        </footer>
      </div>
    </div>
  );
}

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { MapPin, Crosshair, Navigation, Copy } from 'lucide-react';

export const revalidate = 0;

export default async function ExtraFeaturePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id;

  const reports = await prisma.report.findMany({
    where: { citizen: { userId } },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      latitude: true,
      longitude: true,
      address: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const statusColor: Record<string, string> = {
    OPEN: 'var(--accent-amber)',
    CONFIRMED: 'var(--accent-electric-blue)',
    ASSIGNED: 'var(--accent-cyan)',
    IN_PROGRESS: 'var(--accent-cyan)',
    RESOLVED: 'var(--accent-lime)',
    REJECTED: 'var(--accent-magenta)',
  };

  const categoryColors: Record<string, string> = {
    POTHOLES: '#f97316',
    DRAINAGE: '#3b82f6',
    STREETLIGHTS: '#eab308',
    SIDEWALKS: '#8b5cf6',
    TRAFFIC_SIGNS: '#ef4444',
    GRAFFITI: '#ec4899',
    TRASH: '#14b8a6',
    OTHER: '#6b7280',
  };

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader
        title="Extra Feature"
        subtitle="Issue Coordinate Registry"
        accentColor="var(--accent-cyan)"
      />

      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">

        {/* Summary banner */}
        <div
          className="flex items-center gap-5 p-5 rounded-2xl border"
          style={{ background: 'rgba(0,245,212,0.05)', borderColor: 'rgba(0,245,212,0.15)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.3)' }}
          >
            <Crosshair className="w-6 h-6" style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div>
            <p className="text-sm font-bold text-white uppercase tracking-widest">
              GPS Coordinate Log
            </p>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {reports.length} issue{reports.length !== 1 ? 's' : ''} submitted by your account •
              Latitude / Longitude in WGS84 decimal degrees
            </p>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 rounded-3xl border-2 border-dashed border-white/5">
            <Navigation className="w-10 h-10 text-white/10 mb-4" />
            <p className="text-white/30 text-sm font-mono uppercase tracking-widest">
              No issues submitted yet
            </p>
            <p className="text-white/15 text-xs font-mono mt-2">
              Submit a report and its coordinates will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header row */}
            <div
              className="grid gap-4 px-5 py-2 rounded-xl text-[9px] font-mono font-black uppercase tracking-[0.25em]"
              style={{
                gridTemplateColumns: '2rem 1fr 1fr 1fr 1fr',
                color: 'rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <span>#</span>
              <span>Issue</span>
              <span>Latitude</span>
              <span>Longitude</span>
              <span>Status</span>
            </div>

            {reports.map((report, index) => (
              <div
                key={report.id}
                className="group grid gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 hover:scale-[1.005]"
                style={{
                  gridTemplateColumns: '2rem 1fr 1fr 1fr 1fr',
                  background: 'rgba(255,255,255,0.02)',
                  borderColor: 'rgba(255,255,255,0.06)',
                  alignItems: 'center',
                }}
              >
                {/* Index */}
                <span
                  className="text-[10px] font-mono font-black w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(0,245,212,0.1)',
                    color: 'var(--accent-cyan)',
                    border: '1px solid rgba(0,245,212,0.2)',
                  }}
                >
                  {index + 1}
                </span>

                {/* Issue info */}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white truncate leading-tight">
                    {report.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded"
                      style={{
                        background: `${categoryColors[report.category] || '#6b7280'}18`,
                        color: categoryColors[report.category] || '#6b7280',
                      }}
                    >
                      {report.category}
                    </span>
                    <span className="text-[9px] font-mono text-white/20">
                      {new Date(report.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Latitude */}
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-magenta)' }} />
                  <span
                    className="text-[11px] font-mono font-bold tabular-nums truncate"
                    style={{ color: 'rgba(255,255,255,0.75)' }}
                  >
                    {report.latitude.toFixed(6)}°
                  </span>
                </div>

                {/* Longitude */}
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-electric-blue)' }} />
                  <span
                    className="text-[11px] font-mono font-bold tabular-nums truncate"
                    style={{ color: 'rgba(255,255,255,0.75)' }}
                  >
                    {report.longitude.toFixed(6)}°
                  </span>
                </div>

                {/* Status */}
                <span
                  className="text-[9px] font-mono font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg justify-self-start"
                  style={{
                    background: `${statusColor[report.status] || '#6b7280'}15`,
                    color: statusColor[report.status] || '#6b7280',
                    border: `1px solid ${statusColor[report.status] || '#6b7280'}25`,
                  }}
                >
                  {report.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Raw coordinate dump */}
        {reports.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <Copy className="w-4 h-4" style={{ color: 'var(--accent-cyan)' }} />
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                Raw Coordinate Export
              </h3>
            </div>
            <div
              className="rounded-2xl p-5 font-mono text-[11px] leading-7 overflow-x-auto"
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(0,245,212,0.12)',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              <div className="text-[9px] uppercase tracking-widest mb-3" style={{ color: 'rgba(0,245,212,0.5)' }}>
                // FORMAT: [index] TITLE → LAT, LNG (STATUS)
              </div>
              {reports.map((r, i) => (
                <div key={r.id} className="flex gap-3 hover:text-white/80 transition-colors">
                  <span style={{ color: 'rgba(0,245,212,0.4)', minWidth: '1.5rem' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
                  <span className="flex-1 truncate text-white/60">
                    {r.title}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>→</span>
                  <span style={{ color: 'var(--accent-cyan)', minWidth: '10rem' }}>
                    {r.latitude.toFixed(6)}, {r.longitude.toFixed(6)}
                  </span>
                  <span
                    className="text-[9px] uppercase"
                    style={{ color: statusColor[r.status] || '#6b7280', minWidth: '6rem' }}
                  >
                    [{r.status}]
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

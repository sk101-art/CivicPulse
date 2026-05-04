import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChevronLeft, Map as MapIcon, Radio, Navigation, AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { MapWrapper } from "@/components/citizen/MapWrapper";


export const revalidate = 0;

export default async function CitizenMapPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'CITIZEN') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen font-body relative" style={{ background: 'var(--bg-primary)' }}>
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div style={{
          position: 'absolute', top: '10%', right: '-10%',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(0,212,255,0.03) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />
      </div>

      <header className="sticky top-0 z-30 px-8 py-5 flex items-center justify-between border-b backdrop-blur-xl"
        style={{ background: 'rgba(10,10,11,0.8)', borderColor: 'rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-4">
          <Link href="/citizen/dashboard" className="p-2 -ml-2 rounded-xl hover:bg-white/5 transition-colors text-white/50 hover:text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              City Intelligence
            </p>
            <h1 className="font-display font-black text-xl text-white tracking-tight flex items-center gap-2">
              <MapIcon className="w-5 h-5" style={{ color: 'var(--accent-electric-blue)' }} />
              Issues Near Me
            </h1>
          </div>
        </div>
        <div 
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-mono uppercase tracking-widest"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'var(--accent-electric-blue)' }}
        >
          <Radio className="w-3 h-3 animate-pulse" />
          GPS Scan
        </div>
      </header>

      <main className="relative z-10 p-8 max-w-[1600px] mx-auto space-y-8 pb-24">
        {/* Intelligence Alert */}
        <div 
          className="rounded-3xl p-6 relative overflow-hidden"
          style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid rgba(0,212,255,0.15)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
          }}
        >
           <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
              <div 
                className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}
              >
                 <Navigation className="w-7 h-7" style={{ color: 'var(--accent-electric-blue)' }} />
              </div>
              <div className="flex-1 space-y-1">
                 <h3 className="font-display font-bold text-lg text-white">Safe Path Algorithm Engaged</h3>
                 <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Centered on your location, showing reports within <span className="font-bold text-white">500m</span>. 
                    Filter by <span className="font-bold text-white">category</span> and <span className="font-bold text-white">status</span>, and markers cluster automatically as you zoom out.
                 </p>
              </div>
              <div className="flex gap-4 shrink-0">
                 <div className="text-center">
                    <div className="text-lg font-display font-black text-white">500m</div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-white/40">Scan Radius</div>
                 </div>
                 <div className="text-center">
                    <div className="text-lg font-display font-black text-white">Live</div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-white/40">Intel Layer</div>
                 </div>
              </div>
           </div>
           <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-cyan-500/5 to-transparent pointer-events-none" />
        </div>

        {/* Map Container */}
        <div 
          className="rounded-[2.5rem] bg-slate-900 border border-white/5 overflow-hidden shadow-2xl relative group"
          style={{ height: 'calc(100vh - 400px)', minHeight: '500px' }}
        >
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ 
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }} />
          
          <div className="relative z-10 w-full h-full">
            <MapWrapper showReportButton={true} />
          </div>


        </div>

        {/* Legend Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-4">
           {[
             { label: 'Pending Hazard', color: 'var(--accent-amber)', icon: AlertTriangle, desc: 'Requires resolution' },
             { label: 'Secured/Resolved', color: 'var(--accent-lime)', icon: ShieldCheck, desc: 'Verified resolution' },
             { label: 'Active Route', color: 'var(--accent-electric-blue)', icon: Navigation, desc: 'Optimized road path' },
             { label: 'Impact Zone', color: 'var(--accent-magenta)', icon: Radio, desc: 'Hazard buffer area' },
           ].map(item => (
             <div key={item.label} className="flex items-start gap-3">
                <div 
                  className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                  style={{ background: `${item.color}10`, border: `1px solid ${item.color}20` }}
                >
                   <item.icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <div>
                   <div className="text-[11px] font-display font-bold text-white uppercase tracking-tight">{item.label}</div>
                   <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{item.desc}</div>
                </div>
             </div>
           ))}
        </div>
      </main>
    </div>
  );
}

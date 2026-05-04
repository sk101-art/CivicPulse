import sys

def fix_authority():
    filepath = 'c:/Users/sujay/Downloads/miniproject/src/components/authority/AuthorityMap.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    idx = content.find('  return (')
    if idx == -1: return

    base_content = content[:idx]

    jsx = '''  return (
    <div className="h-full w-full rounded-2xl overflow-hidden border border-white/10 relative">
      {/* ── Controls ── */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-wrap items-center gap-4">
        <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button onClick={() => setMode('source')}
            className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === 'source' ? 'bg-emerald-500 border-emerald-400 text-black animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : source ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-emerald-500/50'
            }`}>{mode === 'source' ? '⊕ Placing Source...' : source ? '✓ Source Set' : '⊕ Set Source'}</button>
        </div>

        <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button onClick={() => setMode('destination')}
            className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === 'destination' ? 'bg-magenta-500 border-magenta-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,46,99,0.4)]'
              : destination ? 'bg-magenta-500/20 border-magenta-500/30 text-magenta-400'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-magenta-500/50'
            }`} style={mode === 'destination' ? { background: 'var(--accent-magenta)', borderColor: 'var(--accent-magenta)' } : {}}>{mode === 'destination' ? '⊕ Placing Dest...' : destination ? '✓ Dest Set' : '⊕ Set Destination'}</button>
        </div>

        {source && destination && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={optimize} disabled={loading}
              className="px-5 py-2 rounded-xl text-[10px] font-display font-black uppercase tracking-widest bg-cyan-500 text-black shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:bg-cyan-400 active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent-cyan)' }}>
              {loading ? '⏳ Computing Path...' : '▶ Compute Safe Route'}
            </button>
          </div>
        )}

        {showReportButton && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={() => setMode('report')}
              className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
                mode === 'report' ? 'bg-amber-500 border-amber-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,184,0,0.4)]'
                : 'bg-black/60 backdrop-blur-md border-white/10 text-amber-400 hover:border-amber-500/50'
              }`}>{mode === 'report' ? '📍 Pinning Issue...' : '📍 Report on Map'}</button>
          </div>
        )}

        {(source || destination) && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={clearAll}
              className="px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest bg-black/60 backdrop-blur-md border border-white/10 text-white/40 hover:text-magenta-400 hover:border-magenta-500/30">
              ✕ Reset
            </button>
          </div>
        )}
      </div>

      {/* Route UI */}
      {allRoutes.length > 0 && (
        <div className="absolute top-24 left-4 z-[1000] flex gap-2 overflow-x-auto max-w-[80vw]">
          {allRoutes.map((route, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedRouteIndex(idx)}
              className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all shadow-lg backdrop-blur-md whitespace-nowrap ${
                selectedRouteIndex === idx
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-black/60 border-white/10 text-white/50 hover:border-white/30'
              }`}
            >
              <div className="text-[10px] font-mono font-black uppercase tracking-widest flex items-center gap-2">
                Route {idx + 1} {selectedRouteIndex === idx && '✓'}
              </div>
              <div className="text-xs font-bold">
                {fmt(route.distance)} • {fmtTime(route.duration)}
              </div>
              <div className="text-[9px] font-mono uppercase">
                {route.status === 'safe' && 'Optimal Path Clear'}
                {route.status === 'rerouted' && `Avoided ${route.hazards} Hazard${route.hazards > 1 ? 's' : ''}`}
                {route.status === 'warn' && `⚠ ${route.hazards} Hazard${route.hazards > 1 ? 's' : ''} on path`}
              </div>
            </button>
          ))}
        </div>
      )}

      {mode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/10 text-sm font-bold text-white shadow-2xl">
          {mode === 'source' && 'Click on the map to place your 🟢 Source point'}
          {mode === 'destination' && 'Click on the map to place your 🔴 Destination point'}
          {mode === 'report' && 'Click on the map to place a 📍 new issue at that location'}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-[999] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
          <div className="px-8 py-4 rounded-2xl bg-slate-900 border border-indigo-500/20 text-sm font-bold text-indigo-400 shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Computing safe route via OSRM...
          </div>
        </div>
      )}

      <MapContainer center={center} zoom={13} scrollWheelZoom={true} zoomControl={false}
        style={{ height: '100%', width: '100%' }}>
        <CustomZoomControls />
        <TileLayer 
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapSync reports={reports} />
        <MapClickHandler mode={mode} onPlace={handlePlace} />

        {/* 10km Zone */}
        <Circle center={center} radius={10000}
          pathOptions={{ fillColor: 'var(--accent-electric-blue)', fillOpacity: 0.03, color: 'var(--accent-electric-blue)', weight: 1, dashArray: '5, 10' }} />

        {/* All Routes */}
        {allRoutes.map((route, idx) => (
          <Polyline
            key={`route-${idx}`}
            positions={route.coords}
            eventHandlers={{ click: () => setSelectedRouteIndex(idx) }}
            pathOptions={{
              color: idx === selectedRouteIndex ? 'var(--accent-cyan)' :
                     idx === 1 ? 'var(--accent-magenta)' : 'var(--text-muted)',
              weight: idx === selectedRouteIndex ? 5 : 3,
              opacity: idx === selectedRouteIndex ? 1 : 0.5,
              dashArray: idx === selectedRouteIndex ? undefined : '8, 12',
            }}
          />
        ))}

        {/* Hazard zones (pulsing red) */}
        {hazards.flatMap((h) => [
          <Circle
            key={`hz-pulse-${h.id}`}
            center={[h.latitude, h.longitude]}
            radius={HAZARD_RADIUS * (1 + 0.18 * pulseFactor)}
            pathOptions={{
              fillColor: 'var(--accent-magenta)',
              fillOpacity: 0.06,
              color: 'var(--accent-magenta)',
              weight: 1,
              dashArray: '4, 10',
              opacity: 0.55,
            }}
          />,
          <Circle
            key={`hz-${h.id}`}
            center={[h.latitude, h.longitude]}
            radius={HAZARD_RADIUS}
            pathOptions={{
              fillColor: 'var(--accent-magenta)',
              fillOpacity: 0.12,
              color: 'var(--accent-magenta)',
              weight: 2,
              opacity: 0.85,
            }}
          />,
        ])}

        {/* Source and Dest Markers */}
        {source && (
          <Marker position={source} icon={sourceIcon()}>
            <Popup><b>Source</b></Popup>
          </Marker>
        )}
        {destination && (
          <Marker position={destination} icon={destIcon()}>
            <Popup><b>Destination</b></Popup>
          </Marker>
        )}

        {/* Issue markers (category-colored circles) */}
        {reports.map((r) => {
          const isHz = hazards.some((h) => h.id === r.id);
          const color = r.status === 'RESOLVED' ? 'var(--accent-lime)' : catColor(r.category);
          const radius = 6 + ((r.priorityScore ?? 0.5) * 8);
          return (
            <CircleMarker
              key={r.id}
              center={[r.latitude, r.longitude]}
              radius={radius}
              pathOptions={{
                color: 'transparent',
                fillColor: isHz ? 'var(--accent-magenta)' : color,
                fillOpacity: isHz ? 0.85 : 0.7,
              }}
            >
              <Popup>
                <div className="min-w-[160px]">
                  <b className="text-sm">{r.title}</b>
                  <p className="text-xs text-slate-500 uppercase">{r.status}</p>
                  <p className="text-xs text-slate-500 uppercase">{r.category}</p>
                  {isHz && <p className="text-xs font-bold mt-1" style={{ color: 'var(--accent-magenta)' }}>⚠ Hazard zone</p>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
'''
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(base_content + jsx)

def fix_citizen():
    filepath = 'c:/Users/sujay/Downloads/miniproject/src/components/citizen/IssuesNearMeMap.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    idx = content.find('  return (')
    if idx == -1: return

    base_content = content[:idx]

    jsx = '''  return (
    <div className="relative w-full h-full">
      {/* ── Top Left Controls ── */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-wrap items-center gap-4">
        <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button onClick={() => setMode('source')}
            className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === 'source' ? 'bg-emerald-500 border-emerald-400 text-black animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : source ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-emerald-500/50'
            }`}>{mode === 'source' ? '⊕ Placing Source...' : source ? '✓ Source Set' : '⊕ Set Source'}</button>
        </div>

        <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button onClick={() => setMode('destination')}
            className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === 'destination' ? 'bg-magenta-500 border-magenta-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,46,99,0.4)]'
              : destination ? 'bg-magenta-500/20 border-magenta-500/30 text-magenta-400'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-magenta-500/50'
            }`} style={mode === 'destination' ? { background: 'var(--accent-magenta)', borderColor: 'var(--accent-magenta)' } : {}}>{mode === 'destination' ? '⊕ Placing Dest...' : destination ? '✓ Dest Set' : '⊕ Set Destination'}</button>
        </div>

        {source && destination && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={optimize} disabled={routeLoading}
              className="px-5 py-2 rounded-xl text-[10px] font-display font-black uppercase tracking-widest bg-cyan-500 text-black shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:bg-cyan-400 active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent-cyan)' }}>
              {routeLoading ? '⏳ Computing Path...' : '▶ Compute Safe Route'}
            </button>
          </div>
        )}

        {showReportButton && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={() => setMode('report')}
              className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
                mode === 'report' ? 'bg-amber-500 border-amber-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,184,0,0.4)]'
                : 'bg-black/60 backdrop-blur-md border-white/10 text-amber-400 hover:border-amber-500/50'
              }`}>{mode === 'report' ? '📍 Pinning Issue...' : '📍 Report on Map'}</button>
          </div>
        )}

        {(source || destination) && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={clearAll}
              className="px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest bg-black/60 backdrop-blur-md border border-white/10 text-white/40 hover:text-magenta-400 hover:border-magenta-500/30">
              ✕ Reset
            </button>
          </div>
        )}
      </div>

      {/* Route UI */}
      {allRoutes.length > 0 && (
        <div className="absolute top-24 left-4 z-[1000] flex gap-2 overflow-x-auto max-w-[80vw]">
          {allRoutes.map((route, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedRouteIndex(idx)}
              className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all shadow-lg backdrop-blur-md whitespace-nowrap ${
                selectedRouteIndex === idx
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-black/60 border-white/10 text-white/50 hover:border-white/30'
              }`}
            >
              <div className="text-[10px] font-mono font-black uppercase tracking-widest flex items-center gap-2">
                Route {idx + 1} {selectedRouteIndex === idx && '✓'}
              </div>
              <div className="text-xs font-bold">
                {fmt(route.distance)} • {fmtTime(route.duration)}
              </div>
              <div className="text-[9px] font-mono uppercase">
                {route.status === 'safe' && 'Optimal Path Clear'}
                {route.status === 'rerouted' && `Avoided ${route.hazards} Hazard${route.hazards > 1 ? 's' : ''}`}
                {route.status === 'warn' && `⚠ ${route.hazards} Hazard${route.hazards > 1 ? 's' : ''} on path`}
              </div>
            </button>
          ))}
        </div>
      )}

      {mode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/10 text-sm font-bold text-white shadow-2xl">
          {mode === 'source' && 'Click on the map to place your 🟢 Source point'}
          {mode === 'destination' && 'Click on the map to place your 🔴 Destination point'}
          {mode === 'report' && 'Click on the map to place a 📍 new issue at that location'}
        </div>
      )}

      {routeLoading && (
        <div className="absolute inset-0 z-[999] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
          <div className="px-8 py-4 rounded-2xl bg-slate-900 border border-indigo-500/20 text-sm font-bold text-indigo-400 shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Computing safe route via OSRM...
          </div>
        </div>
      )}

      {/* ── Top Right Filters ── */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 w-[220px]">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-xl px-3 text-xs font-mono uppercase tracking-widest outline-none"
          style={{ background: 'rgba(10,10,11,0.65)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', backdropFilter: 'blur(10px)' }}
        >
          {categoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl px-3 text-xs font-mono uppercase tracking-widest outline-none"
          style={{ background: 'rgba(10,10,11,0.65)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', backdropFilter: 'blur(10px)' }}
        >
          {statusOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <div className="rounded-xl px-3 py-2 text-[10px] font-mono uppercase tracking-widest" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.18)', color: 'var(--accent-electric-blue)' }}>
          {loading ? 'Scanning…' : `${filtered.length} within 500m`}
        </div>
        {geoError && (
          <div className="rounded-xl px-3 py-2 text-[10px] font-mono uppercase tracking-widest" style={{ background: 'rgba(255,46,99,0.10)', border: '1px solid rgba(255,46,99,0.22)', color: 'var(--accent-magenta)' }}>
            {geoError}
          </div>
        )}
      </div>

      <MapContainer center={mapCenter} zoom={16} className="w-full h-full" scrollWheelZoom zoomControl={false} style={{ background: 'var(--bg-primary)' }}>
        <CustomZoomControls />
        <ZoomTracker onZoom={setZoom} />
        <MapClickHandler mode={mode} onPlace={handlePlace} />
        <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {userPos && (
          <>
            <Circle center={userPos} radius={radius} pathOptions={{ color: 'var(--accent-electric-blue)', weight: 1, opacity: 0.6, fillColor: 'var(--accent-electric-blue)', fillOpacity: 0.05 }} />
            <CircleMarker center={userPos} radius={7} pathOptions={{ color: 'transparent', fillColor: 'var(--accent-cyan)', fillOpacity: 0.95 }}><Popup><b>You are here</b></Popup></CircleMarker>
          </>
        )}

        {/* All Routes */}
        {allRoutes.map((route, idx) => (
          <Polyline
            key={`route-${idx}`}
            positions={route.coords}
            eventHandlers={{ click: () => setSelectedRouteIndex(idx) }}
            pathOptions={{
              color: idx === selectedRouteIndex ? 'var(--accent-cyan)' :
                     idx === 1 ? 'var(--accent-magenta)' : 'var(--text-muted)',
              weight: idx === selectedRouteIndex ? 5 : 3,
              opacity: idx === selectedRouteIndex ? 1 : 0.5,
              dashArray: idx === selectedRouteIndex ? undefined : '8, 12',
            }}
          />
        ))}

        {/* Hazard zones (pulsing red) */}
        {hazards.flatMap((h) => [
          <Circle key={`hz-pulse-${h.id}`} center={[h.latitude, h.longitude]} radius={HAZARD_RADIUS * (1 + 0.18 * pulseFactor)} pathOptions={{ fillColor: 'var(--accent-magenta)', fillOpacity: 0.06, color: 'var(--accent-magenta)', weight: 1, dashArray: '4, 10', opacity: 0.55 }} />,
          <Circle key={`hz-${h.id}`} center={[h.latitude, h.longitude]} radius={HAZARD_RADIUS} pathOptions={{ fillColor: 'var(--accent-magenta)', fillOpacity: 0.12, color: 'var(--accent-magenta)', weight: 2, opacity: 0.85 }} />
        ])}

        {/* Source and Dest Markers */}
        {source && (
          <Marker position={source} icon={sourceIcon()}><Popup><b>Source</b></Popup></Marker>
        )}
        {destination && (
          <Marker position={destination} icon={destIcon()}><Popup><b>Destination</b></Popup></Marker>
        )}

        {renderPoints.map((item) => {
          if (item.type === 'cluster') {
             return (<Marker key={`cl-${item.lat.toFixed(6)}-${item.lng.toFixed(6)}-${item.reports.length}`} position={[item.lat, item.lng]} icon={clusterIcon(item.reports.length)}><Popup><b>{item.reports.length} issues</b></Popup></Marker>);
          }
          const r = item.reports[0];
          const isHz = hazards.some(h => h.id === r.id);
          const color = r.status === 'RESOLVED' ? 'var(--accent-lime)' : catColor(r.category);
          const pr = r.priorityScore == null ? 0.5 : Number(r.priorityScore);
          const radiusPx = 6 + clamp(pr, 0, 1) * 8;
          const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : null;
          const isNew = createdAt != null && nowMs - createdAt < 60 * 60 * 1000;
          return (
            <CircleMarker key={r.id} center={[r.latitude, r.longitude]} radius={radiusPx * (isNew ? (1 + 0.12 * pulseFactor) : 1)} pathOptions={{ color: 'transparent', fillColor: isHz ? 'var(--accent-magenta)' : color, fillOpacity: isHz ? 0.85 : (isNew ? 0.55 + 0.25 * pulseFactor : 0.72) }}>
              <Popup>
                <div className="min-w-[160px]">
                  <b className="text-sm">{r.title}</b>
                  <p className="text-xs text-slate-500 uppercase">{r.category}</p>
                  <p className="text-xs text-slate-500 uppercase">{r.status}</p>
                  {isHz && <p className="text-xs font-bold mt-1" style={{ color: 'var(--accent-magenta)' }}>⚠ Hazard zone</p>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
'''
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(base_content + jsx)

fix_authority()
fix_citizen()

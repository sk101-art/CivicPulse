import re

def update_file(filepath, is_citizen):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add RouteOption interface and update fetchAllRoutes
    fetch_route_pattern = re.compile(r'async function fetchRoute.*?\}\n', re.DOTALL)
    
    new_fetch_route = """interface RouteOption {
  coords: [number, number][];
  distance: number;
  duration: number;
  hazards: number;
  status: 'safe' | 'rerouted' | 'warn';
  isDetour?: boolean;
}

async function fetchAllRoutes(waypoints: [number, number][], alternatives: number | false = 3) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const altParam = alternatives === false ? 'false' : alternatives.toString();
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${altParam}`;
  const res = await fetch(url);
  const data: unknown = await res.json();
  const parsed = data as { code?: string; routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> }; distance?: number; duration?: number; }> };
  if (parsed.code !== 'Ok' || !parsed.routes?.length) return [];
  return parsed.routes.map(r => {
    const coords = r.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number]);
    if (!coords?.length || typeof r.distance !== 'number' || typeof r.duration !== 'number') return null;
    return { coords, distance: r.distance, duration: r.duration };
  }).filter((x): x is { coords: [number, number][]; distance: number; duration: number } => Boolean(x));
}
"""
    content = fetch_route_pattern.sub(new_fetch_route, content)
    
    # 2. Add sourceIcon and destIcon
    waypoint_icon_pattern = re.compile(r'function waypointIcon.*?\}\n', re.DOTALL)
    new_icons = """function sourceIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(10,10,11,0.85);
        border:1px solid rgba(16,185,129,0.5);
        box-shadow:0 0 22px rgba(16,185,129,0.3);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:11px;
      ">S</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function destIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(10,10,11,0.85);
        border:1px solid rgba(255,46,99,0.5);
        box-shadow:0 0 22px rgba(255,46,99,0.3);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:11px;
      ">D</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
"""
    content = waypoint_icon_pattern.sub(new_icons, content)

    # 3. Update State Declarations
    if is_citizen:
        state_pattern = re.compile(r'const \[routeWaypoints.*?;', re.DOTALL)
        new_state = """const [allRoutes, setAllRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [hazards, setHazards] = useState<NearbyReport[]>([]);"""
        content = state_pattern.sub(new_state, content)
        
        # remove old info, directRoute, safeRoute states
        content = re.sub(r'const \[directRoute.*?;', '', content)
        content = re.sub(r'const \[safeRoute.*?;', '', content)
        content = re.sub(r'const \[info.*?;', '', content)
    else:
        state_pattern = re.compile(r'const \[routeWaypoints.*?;', re.DOTALL)
        new_state = """const [allRoutes, setAllRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);"""
        content = state_pattern.sub(new_state, content)
        
        content = re.sub(r'const \[directRoute.*?;', '', content)
        content = re.sub(r'const \[safeRoute.*?;', '', content)
        content = re.sub(r'const \[info.*?;', '', content)

    # 4. UseEffect for hazards
    use_effect_hazard = """
  useEffect(() => {
    if (allRoutes.length > 0 && allRoutes[selectedRouteIndex]) {
      const openIssues = reports.filter(r => r.status !== 'RESOLVED');
      const onRoute = openIssues.filter(issue => pointToPolyDist([issue.latitude, issue.longitude], allRoutes[selectedRouteIndex].coords) < HAZARD_RADIUS);
      setHazards(onRoute);
    } else {
      setHazards([]);
    }
  }, [selectedRouteIndex, allRoutes, reports]);
"""
    content = content.replace("const clearRoutes = useCallback(() => {", use_effect_hazard + "\n  const clearRoutes = useCallback(() => {")

    # 5. clearRoutes function update
    clear_routes_pattern = re.compile(r'const clearRoutes = useCallback\(\(\) => \{.*?\},\s*\[\]\);', re.DOTALL)
    new_clear_routes = """const clearRoutes = useCallback(() => {
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    setHazards([]);
  }, []);"""
    content = clear_routes_pattern.sub(new_clear_routes, content)

    # 6. optimize function update
    optimize_pattern = re.compile(r'const optimize = useCallback\(async \(\) => \{.*?\},\s*\[source, destination, reports\]\);', re.DOTALL)
    set_loading_var = 'setRouteLoading' if is_citizen else 'setLoading'
    
    new_optimize = f"""const optimize = useCallback(async () => {{
    if (!source || !destination) return;
    {set_loading_var}(true);
    clearRoutes();

    try {{
      const openIssues = reports.filter(r => r.status !== 'RESOLVED');
      const getHazards = (coords: [number, number][]) => 
        openIssues.filter(issue => pointToPolyDist([issue.latitude, issue.longitude], coords) < HAZARD_RADIUS);

      const routes = await fetchAllRoutes([source, destination], 3);
      if (!routes.length) {{ alert('No route found between those points.'); return; }}

      const processedRoutes: RouteOption[] = [];

      for (const r of routes) {{
        const routeHazards = getHazards(r.coords);
        if (routeHazards.length === 0) {{
          processedRoutes.push({{ coords: r.coords, distance: r.distance, duration: r.duration, hazards: 0, status: 'safe' }});
        }} else {{
          const hazardPts = routeHazards.map(h => ({{ lat: h.latitude, lng: h.longitude }}));
          const detourWps = buildDetourWaypoints(source, destination, r.coords, hazardPts);
          const rerouted = await fetchAllRoutes(detourWps, false);
          
          if (rerouted.length > 0) {{
            const detourHazards = getHazards(rerouted[0].coords);
            if (detourHazards.length === 0) {{
              processedRoutes.push({{ coords: rerouted[0].coords, distance: rerouted[0].distance, duration: rerouted[0].duration, hazards: routeHazards.length, status: 'rerouted', isDetour: true }});
            }} else {{
              processedRoutes.push({{ coords: r.coords, distance: r.distance, duration: r.duration, hazards: routeHazards.length, status: 'warn' }});
            }}
          }} else {{
            processedRoutes.push({{ coords: r.coords, distance: r.distance, duration: r.duration, hazards: routeHazards.length, status: 'warn' }});
          }}
        }}
      }}

      processedRoutes.sort((a, b) => a.distance - b.distance);
      setAllRoutes(processedRoutes);
      setSelectedRouteIndex(0);
      setHazards(getHazards(processedRoutes[0].coords));
    }} catch (e) {{
      console.error('Route optimization failed:', e);
    }} finally {{
      {set_loading_var}(false);
    }}
  }}, [source, destination, reports, clearRoutes]);"""
    content = optimize_pattern.sub(new_optimize, content)

    # 7. Remove existing UI components (info card and polyline renders)
    # The info card uses {info && ... }
    info_card_pattern = re.compile(r'\{info && \(\s*<div className="p-3.*?</div>\s*</div>\s*\)\}', re.DOTALL)
    content = info_card_pattern.sub('', content)

    # The polylines use {/* Alternate route ... */} and {/* Primary route ... */}
    route_render_pattern1 = re.compile(r'\{\/\* Alternate route.*?\}\)', re.DOTALL)
    content = route_render_pattern1.sub('', content)
    route_render_pattern2 = re.compile(r'\{\/\* Primary route.*?\}\)', re.DOTALL)
    content = route_render_pattern2.sub('', content)

    # 8. Add Route Selection UI
    route_ui = """
      {/* Route UI */}
      {allRoutes.length > 0 && (
        <div className="absolute top-20 left-4 z-[1000] flex gap-2 overflow-x-auto max-w-[80vw]">
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
"""
    # Insert right before instruction banner
    instruction_banner = "{mode && ("
    content = content.replace(instruction_banner, route_ui + instruction_banner)

    # 9. Update Marker and Polyline inside MapContainer
    # Remove old markers
    old_markers = re.compile(r'\{\/\* Waypoints.*?Destination<.*?<\/Marker>\s*\)\}', re.DOTALL)
    
    new_markers_and_lines = """
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
"""
    content = old_markers.sub(new_markers_and_lines, content)

    # Additional fix for the missing parenthesis issue and empty space
    content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

update_file('c:/Users/sujay/Downloads/miniproject/src/components/authority/AuthorityMap.tsx', False)
update_file('c:/Users/sujay/Downloads/miniproject/src/components/citizen/IssuesNearMeMap.tsx', True)

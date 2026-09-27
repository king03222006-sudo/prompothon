import { useEffect, useState } from "react";
import { useEventsStore } from "../../hooks/useEventsStore";
import { useRoutesStore } from "../../hooks/useRoutesStore";
import { useMarkersStore } from "../../hooks/useMarkersStore";
import { useSelectionStore } from "../../hooks/useSelectionStore";
import { nearestCity, ROUTE_COLORS, KIND_COLORS, GEO_LOOKUP, type RouteKind, type MarkerKind } from "../globe/geo";
import { LiveEvent } from "../../lib/api/live-data";
import { AgentChatBox } from "./AgentChatBox";
import {
  Activity,
  AlertTriangle,
  Bell,
  Brain,
  Building2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Cloud,
  FileText,
  Flame,
  Layers,
  type LucideIcon,
  MapPin,
  Radar,
  Satellite,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  ThermometerSun,
  Truck,
  Users,
  Waves,
  X,
  Zap,
  Trash2,
} from "lucide-react";

/* ---------- shared ---------- */

/* Legacy glass replaced with CSS classes: glass-panel, glass-pill, glass-chip, glass-modal, glass-toast */

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ---------- top nav ---------- */

function TopNav() {
  const now = useNow();
  const time = now
    ? now.toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" }) + " UTC"
    : "—— : —— : ——";
  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-center justify-center px-6 pt-4">
      <div className="glass-pill flex items-center gap-5 px-5 py-2.5 anim-fade-down">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400/20 to-emerald-400/15">
            <Sparkles className="h-3.5 w-3.5 text-sky-300" />
          </div>
          <div className="leading-tight">
            <div className="text-[12px] font-semibold tracking-tight text-white/90">Sentinel</div>
            <div className="text-[9px] tracking-[0.2em] text-white/35">DISASTER · AI OS</div>
          </div>
        </div>

        <div className="h-4 w-px bg-white/[0.06]" />

        {/* Status */}
        <div className="hidden md:flex items-center gap-2 text-[11px] text-white/55">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-emerald-300/80">AI Online</span>
        </div>

        <div className="h-4 w-px bg-white/[0.06] hidden md:block" />

        {/* Time */}
        <div className="hidden sm:block tabular-nums tracking-wider text-[11px] text-white/50">{time}</div>

        <div className="h-4 w-px bg-white/[0.06] hidden sm:block" />

        <button className="rounded-xl p-1.5 text-white/40 transition-all hover:bg-white/[0.06] hover:text-white/70">
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

/* ---------- left: live events ---------- */

function LiveEvents({
  events,
  lastUpdated,
  activeEventId,
  onSelect,
}: {
  events: LiveEvent[];
  lastUpdated: Date | null;
  activeEventId: string | null;
  onSelect: (id: string) => void;
}) {
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="pointer-events-auto absolute left-5 top-20 z-20 flex h-10 w-10 items-center justify-center glass-chip !rounded-full anim-fade-up group shadow-lg"
        title="Show Live Events"
      >
        <Activity className="h-4 w-4 text-sky-400 group-hover:scale-110 transition-transform" />
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/80 text-[8px] font-bold text-white shadow-[0_0_8px_rgba(14,165,233,0.4)]">
          {events.length}
        </span>
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto absolute left-5 top-20 z-20 w-[280px] glass-panel p-3.5 max-h-[calc(100vh-160px)] overflow-y-auto glass-scroll anim-fade-up">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px] tracking-[0.22em] text-white/35 font-medium">
          <Activity className="h-3 w-3 text-sky-400/60" /> LIVE EVENTS
        </div>
        <div className="flex items-center gap-2">
          <span className="glass-chip px-2 py-0.5 text-[9px] text-white/50 tabular-nums">{events.length} active</span>
          <button
            onClick={() => setMinimized(true)}
            className="rounded-lg p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
            title="Minimize"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {events.map((e) => {
          const open = e.id === activeEventId;
          return (
            <button
              key={e.id}
              onClick={() => {
                onSelect(e.id);
              }}
              className={`w-full rounded-2xl text-left transition-all duration-280 ${open
                  ? "glass-chip !border-white/[0.1] !bg-white/[0.05]"
                  : "bg-transparent hover:bg-white/[0.03] border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.dot} ${e.color} glow-dot`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[12px] font-semibold text-white/90">{e.title}</span>
                    <span className={`shrink-0 text-[9px] font-medium ${e.color}`}>{e.severity}</span>
                  </div>
                  <div className="truncate text-[10px] text-white/35 mt-0.5">{e.location}</div>
                </div>
              </div>
              <div
                className={`grid grid-cols-3 gap-1.5 overflow-hidden px-2.5 transition-all duration-280 ${open ? "max-h-28 pb-2.5 opacity-100" : "max-h-0 opacity-0"
                  }`}
              >
                <Metric
                  label={e.hazardType === "wildfire" ? "Area" : e.hazardType === "storm" ? "Wind" : "Magnitude"}
                  value={e.magnitude !== "—" ? `${e.magnitude} ${e.magnitudeUnit}`.trim() : "—"}
                />
                <Metric label="Detected" value={e.detected} />
                <Metric label="Source" value={e.source === "USGS" ? "USGS" : "EONET"} />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-1.5 border border-white/[0.04]">
      <div className="text-[8px] tracking-wider text-white/30 font-medium">{label}</div>
      <div className="text-[11px] tabular-nums text-white/85 font-medium">{value}</div>
    </div>
  );
}

/* ---------- right: AI panel ---------- */

const aiSteps = [
  "Satellite imagery",
  "Historical disasters",
  "Weather forecast",
  "Road conditions",
  "Citizen reports",
];

const aiFeed = [
  "Scanning satellite imagery…",
  "Comparing 2001 Bhuj earthquake patterns…",
  "Predicting aftershock probabilities…",
  "Checking hospital availability within 50km…",
  "Finding safest evacuation route…",
  "Cross-referencing weather forecast…",
];

const getAiSteps = (hazardType: string) => {
  const base = ["Imagery scan", "Historical comparison", "Impact prediction", "Resource routing", "Evacuation path"];
  if (hazardType === "wildfire") return ["Thermal imagery scan", "Wind speed modeling", "Fuel index loading", "Containment routing", "Evacuation modeling"];
  if (hazardType === "storm") return ["Radar Doppler tracking", "Barometric pressure scan", "Storm surge forecast", "Shelter capacity check", "Corridor clearing"];
  if (hazardType === "flood") return ["Elevation hydro-mapping", "Inundation modeling", "Safe hub validation", "Rescue path generation", "Complete model"];
  return base;
};

const getAiFeed = (hazardType: string, location: string) => {
  const loc = location.split(",")[0];
  if (hazardType === "wildfire") return [
    `Scanning thermal imagery for ${loc}…`,
    "Calculating fire front rate of spread…",
    "Assessing wind speed and moisture index…",
    "Checking shelter availability within 30km…",
    "Drafting optimal containment zones…",
  ];
  if (hazardType === "storm") return [
    `Analyzing atmospheric pressure at ${loc}…`,
    "Plotting cone of uncertainty and landfall…",
    "Estimating storm surge heights…",
    "Verifying hospital evacuation capacities…",
    "Synthesizing emergency alerts…",
  ];
  if (hazardType === "earthquake") return [
    `Detecting seismic wave propagation at ${loc}…`,
    "Comparing historical slip slip patterns…",
    "Predicting aftershock probability…",
    "Checking transport corridor blockages…",
    "Generating optimal rescue routing…",
  ];
  return [
    `Scanning multi-spectral imagery at ${loc}…`,
    "Correlating structural risk factors…",
    "Verifying resource deployment channels…",
    "Formulating evacuation pathways…",
  ];
};

function AIPanel({ activeEvent }: { activeEvent: LiveEvent | null }) {
  const [minimized, setMinimized] = useState(false);
  const [done, setDone] = useState<number>(0);
  const [feed, setFeed] = useState(0);

  const steps = activeEvent ? getAiSteps(activeEvent.hazardType) : aiSteps;
  const feedItems = activeEvent ? getAiFeed(activeEvent.hazardType, activeEvent.location) : aiFeed;

  useEffect(() => {
    setDone(0);
    setFeed(0);
  }, [activeEvent?.id]);

  useEffect(() => {
    if (done >= steps.length) return;
    const t = setTimeout(() => setDone((d) => d + 1), 600);
    return () => clearTimeout(t);
  }, [done, steps.length]);

  useEffect(() => {
    const id = setInterval(() => setFeed((f) => (f + 1) % feedItems.length), 2200);
    return () => clearInterval(id);
  }, [feedItems.length]);

  const complete = done >= steps.length;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="pointer-events-auto absolute right-5 top-20 z-20 flex h-10 w-10 items-center justify-center glass-chip !rounded-full anim-fade-up group shadow-lg"
        title="Show AI Reasoning"
      >
        <Brain className="h-4.5 w-4.5 text-violet-400 group-hover:scale-110 transition-transform" />
        <span className={`absolute -right-1 -top-1 flex h-2.5 w-2.5 rounded-full ${complete ? 'bg-emerald-400' : 'bg-sky-400 animate-pulse'} glow-dot`} />
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto absolute right-5 top-20 z-20 w-[260px] glass-panel p-3.5 anim-fade-up">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px] tracking-[0.22em] text-white/35 font-medium">
          <Brain className="h-3 w-3 text-violet-400/60" /> AI REASONING
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[9px] text-emerald-300/70">
            <span className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${complete ? '' : 'animate-pulse'} glow-dot`} style={{ color: '#34d399' }} />
            {complete ? "Complete" : "Live"}
          </span>
          <button
            onClick={() => setMinimized(true)}
            className="rounded-lg p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
            title="Minimize"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3 text-[12px] leading-relaxed text-white/70">
        {complete ? "Analysis completed." : "Analyzing event signals…"}
      </div>

      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const isDone = i < done;
          const isActive = i === done && !complete;
          return (
            <div key={s} className="flex items-center gap-2.5 text-[11px]">
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full transition-all duration-280 text-[8px] ${isDone
                    ? "bg-emerald-400/15 text-emerald-300"
                    : isActive
                      ? "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/30"
                      : "bg-white/[0.04] text-white/20"
                  }`}
              >
                {isDone ? "✓" : isActive ? <Circle className="h-1.5 w-1.5 animate-pulse fill-current" /> : ""}
              </span>
              <span className={`transition-colors duration-200 ${isDone ? "text-white/75 font-medium" : isActive ? "text-white/60" : "text-white/25"}`}>
                {s}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-white/[0.04] pt-3">
        <div className="glass-chip px-2.5 py-1.5">
          <div className="text-[8px] tracking-wider text-white/30 font-medium">CONFIDENCE</div>
          <div className="text-[14px] text-emerald-300 tabular-nums font-semibold">94%</div>
        </div>
        <div className="glass-chip px-2.5 py-1.5">
          <div className="text-[8px] tracking-wider text-white/30 font-medium">ETA</div>
          <div className="text-[14px] text-white/80 tabular-nums font-semibold">
            {complete ? "0s" : `${Math.max(1, steps.length - done)}s`}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 glass-chip px-2.5 py-2 text-[10px] text-white/45">
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-sky-300/70" />
        <span className="leading-relaxed">{feedItems[feed]}</span>
      </div>
    </aside>
  );
}

/* ---------- globe layer toggles ---------- */

const layers: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "weather", label: "Weather", icon: Cloud },
  { id: "heat", label: "Heatmap", icon: ThermometerSun },
  { id: "sat", label: "Satellite", icon: Satellite },
  { id: "routes", label: "Routes", icon: Radar },
];

function LayerToggles() {
  const [on, setOn] = useState<Record<string, boolean>>({ routes: true });
  return (
    <div className="pointer-events-none absolute left-1/2 top-[72px] z-20 -translate-x-1/2">
      <div className="pointer-events-auto glass-pill flex items-center gap-0.5 p-1 anim-fade-down">
        {layers.map((l) => {
          const active = !!on[l.id];
          const Icon = l.icon;
          return (
            <button
              key={l.id}
              onClick={() => setOn((p) => ({ ...p, [l.id]: !p[l.id] }))}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all duration-200 ${active ? "bg-white/[0.08] text-white/90 shadow-sm" : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                }`}
            >
              <Icon className="h-3 w-3" />
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- AI memory floating chip ---------- */

function MemoryChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="pointer-events-auto absolute right-5 top-[390px] z-20 glass-chip group flex items-center gap-2.5 px-3 py-2 text-left anim-fade-up"
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
        <Brain className="h-3 w-3" />
      </div>
      <div className="leading-tight">
        <div className="text-[10px] font-medium text-white/80">Historical memory</div>
        <div className="text-[9px] text-white/30">4 refs · compare</div>
      </div>
      <ChevronRight className="h-3 w-3 text-white/20 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

/* ---------- manual controls modal ---------- */

function ManualControlsModal({
  onClose,
  addRoute,
  addMarker,
}: {
  onClose: () => void;
  addRoute: any;
  addMarker: any;
}) {
  const [tab, setTab] = useState<"route" | "marker">("route");

  // Route Form State
  const [routeKind, setRouteKind] = useState<RouteKind>("supply");
  const [routeFromCity, setRouteFromCity] = useState("Hyderabad");
  const [routeToCity, setRouteToCity] = useState("Mumbai");
  const [customFrom, setCustomFrom] = useState({ lat: "", lng: "" });
  const [customTo, setCustomTo] = useState({ lat: "", lng: "" });
  const [useCustomRoute, setUseCustomRoute] = useState(false);

  // Marker Form State
  const [markerKind, setMarkerKind] = useState<MarkerKind>("safe");
  const [markerName, setMarkerName] = useState("");
  const [markerCity, setMarkerCity] = useState("Hyderabad");
  const [customMarker, setCustomMarker] = useState({ lat: "", lng: "" });
  const [useCustomMarker, setUseCustomMarker] = useState(false);

  const handleSubmitRoute = (e: React.FormEvent) => {
    e.preventDefault();
    let fromCoords: [number, number] = [0, 0];
    let toCoords: [number, number] = [0, 0];
    let fromName = routeFromCity;
    let toName = routeToCity;

    if (useCustomRoute) {
      const flat = parseFloat(customFrom.lat);
      const flng = parseFloat(customFrom.lng);
      const tlat = parseFloat(customTo.lat);
      const tlng = parseFloat(customTo.lng);
      if (isNaN(flat) || isNaN(flng) || isNaN(tlat) || isNaN(tlng)) {
        alert("Invalid custom coordinates");
        return;
      }
      fromCoords = [flat, flng];
      toCoords = [tlat, tlng];
      fromName = `${flat.toFixed(2)}, ${flng.toFixed(2)}`;
      toName = `${tlat.toFixed(2)}, ${tlng.toFixed(2)}`;
    } else {
      const from = GEO_LOOKUP[routeFromCity];
      const to = GEO_LOOKUP[routeToCity];
      if (!from || !to) return;
      fromCoords = from;
      toCoords = to;
    }

    addRoute({
      from: fromCoords,
      to: toCoords,
      kind: routeKind,
      fromName,
      toName,
    });
    onClose();
  };

  const handleSubmitMarker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!markerName.trim()) {
      alert("Marker name is required");
      return;
    }
    let coords: [number, number] = [0, 0];
    if (useCustomMarker) {
      const lat = parseFloat(customMarker.lat);
      const lng = parseFloat(customMarker.lng);
      if (isNaN(lat) || isNaN(lng)) {
        alert("Invalid custom coordinates");
        return;
      }
      coords = [lat, lng];
    } else {
      const c = GEO_LOOKUP[markerCity];
      if (!c) return;
      coords = c;
    }

    addMarker({
      name: markerName,
      lat: coords[0],
      lng: coords[1],
      kind: markerKind,
    });
    onClose();
  };

  const cities = Object.keys(GEO_LOOKUP).sort();

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-md anim-scale-in">
      <div className="w-full max-w-md glass-modal p-5">
        <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-sky-300" />
            <span className="text-sm font-semibold text-white/95">Manual Globe Controls</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("route")}
            className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
              tab === "route"
                ? "bg-sky-500/20 border-sky-400/40 text-sky-200"
                : "border-white/5 bg-white/[0.02] text-white/40 hover:text-white/70"
            }`}
          >
            Add Supply Route
          </button>
          <button
            onClick={() => setTab("marker")}
            className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
              tab === "marker"
                ? "bg-sky-500/20 border-sky-400/40 text-sky-200"
                : "border-white/5 bg-white/[0.02] text-white/40 hover:text-white/70"
            }`}
          >
            Add Location Pin
          </button>
        </div>

        {tab === "route" ? (
          <form onSubmit={handleSubmitRoute} className="space-y-3.5">
            <div>
              <label className="text-[10px] tracking-wider text-white/45 block mb-1">ROUTE KIND</label>
              <select
                value={routeKind}
                onChange={(e) => setRouteKind(e.target.value as any)}
                className="w-full glass-input px-3 py-2 text-[12px] text-white/80"
              >
                <option value="supply">Supply Arc (Blue)</option>
                <option value="rescue">Rescue Arc (Green)</option>
                <option value="evacuation">Evacuation Arc (Red)</option>
                <option value="airsupport">Air Support Arc (White)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="customRouteCoords"
                checked={useCustomRoute}
                onChange={(e) => setUseCustomRoute(e.target.checked)}
                className="rounded border-white/10 bg-transparent text-sky-500 focus:ring-0"
              />
              <label htmlFor="customRouteCoords" className="text-[10px] text-white/60 select-none">
                Use Custom Coordinates
              </label>
            </div>

            {!useCustomRoute ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] tracking-wider text-white/45 block mb-1">ORIGIN CITY</label>
                  <select
                    value={routeFromCity}
                    onChange={(e) => setRouteFromCity(e.target.value)}
                    className="w-full glass-input px-3 py-2 text-[12px] text-white/80"
                  >
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] tracking-wider text-white/45 block mb-1">DESTINATION CITY</label>
                  <select
                    value={routeToCity}
                    onChange={(e) => setRouteToCity(e.target.value)}
                    className="w-full glass-input px-3 py-2 text-[12px] text-white/80"
                  >
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] text-white/35 block mb-0.5">FROM LATITUDE</label>
                    <input
                      type="number" step="any" placeholder="e.g. 17.39"
                      value={customFrom.lat} onChange={(e) => setCustomFrom(p => ({ ...p, lat: e.target.value }))}
                      className="w-full glass-input px-3 py-1.5 text-[12px] text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-white/35 block mb-0.5">FROM LONGITUDE</label>
                    <input
                      type="number" step="any" placeholder="e.g. 78.49"
                      value={customFrom.lng} onChange={(e) => setCustomFrom(p => ({ ...p, lng: e.target.value }))}
                      className="w-full glass-input px-3 py-1.5 text-[12px] text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] text-white/35 block mb-0.5">TO LATITUDE</label>
                    <input
                      type="number" step="any" placeholder="e.g. 19.08"
                      value={customTo.lat} onChange={(e) => setCustomTo(p => ({ ...p, lat: e.target.value }))}
                      className="w-full glass-input px-3 py-1.5 text-[12px] text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-white/35 block mb-0.5">TO LONGITUDE</label>
                    <input
                      type="number" step="any" placeholder="e.g. 72.88"
                      value={customTo.lng} onChange={(e) => setCustomTo(p => ({ ...p, lng: e.target.value }))}
                      className="w-full glass-input px-3 py-1.5 text-[12px] text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="w-full rounded-xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/30 text-sky-200 py-2.5 text-[12px] font-semibold transition-colors mt-2">
              Draw Route
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitMarker} className="space-y-3.5">
            <div>
              <label className="text-[10px] tracking-wider text-white/45 block mb-1">PIN NAME</label>
              <input
                type="text" placeholder="e.g. Command Center, Resource Hub"
                value={markerName} onChange={(e) => setMarkerName(e.target.value)}
                className="w-full bg-[#0a0d14]/95 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] tracking-wider text-white/45 block mb-1">PIN KIND</label>
                <select
                  value={markerKind}
                  onChange={(e) => setMarkerKind(e.target.value as any)}
                  className="w-full bg-[#0a0d14]/90 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white/80 outline-none"
                >
                  <option value="safe">Safe Hub (Green)</option>
                  <option value="warning">Warning Zone (Yellow)</option>
                  <option value="highrisk">High-Risk (Orange)</option>
                  <option value="critical">Critical Zone (Red)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] tracking-wider text-white/45 block mb-1">LOCATION SOURCE</label>
                <div className="flex items-center gap-1.5 h-10">
                  <input
                    type="checkbox"
                    id="customMarkerCoords"
                    checked={useCustomMarker}
                    onChange={(e) => setUseCustomMarker(e.target.checked)}
                    className="rounded border-white/10 bg-transparent text-sky-500 focus:ring-0"
                  />
                  <label htmlFor="customMarkerCoords" className="text-[10px] text-white/60 select-none">
                    Custom Coords
                  </label>
                </div>
              </div>
            </div>

            {!useCustomMarker ? (
              <div>
                <label className="text-[10px] tracking-wider text-white/45 block mb-1">CITY / REGION</label>
                <select
                  value={markerCity}
                  onChange={(e) => setMarkerCity(e.target.value)}
                  className="w-full bg-[#0a0d14]/90 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white/80 outline-none"
                >
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-white/35 block mb-0.5">LATITUDE</label>
                  <input
                    type="number" step="any" placeholder="e.g. 17.39"
                    value={customMarker.lat} onChange={(e) => setCustomMarker(p => ({ ...p, lat: e.target.value }))}
                    className="w-full bg-[#0a0d14]/95 border border-white/10 rounded-xl px-3 py-1.5 text-[12px] text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-white/35 block mb-0.5">LONGITUDE</label>
                  <input
                    type="number" step="any" placeholder="e.g. 78.49"
                    value={customMarker.lng} onChange={(e) => setCustomMarker(p => ({ ...p, lng: e.target.value }))}
                    className="w-full bg-[#0a0d14]/95 border border-white/10 rounded-xl px-3 py-1.5 text-[12px] text-white outline-none"
                  />
                </div>
              </div>
            )}

            <button type="submit" className="w-full rounded-xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/30 text-sky-200 py-2.5 text-[12px] font-semibold transition-colors mt-2">
              Place Geo Pin
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------- memory modal ---------- */

function MemoryModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-md anim-scale-in">
      <div className="w-full max-w-lg glass-modal p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-300" />
            <span className="text-sm text-white/90">Historical Memory</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {[
            { y: "2001", t: "Bhuj Earthquake", s: "7.7 Mw · 20K casualties · pattern match 71%" },
            { y: "2021", t: "Cyclone Tauktae", s: "Cat 4 · evac model reused" },
            { y: "2018", t: "Kerala Floods", s: "Aftershock-flood correlation" },
            { y: "2015", t: "Nepal Earthquake", s: "Aftershock data: 47 events" },
          ].map((m) => (
            <div key={m.t} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
              <div className="w-12 text-[11px] tabular-nums text-white/40">{m.y}</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/90">{m.t}</div>
                <div className="text-[11px] text-white/45">{m.s}</div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-white/30" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- InfoTooltip ---------- */

const HAZARD_EMOJI: Record<string, string> = {
  earthquake: "🌍",
  wildfire:   "🔥",
  storm:      "🌪️",
  volcano:    "🌋",
  flood:      "🌊",
  other:      "⚠️",
};

const ROUTE_EMOJI: Record<string, string> = {
  rescue:      "🟠",
  evacuation:  "🔵",
  supply:      "🟡",
  airsupport:  "⚪",
  medical:     "🟢",
  firefighting:"🔴",
  flood:       "💧",
  satellite:   "🔮",
  neural:      "🧠",
};

const KIND_LABEL: Record<string, string> = {
  critical: "Critical Zone",
  warning:  "Warning Zone",
  highrisk: "High-Risk Zone",
  safe:     "Safe Hub",
};

function InfoTooltip() {
  const { selected, clear } = useSelectionStore();
  const { events, removeEvent } = useEventsStore();
  const { routes, removeRoute } = useRoutesStore();
  const { markers, removeMarker } = useMarkersStore();

  if (!selected) return null;

  /* ── resolve selected item data ── */
  let content: React.ReactNode = null;
  let accentColor = "#38bdf8";
  let titleText = "";

  if (selected.type === "event") {
    const ev = events.find((e) => e.id === selected.id);
    if (!ev) return null;

    const emoji = HAZARD_EMOJI[ev.hazardType] ?? "⚠️";
    const HCOLORS: Record<string, string> = {
      earthquake: "#ff3344", wildfire: "#ff7a20", storm: "#a78bfa",
      volcano: "#ef4444", flood: "#38bdf8", other: "#94a3b8",
    };
    accentColor = HCOLORS[ev.hazardType] ?? "#94a3b8";
    titleText = `${emoji} ${ev.title}`;

    // Find routes that pass near this event (within ~12°)
    const nearbyRoutes = routes.filter((r) => {
      const fd = Math.sqrt((ev.coords[0] - r.from[0]) ** 2 + (ev.coords[1] - r.from[1]) ** 2);
      const td = Math.sqrt((ev.coords[0] - r.to[0])   ** 2 + (ev.coords[1] - r.to[1])   ** 2);
      return fd < 20 || td < 20;
    });

    content = (
      <>
        {/* Location + coords */}
        <div className="text-[13px] font-semibold text-white/95 leading-snug">{ev.location}</div>
        <div className="text-[10px] text-white/35 mt-0.5">
          {Math.abs(ev.coords[0]).toFixed(3)}°{ev.coords[0] >= 0 ? "N" : "S"} · {Math.abs(ev.coords[1]).toFixed(3)}°{ev.coords[1] >= 0 ? "E" : "W"}
        </div>

        {/* Stats row */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <StatChip label="Severity" value={ev.severity} accent={accentColor} />
          {ev.magnitude !== "—" && (
            <StatChip label="Magnitude" value={`${ev.magnitude}${ev.magnitudeUnit ? " " + ev.magnitudeUnit : ""}`} />
          )}
          <StatChip label="Type" value={ev.hazardType.charAt(0).toUpperCase() + ev.hazardType.slice(1)} />
          <StatChip label="Detected" value={ev.detected} />
          <StatChip label="Source" value={ev.source} />
        </div>

        {/* Nearby routes */}
        {nearbyRoutes.length > 0 && (
          <div className="mt-2.5">
            <div className="mb-1 text-[9px] tracking-[0.18em] text-white/30">NEARBY ROUTES</div>
            <div className="flex flex-wrap gap-1.5">
              {nearbyRoutes.map((r) => {
                const fName = r.fromName ?? nearestCity(r.from[0], r.from[1]);
                const tName = r.toName   ?? nearestCity(r.to[0],   r.to[1]);
                const isFrom = Math.sqrt((ev.coords[0] - r.from[0]) ** 2 + (ev.coords[1] - r.from[1]) ** 2) < 20;
                return (
                  <div key={r.id} className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/55">
                    <span>{ROUTE_EMOJI[r.kind]}</span>
                    <span className="font-medium text-white/70" style={{ color: ROUTE_COLORS[r.kind] }}>
                      {r.kind.charAt(0).toUpperCase() + r.kind.slice(1)}
                    </span>
                    <span>{isFrom ? `→ ${tName}` : `from ${fName}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  } else if (selected.type === "route") {
    const rt = routes.find((r) => r.id === selected.id);
    if (!rt) return null;

    const fName = rt.fromName ?? nearestCity(rt.from[0], rt.from[1]);
    const tName = rt.toName   ?? nearestCity(rt.to[0],   rt.to[1]);
    accentColor = ROUTE_COLORS[rt.kind];
    titleText = `${ROUTE_EMOJI[rt.kind]} ${rt.kind.charAt(0).toUpperCase() + rt.kind.slice(1)} Route`;

    content = (
      <>
        {/* Route path */}
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white/95">
          <span>{fName}</span>
          <svg width="32" height="10" viewBox="0 0 32 10" fill="none">
            <path d="M0 5h28M24 1l4 4-4 4" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{tName}</span>
        </div>
        {/* Coords */}
        <div className="mt-1 text-[10px] text-white/30">
          Origin: {Math.abs(rt.from[0]).toFixed(1)}°{rt.from[0] >= 0 ? "N" : "S"}, {Math.abs(rt.from[1]).toFixed(1)}°{rt.from[1] >= 0 ? "E" : "W"}
          &nbsp;→&nbsp;
          Dest: {Math.abs(rt.to[0]).toFixed(1)}°{rt.to[0] >= 0 ? "N" : "S"}, {Math.abs(rt.to[1]).toFixed(1)}°{rt.to[1] >= 0 ? "E" : "W"}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <StatChip label="Type" value={rt.kind.toUpperCase()} accent={accentColor} />
          <StatChip label="Status" value="Active" />
          <StatChip label="ID" value={rt.id} />
        </div>

        {/* Events near endpoints */}
        {(() => {
          const nearEvts = events.filter((e) => {
            const fd = Math.sqrt((e.coords[0] - rt.from[0]) ** 2 + (e.coords[1] - rt.from[1]) ** 2);
            const td = Math.sqrt((e.coords[0] - rt.to[0])   ** 2 + (e.coords[1] - rt.to[1])   ** 2);
            return fd < 20 || td < 20;
          }).slice(0, 3);
          if (!nearEvts.length) return null;
          return (
            <div className="mt-2.5">
              <div className="mb-1 text-[9px] tracking-[0.18em] text-white/30">NEARBY EVENTS</div>
              <div className="flex flex-wrap gap-1.5">
                {nearEvts.map((e) => (
                  <div key={e.id} className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/55">
                    <span>{HAZARD_EMOJI[e.hazardType]}</span>
                    <span>{e.title}</span>
                    <span className="text-white/30">·</span>
                    <span className="truncate max-w-[100px]">{e.location.split(",")[0]}</span>
                    {e.magnitude !== "—" && <span className="text-white/40">M{e.magnitude}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </>
    );
  } else if (selected.type === "geoMarker") {
    const mk = markers.find((m) => m.id === selected.id);
    if (!mk) return null;

    accentColor = KIND_COLORS[mk.kind] ?? "#94a3b8";
    titleText = `📍 ${mk.name}`;

    const nearRoutes = routes.filter((r) => {
      const fd = Math.sqrt((mk.lat - r.from[0]) ** 2 + (mk.lng - r.from[1]) ** 2);
      const td = Math.sqrt((mk.lat - r.to[0])   ** 2 + (mk.lng - r.to[1])   ** 2);
      return fd < 12 || td < 12;
    });

    content = (
      <>
        <div className="text-[13px] font-semibold text-white/95">{mk.name}</div>
        <div className="mt-0.5 text-[10px] text-white/35">
          {Math.abs(mk.lat).toFixed(3)}°{mk.lat >= 0 ? "N" : "S"} · {Math.abs(mk.lng).toFixed(3)}°{mk.lng >= 0 ? "E" : "W"}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <StatChip label="Status" value={KIND_LABEL[mk.kind] ?? mk.kind} accent={accentColor} />
          <StatChip label="ID" value={mk.id} />
        </div>
        {nearRoutes.length > 0 && (
          <div className="mt-2.5">
            <div className="mb-1 text-[9px] tracking-[0.18em] text-white/30">CONNECTED ROUTES</div>
            <div className="flex flex-wrap gap-1.5">
              {nearRoutes.map((r) => {
                const fName = r.fromName ?? nearestCity(r.from[0], r.from[1]);
                const tName = r.toName   ?? nearestCity(r.to[0],   r.to[1]);
                return (
                  <div key={r.id} className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/55">
                    <span>{ROUTE_EMOJI[r.kind]}</span>
                    <span style={{ color: ROUTE_COLORS[r.kind] }} className="font-medium">{r.kind}</span>
                    <span>{fName} → {tName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute left-1/2 z-30 w-[420px] max-w-[calc(100vw-340px)] -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-200"
      style={{ top: "5.5rem" }}
    >
      <div
        className="relative glass-panel px-4 py-3"
        style={{ boxShadow: `0 0 0 1px ${accentColor}22, 0 12px 40px rgba(0,0,0,0.4), 0 0 30px ${accentColor}12` }}
      >
        {/* Accent top bar */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}aa, transparent)` }}
        />

        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
            />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: accentColor }}>
              {titleText}
            </span>
          </div>
          <button
            onClick={clear}
            className="rounded p-0.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Dynamic content */}
        <div className="text-white/80">{content}</div>

        {/* Action footer */}
        <div className="mt-3.5 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
          <button
            onClick={() => {
              if (selected.type === "event") removeEvent(selected.id);
              else if (selected.type === "route") removeRoute(selected.id);
              else if (selected.type === "geoMarker") removeMarker(selected.id);
              clear();
            }}
            className="flex items-center gap-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-[10px] text-rose-300 font-semibold transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Remove Item
          </button>
          <div className="text-[9px] text-white/20">Click same item again to dismiss</div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-white/[0.05] bg-white/[0.03] px-2 py-1">
      <span className="text-[8px] tracking-widest text-white/30">{label.toUpperCase()}</span>
      <span
        className="text-[11px] font-medium tabular-nums"
        style={accent ? { color: accent } : { color: "rgba(255,255,255,0.85)" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ---------- main ---------- */

export function Dashboard() {
  const [activeEventId, setActiveEventId] = useState<string | null>(null);  const [memOpen, setMemOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { events, loading, lastUpdated, error } = useEventsStore();
  const { addRoute } = useRoutesStore();
  const { addMarker } = useMarkersStore();

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((curr) => curr === msg ? null : curr), 3000);
  };

  useEffect(() => {
    if (events.length > 0 && !activeEventId) {
      setActiveEventId(events[0].id);
    }
  }, [events, activeEventId]);

  const activeEvent = events.find(e => e.id === activeEventId) || events[0];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-white">
      {/* subtle vignette — reduced to allow more globe visibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.5)_100%)]" />

      <TopNav />
      <LayerToggles />
      
      {error ? (
        <div className="pointer-events-auto absolute left-5 top-20 z-20 w-[280px] glass-panel !border-rose-500/20 p-3.5 flex flex-col gap-2 anim-fade-up">
          <div className="flex items-center gap-2 text-rose-300 font-semibold text-[10px] tracking-wider uppercase">
            <AlertTriangle className="h-3 w-3" /> Offline
          </div>
          <span className="text-[11px] text-white/50">{error}</span>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-[10px] text-rose-300 font-semibold text-center transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="pointer-events-auto absolute left-5 top-20 z-20 w-[280px] glass-panel p-4 flex items-center gap-3 anim-fade-up">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
          </span>
          <span className="text-[11px] text-white/50">Initializing live feeds…</span>
        </div>
      ) : (
        <LiveEvents events={events} lastUpdated={lastUpdated} activeEventId={activeEventId} onSelect={(id) => { setActiveEventId(id); setCardOpen(true); }} />
      )}

      <AIPanel activeEvent={activeEvent || null} />
      <MemoryChip onOpen={() => setMemOpen(true)} />      <InfoTooltip />
      {memOpen && <MemoryModal onClose={() => setMemOpen(false)} />}
      {controlsOpen && (
        <ManualControlsModal
          onClose={() => setControlsOpen(false)}
          addRoute={addRoute}
          addMarker={addMarker}
        />
      )}


      {/* unused icons silenced */}
      <span className="hidden">
        <Flame />
        <MapPin />
      </span>

      {/* AI Agent Chatbox */}
      <AgentChatBox />
    </div>
  );
}

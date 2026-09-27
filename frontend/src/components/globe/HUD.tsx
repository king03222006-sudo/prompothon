import { useState } from "react";
import { AlertTriangle, Flame, Shield, Plane, Plus, Minus, RotateCw, Navigation, ChevronLeft, ChevronRight } from "lucide-react";

import { useEventsStore } from "../../hooks/useEventsStore";
import { useRoutesStore } from "../../hooks/useRoutesStore";
import { useMarkersStore } from "../../hooks/useMarkersStore";
import { useSelectionStore } from "../../hooks/useSelectionStore";

const legend = [
  { icon: <span className="h-2 w-2 rounded-full bg-[#ff3344]" style={{ boxShadow: '0 0 8px #ff3344' }} />, label: "CRITICAL" },
  { icon: <Flame className="h-3 w-3 text-[#ff7a3a]" />, label: "HIGH RISK" },
  { icon: <AlertTriangle className="h-3 w-3 text-[#ffb347]" />, label: "WARNING" },
  { icon: <Shield className="h-3 w-3 text-[#3dffa5]" />, label: "SAFE" },
];

const routesLegend = [
  { color: "#3dffa5", label: "RESCUE" },
  { color: "#ff3344", label: "EVAC" },
  { color: "#3ab6ff", label: "SUPPLY" },
  { color: "#cbd5e1", label: "AIR" },
];

export function HUD() {
  const { events } = useEventsStore();
  const { routes } = useRoutesStore();
  const { markers } = useMarkersStore();
  const { selected } = useSelectionStore();
  const [legendOpen, setLegendOpen] = useState(true);

  // Calculate dynamic coordinates label based on selection
  let latLngText = "LAT 00.00 · LNG 00.00";
  if (selected) {
    if (selected.type === "event") {
      const ev = events.find((e) => e.id === selected.id);
      if (ev) {
        const lat = ev.coords[0];
        const lng = ev.coords[1];
        latLngText = `LAT ${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} · LNG ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
      }
    } else if (selected.type === "geoMarker") {
      const mk = markers.find((m) => m.id === selected.id);
      if (mk) {
        latLngText = `LAT ${Math.abs(mk.lat).toFixed(3)}°${mk.lat >= 0 ? "N" : "S"} · LNG ${Math.abs(mk.lng).toFixed(3)}°${mk.lng >= 0 ? "E" : "W"}`;
      }
    }
  } else if (events.length > 0) {
    const lat = events[0].coords[0];
    const lng = events[0].coords[1];
    latLngText = `LAT ${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} · LNG ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
  }

  const activeAlertsCount = String(events.length).padStart(2, "0");
  const safeCorridorsCount = String(routes.filter((r) => r.kind !== "evacuation").length).padStart(2, "0");
  const assetsInFlightCount = String(routes.filter((r) => r.kind === "airsupport").length * 2 + 3).padStart(2, "0");

  const totalPopulation = events.reduce((sum, e) => {
    const p = e.severity === "Critical" ? 650000 : e.severity === "High" ? 180000 : 25000;
    return sum + p;
  }, 0);
  const populationText = totalPopulation >= 1000000
    ? `${(totalPopulation / 1000000).toFixed(1)}M`
    : `${(totalPopulation / 1000).toFixed(0)}K`;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-mono text-[10px] tracking-[0.18em] text-foreground/90">
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3dffa5]" style={{ boxShadow: '0 0 10px #3dffa5' }} />
          <span className="text-foreground/40 text-[9px]">ORBITAL COMMAND // LIVE</span>
        </div>
        <div className="flex items-center gap-5 text-foreground/30 text-[9px]">
          <span>SECTOR 07-A</span>
          <span className="tabular-nums">{latLngText}</span>
          <span className="text-emerald-400/50">SYS NOMINAL</span>
        </div>
      </div>

      {/* Corner brackets */}
      {[
        "left-3 top-10 border-l border-t",
        "right-3 top-10 border-r border-t",
        "left-3 bottom-10 border-l border-b",
        "right-3 bottom-10 border-r border-b",
      ].map((c, i) => (
        <div key={i} className={`absolute h-5 w-5 border-foreground/15 ${c}`} />
      ))}

      {/* Right controls */}
      <div className="pointer-events-auto absolute right-5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5">
        <div className="glass-chip flex h-11 w-11 items-center justify-center !rounded-full">
          <Navigation className="h-4 w-4 text-[#3dffa5]/80" />
        </div>
        <div className="glass-chip flex flex-col overflow-hidden !rounded-2xl">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("globe-zoom", { detail: -0.25 }))}
            className="p-2 hover:bg-white/[0.06] transition-colors"
            aria-label="Zoom In"
          >
            <Plus className="h-3 w-3 text-white/50" />
          </button>
          <div className="h-px bg-white/[0.06]" />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("globe-zoom", { detail: 0.25 }))}
            className="p-2 hover:bg-white/[0.06] transition-colors"
            aria-label="Zoom Out"
          >
            <Minus className="h-3 w-3 text-white/50" />
          </button>
          <div className="h-px bg-white/[0.06]" />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("globe-rotate"))}
            className="p-2 hover:bg-white/[0.06] transition-colors"
            aria-label="Rotate Globe"
          >
            <RotateCw className="h-3 w-3 text-white/50" />
          </button>
        </div>
      </div>

      {/* Bottom legend — collapsible, slides right-to-left */}
      <div className="pointer-events-auto absolute bottom-5 space-y-2"
        style={{
          right: "1.25rem",
          left: legendOpen ? "1.25rem" : "auto",
          transition: "left 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div
          className="glass-chip flex items-center gap-4 px-4 py-2.5 !rounded-2xl overflow-hidden"
          style={{
            maxWidth: legendOpen ? "9999px" : "120px",
            transition: "max-width 0.35s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Toggle button always visible */}
          <button
            onClick={() => setLegendOpen((o) => !o)}
            className="flex items-center gap-1.5 shrink-0 text-foreground/40 hover:text-foreground/80 transition-colors"
          >
            {legendOpen
              ? <ChevronLeft className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
            <span className="text-[8px] font-semibold tracking-wider whitespace-nowrap">LEGEND</span>
          </button>

          {/* Content only visible when open */}
          {legendOpen && (
            <>
              {legend.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 text-foreground/60 text-[9px] whitespace-nowrap">
                  {l.icon}
                  <span>{l.label}</span>
                </div>
              ))}
              <div className="h-3 w-px bg-foreground/[0.06]" />
              {routesLegend.map((r) => (
                <div key={r.label} className="flex items-center gap-1.5 text-foreground/60 text-[9px] whitespace-nowrap">
                  <span className="h-0.5 w-4 rounded-full shrink-0" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />
                  <span>{r.label}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {legendOpen && (
          <>
            <div className="relative h-0.5 rounded-full bg-foreground/[0.06]">
              <div className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-gradient-to-r from-[#3dffa5]/20 to-[#3dffa5]/80" />
              <div className="absolute left-[62%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#3dffa5]" style={{ boxShadow: '0 0 10px #3dffa5' }} />
            </div>
            <div className="flex justify-between text-[8px] text-foreground/20 tabular-nums">
              {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

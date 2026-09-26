export type HazardType = "earthquake" | "wildfire" | "storm" | "volcano" | "flood" | "other";

export interface LiveEvent {
  id: string;
  title: string;
  location: string;
  severity: "Critical" | "High" | "Warning" | "Info";
  magnitude: string;
  magnitudeUnit: string;
  affected: string;
  detected: string;
  color: string;
  dot: string;
  coords: [number, number]; // [lat, lng]
  hazardType: HazardType;
  source: string;
}

function getEqSeverityAndColor(mag: number): { severity: LiveEvent["severity"]; color: string; dot: string } {
  if (mag >= 7.0) return { severity: "Critical", color: "text-rose-300", dot: "bg-rose-400" };
  if (mag >= 6.0) return { severity: "High", color: "text-amber-300", dot: "bg-amber-400" };
  if (mag >= 5.0) return { severity: "Warning", color: "text-sky-300", dot: "bg-sky-400" };
  return { severity: "Info", color: "text-slate-300", dot: "bg-slate-400" };
}

function formatTimeAgo(time: number): string {
  const diffInMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${Math.floor(diffInHours / 24)}d ago`;
}

/* ─── USGS Earthquakes ─────────────────────────────────────────────────────── */

export async function fetchUSGS(): Promise<LiveEvent[]> {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
    );
    const data = await res.json();
    return data.features.map((feature: any) => {
      const mag = feature.properties.mag ?? 4.5;
      const { severity, color, dot } = getEqSeverityAndColor(mag);
      return {
        id: feature.id,
        title: "Earthquake",
        location: feature.properties.place ?? "Unknown",
        severity,
        magnitude: `${mag.toFixed(1)}`,
        magnitudeUnit: "Mw",
        affected: "—",
        detected: formatTimeAgo(feature.properties.time),
        color,
        dot,
        coords: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
        hazardType: "earthquake" as HazardType,
        source: "USGS",
      };
    });
  } catch (err) {
    console.error("Failed to fetch USGS data", err);
    return [];
  }
}

/* ─── NASA EONET (Wildfires, Storms, Volcanoes, Floods) ────────────────────── */

const EONET_CATEGORY_MAP: Record<
  string,
  {
    hazardType: HazardType;
    baseTitle: string;
    baseSeverity: LiveEvent["severity"];
    color: string;
    dot: string;
  }
> = {
  wildfires: {
    hazardType: "wildfire",
    baseTitle: "Wildfire",
    baseSeverity: "High",
    color: "text-orange-300",
    dot: "bg-orange-400",
  },
  severeStorms: {
    hazardType: "storm",
    baseTitle: "Severe Storm",
    baseSeverity: "High",
    color: "text-violet-300",
    dot: "bg-violet-400",
  },
  volcanoes: {
    hazardType: "volcano",
    baseTitle: "Volcano",
    baseSeverity: "Warning",
    color: "text-red-400",
    dot: "bg-red-500",
  },
  floods: {
    hazardType: "flood",
    baseTitle: "Flood",
    baseSeverity: "High",
    color: "text-sky-300",
    dot: "bg-sky-400",
  },
};

export async function fetchEONET(): Promise<LiveEvent[]> {
  try {
    const res = await fetch(
      "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50&days=7"
    );
    const data = await res.json();

    const events: LiveEvent[] = [];

    for (const event of data.events) {
      const categoryId: string = event.categories?.[0]?.id ?? "other";
      const meta = EONET_CATEGORY_MAP[categoryId];
      if (!meta) continue; // skip unmapped categories (landslides, etc.)

      const geoPoints = event.geometry;
      if (!geoPoints || geoPoints.length === 0) continue;

      // Use the most recent geometry point
      const latest = geoPoints[geoPoints.length - 1];
      const coords: [number, number] = [latest.coordinates[1], latest.coordinates[0]];

      const mag: number | null = latest.magnitudeValue ?? null;
      const magUnit: string = latest.magnitudeUnit ?? "";
      const detectedMs = new Date(latest.date).getTime();

      // Dynamic severity escalation
      let severity = meta.baseSeverity;
      if (categoryId === "wildfires" && mag !== null) {
        if (mag >= 10000) severity = "Critical";
        else if (mag >= 1000) severity = "High";
        else severity = "Warning";
      } else if (categoryId === "severeStorms" && mag !== null) {
        // Wind speed in knots
        if (mag >= 100) severity = "Critical";
        else if (mag >= 64) severity = "High";
        else severity = "Warning";
      }

      // Derive a readable location from the event title
      const location = event.title ?? meta.baseTitle;

      events.push({
        id: event.id,
        title: meta.baseTitle,
        location,
        severity,
        magnitude: mag !== null ? `${mag}` : "—",
        magnitudeUnit: magUnit,
        affected: "—",
        detected: isNaN(detectedMs) ? "Recently" : formatTimeAgo(detectedMs),
        color: meta.color,
        dot: meta.dot,
        coords,
        hazardType: meta.hazardType,
        source: "NASA EONET",
      });
    }

    return events;
  } catch (err) {
    console.error("Failed to fetch EONET data", err);
    return [];
  }
}

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import hindsightRoutes from "./hindsight.js";

dotenv.config();

// --- Types ---
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

// --- Server Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

// CORS middleware configuration
app.use(cors());

app.use(express.json());

// Mount Hindsight Memory API
app.use("/api/memory", hindsightRoutes);

// LLM Proxy API to hide keys from the frontend bundle
app.post("/api/chat", async (req, res) => {
  const { provider, body } = req.body;
  if (!provider || !body) {
    res.status(400).json({ error: "Missing required fields (provider, body)" });
    return;
  }

  let endpoint = "";
  let apiKey = "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider === "groq") {
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
    apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey) {
      res.status(500).json({ error: "Groq API key not configured on backend." });
      return;
    }
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "openrouter") {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
      res.status(500).json({ error: "OpenRouter API key not configured on backend." });
      return;
    }
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "AEGIS AI Agent";
  } else {
    res.status(400).json({ error: "Invalid provider. Must be 'groq' or 'openrouter'" });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).send(errorText);
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error(`[AEGIS Backend] LLM proxy error for ${provider}:`, err);
    res.status(500).json({ error: `Backend LLM proxy error: ${err.message}` });
  }
});

// --- In-Memory State Store ---
let cachedLiveEvents: LiveEvent[] = [];
let customEvents: LiveEvent[] = [];
const deletedEventIds = new Set<string>();
let lastUpdated: Date | null = null;
let isLoadingLive = false;

// --- Helper Functions ---
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

// --- Live Feed Fetching ---
async function fetchUSGS(): Promise<LiveEvent[]> {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
    );
    const data = (await res.json()) as any;
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

async function fetchEONET(): Promise<LiveEvent[]> {
  try {
    const res = await fetch(
      "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50&days=7"
    );
    const data = (await res.json()) as any;

    const events: LiveEvent[] = [];

    for (const event of data.events) {
      const categoryId: string = event.categories?.[0]?.id ?? "other";
      const meta = EONET_CATEGORY_MAP[categoryId];
      if (!meta) continue;

      const geoPoints = event.geometry;
      if (!geoPoints || geoPoints.length === 0) continue;

      const latest = geoPoints[geoPoints.length - 1];
      const coords: [number, number] = [latest.coordinates[1], latest.coordinates[0]];

      const mag: number | null = latest.magnitudeValue ?? null;
      const magUnit: string = latest.magnitudeUnit ?? "";
      const detectedMs = new Date(latest.date).getTime();

      let severity = meta.baseSeverity;
      if (categoryId === "wildfires" && mag !== null) {
        if (mag >= 10000) severity = "Critical";
        else if (mag >= 1000) severity = "High";
        else severity = "Warning";
      } else if (categoryId === "severeStorms" && mag !== null) {
        if (mag >= 100) severity = "Critical";
        else if (mag >= 64) severity = "High";
        else severity = "Warning";
      }

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

// Update cache logic
async function updateLiveEventsCache() {
  if (isLoadingLive) return;
  isLoadingLive = true;
  console.log("Updating live events cache...");
  try {
    const [usgs, eonet] = await Promise.all([fetchUSGS(), fetchEONET()]);
    cachedLiveEvents = [...usgs, ...eonet];
    lastUpdated = new Date();
    console.log(`Cache updated with ${cachedLiveEvents.length} events.`);
  } catch (err) {
    console.error("Failed to update cache", err);
  } finally {
    isLoadingLive = false;
  }
}

// Initial fetch & set interval to refresh every 5 minutes
updateLiveEventsCache();
setInterval(updateLiveEventsCache, 5 * 60 * 1000);

// --- Severity Sorting logic ---
const SEVERITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Warning: 2,
  Info: 1,
};

function sortEvents(evts: LiveEvent[]): LiveEvent[] {
  return [...evts].sort((a, b) => {
    const sevDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sevDiff !== 0) return sevDiff;
    return a.title.localeCompare(b.title);
  });
}

// --- Endpoints ---

// 1. Get all events
app.get("/api/events", (req, res) => {
  const allEvents = [...cachedLiveEvents, ...customEvents];
  const filteredEvents = allEvents.filter((e) => !deletedEventIds.has(e.id));
  const sorted = sortEvents(filteredEvents).slice(0, 30);
  
  res.json({
    events: sorted,
    loading: isLoadingLive && cachedLiveEvents.length === 0,
    lastUpdated,
  });
});

// 2. Add custom simulated event
app.post("/api/events", (req, res) => {
  const partial = req.body;
  if (!partial.title || !partial.coords || !partial.hazardType) {
    res.status(400).json({ error: "Missing required fields (title, coords, hazardType)" });
    return;
  }

  // Validate coordinates
  const coords = partial.coords;
  if (!Array.isArray(coords) || coords.length !== 2 || typeof coords[0] !== "number" || typeof coords[1] !== "number" || isNaN(coords[0]) || isNaN(coords[1])) {
    res.status(400).json({ error: "Invalid coordinates. Must be [latitude, longitude] numbers." });
    return;
  }
  if (coords[0] < -90 || coords[0] > 90 || coords[1] < -180 || coords[1] > 180) {
    res.status(400).json({ error: "Coordinates out of bounds (lat: -90 to 90, lng: -180 to 180)." });
    return;
  }

  // Validate hazard type
  const allowedHazardTypes = ["earthquake", "wildfire", "storm", "volcano", "flood", "other"];
  if (!allowedHazardTypes.includes(partial.hazardType)) {
    res.status(400).json({ error: `Invalid hazardType. Must be one of: ${allowedHazardTypes.join(", ")}` });
    return;
  }

  // Validate severity
  const allowedSeverities = ["Critical", "High", "Warning", "Info"];
  if (partial.severity && !allowedSeverities.includes(partial.severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${allowedSeverities.join(", ")}` });
    return;
  }

  const id = `custom-${Date.now()}`;
  const newEvt: LiveEvent = {
    id,
    title: partial.title,
    location: partial.location ?? partial.title,
    severity: partial.severity ?? "Warning",
    magnitude: partial.magnitude ?? "—",
    magnitudeUnit: partial.magnitudeUnit ?? "",
    affected: partial.affected ?? "—",
    detected: "Just now",
    color: partial.color ?? "text-slate-300",
    dot: partial.dot ?? "bg-slate-400",
    coords: partial.coords,
    hazardType: partial.hazardType,
    source: partial.source ?? "Agent",
  };

  customEvents.push(newEvt);
  res.status(201).json(newEvt);
});

// 3. Delete an event by ID
app.delete("/api/events/:id", (req, res) => {
  const { id } = req.params;
  
  const initialCustomLength = customEvents.length;
  customEvents = customEvents.filter((e) => e.id !== id);
  const foundInCustom = customEvents.length < initialCustomLength;

  // Also add to deleted list to hide it if it's a live event
  deletedEventIds.add(id);

  res.json({ success: true, removedFromCustom: foundInCustom });
});

// 4. Clear all custom/simulated events
app.post("/api/events/clear", (req, res) => {
  customEvents = [];
  // Keep manually deleted live event IDs, only clear custom ones
  const liveDeleted = Array.from(deletedEventIds).filter(
    (id) => !id.startsWith("custom-") && !id.startsWith("temp-")
  );
  deletedEventIds.clear();
  liveDeleted.forEach((id) => deletedEventIds.add(id));
  res.json({ success: true });
});

// 5. Force update the live events cache
app.post("/api/events/refresh", async (req, res) => {
  await updateLiveEventsCache();
  res.json({ success: true, lastUpdated });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`AEGIS AI Backend running on http://localhost:${PORT}`);
  });
}

export default app;

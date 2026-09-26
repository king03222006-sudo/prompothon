import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Navigation,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
  Zap,
  Activity,
  AlertTriangle,
  Server,
} from "lucide-react";
import { useEventsStore } from "../../hooks/useEventsStore";
import { useRoutesStore } from "../../hooks/useRoutesStore";
import { useMarkersStore } from "../../hooks/useMarkersStore";
import { HazardType } from "../../lib/api/live-data";
import { type RouteKind, type MarkerKind, nearestCity } from "../../components/globe/geo";


/* ─── constants ─────────────────────────────────────────────────────────────── */

const GROQ_MODEL = "llama-3.3-70b-versatile";

// OpenRouter Fallback Model config
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_URL || "";
const HINDSIGHT_API_KEY = "backend"; // Managed by backend API, always enable checks on frontend

// Sliding window: only last N messages sent to LLM (saves tokens)
const HISTORY_WINDOW = 4;

/* Legacy glass replaced with CSS classes: glass-panel, glass-pill, glass-chip, glass-modal, glass-toast */

/* ─── message types ─────────────────────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
  actions?: string[];
}

type GroqMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/* ─── tool definitions ─────────────────────────────────────────────────────── */

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "add_disaster_event",
      description:
        "Add a disaster event marker on the 3D globe. Use for earthquakes, wildfires, storms, volcanoes, floods, or other hazards at any location worldwide.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short event title e.g. 'Earthquake', 'Wildfire'" },
          location: { type: "string", description: "Human-readable location name" },
          lat: { type: "number", description: "Latitude in decimal degrees (-90 to 90)" },
          lng: { type: "number", description: "Longitude in decimal degrees (-180 to 180)" },
          hazardType: {
            type: "string",
            enum: ["earthquake", "wildfire", "storm", "volcano", "flood", "other"],
          },
          severity: {
            type: "string",
            enum: ["Critical", "High", "Warning", "Info"],
          },
          magnitude: { type: "string", description: "Magnitude value as string, e.g. '7.2'" },
          magnitudeUnit: { type: "string", description: "Unit e.g. 'Mw', 'acres', 'kts'" },
        },
        required: ["title", "location", "lat", "lng", "hazardType", "severity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_disaster_event",
      description:
        "Remove a disaster event marker from the globe by its ID or by matching location/type keywords. If name hints fail, FIRST use list_active_events to find the exact ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Exact event ID to remove" },
          location_hint: {
            type: "string",
            description: "Location or name hint to find and remove a matching event",
          },
          hazard_hint: {
            type: "string",
            description: "Hazard type hint (earthquake, wildfire, etc.)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_supply_route",
      description:
        "Draw an animated arc/route on the globe between two coordinates. Use for supply corridors, rescue paths, evacuation routes, or air support lines.",
      parameters: {
        type: "object",
        properties: {
          from_lat: { type: "number" },
          from_lng: { type: "number" },
          to_lat: { type: "number" },
          to_lng: { type: "number" },
          from_name: { type: "string", description: "Origin location name" },
          to_name: { type: "string", description: "Destination location name" },
          kind: {
            type: "string",
            enum: ["rescue", "evacuation", "supply", "airsupport"],
            description: "Type of route — affects color on globe",
          },
        },
        required: ["from_lat", "from_lng", "to_lat", "to_lng", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_supply_route",
      description: "Remove a supply route arc from the globe by its ID or by matching origin/destination location names. If name hints fail, FIRST use list_routes to find the exact ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Route ID to remove (optional if hints are provided)" },
          from_hint: { type: "string", description: "City or region name hint for the route origin (e.g. 'Delhi')" },
          to_hint: { type: "string", description: "City or region name hint for the route destination (e.g. 'Mumbai')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_geo_marker",
      description:
        "Add a named geo-location pin on the globe (not a disaster event). Use for command centers, safe zones, resource hubs, or points of interest.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          kind: {
            type: "string",
            enum: ["critical", "warning", "highrisk", "safe"],
          },
        },
        required: ["name", "lat", "lng", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_geo_marker",
      description: "Remove a geo-location pin from the globe by its ID or by location name.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Marker ID to remove (optional if name_hint is provided)" },
          name_hint: { type: "string", description: "Name of the location marker to remove (e.g. 'HQ', 'Command Center')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_active_events",
      description: "Return a list of all currently active disaster events on the globe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_routes",
      description: "Return a list of all active supply/rescue/evacuation routes on the globe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_geo_markers",
      description: "Return all geo-location pins currently on the globe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_custom_events",
      description: "Clear all agent-added disaster events (keeps live USGS/NASA events).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_custom_routes",
      description: "Reset all supply routes back to the default set.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_custom_markers",
      description: "Reset all geo markers back to the default set.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "refresh_live_data",
      description: "Force-refresh the live USGS earthquake and NASA EONET event feeds.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Hindsight Memory tools ──────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "memory_retain",
      description:
        "Save an important fact, user preference, or key observation to long-term memory. Use this proactively whenever the user shares preferences, locations they care about, mission parameters, or any context that should be remembered across sessions.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The fact or context to store. Be concise and specific.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_recall",
      description:
        "Search long-term memory for relevant past context. Use this when the user references something from a previous session, or when you need past preferences/facts to answer accurately.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for in memory.",
          },
        },
        required: ["query"],
      },
    },
  },
];

/* ─── system prompt ─────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are AEGIS Agent, operator of the AEGIS 3D globe.
Control globe markers, routes, pins and Hindsight memory via tools.
Style: Concise, tactical, military-grade. Confirm actions briefly. Output accurate lat/lng from knowledge without asking user.`;

/* ─── quick suggestions ─────────────────────────────────────────────────────── */

const SUGGESTIONS = [
  "Add M7.2 earthquake in Tokyo",
  "Draw supply route Nairobi → Cairo",
  "List all active events",
  "Add evacuation route London → Madrid",
  "Show all routes",
  "Analyze situation",
];

/* ─── Hindsight API helpers ─────────────────────────────────────────────────── */

interface MemoryFact {
  id: string;
  content: string;
  timestamp: string;
}

async function hindsightRetain(content: string): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/memory/retain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Backend HTTP error: ${res.status}`);
    return "Memory retained successfully.";
  } catch (err) {
    return `Failed to retain memory: ${err}`;
  }
}

async function hindsightRecall(query: string): Promise<{ result: string; facts: string[] }> {
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/memory/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Backend HTTP error: ${res.status}`);
    const data = await res.json();
    const snippets = data.facts || [];
    
    const result = snippets.length > 0
      ? `Recalled ${snippets.length} memory snippet(s):\n${snippets.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}`
      : "No relevant memories found.";
    return { result, facts: snippets };
  } catch (err) {
    return { result: `Failed to recall memory: ${err}`, facts: [] };
  }
}

async function hindsightList(): Promise<MemoryFact[]> {
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/memory/list`);
    if (!res.ok) throw new Error(`Backend HTTP error: ${res.status}`);
    const data = await res.json();
    return data.facts || [];
  } catch (err) {
    console.error("Failed to list Hindsight memories from backend:", err);
    return [];
  }
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  groqHistory: GroqMessage[];
  createdAt: string;
}

interface TokenRun {
  id: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  models: string[];
  iterations: number;
  isSpike: boolean;
}

/* ─── ChatBox component ─────────────────────────────────────────────────────── */

export function AgentChatBox() {
  const eventsStore = useEventsStore();
  const routesStore = useRoutesStore();
  const markersStore = useMarkersStore();

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "memory" | "diagnostics">("chat");

  const [tokenHistory, setTokenHistory] = useState<TokenRun[]>(() => {
    try {
      const saved = localStorage.getItem("aegis_token_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Save token history to localStorage
  useEffect(() => {
    localStorage.setItem("aegis_token_history", JSON.stringify(tokenHistory));
  }, [tokenHistory]);

  // Load chat sessions from localStorage
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem("aegis_chat_sessions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Error loading chat sessions:", e);
    }
    const defaultSession: ChatSession = {
      id: "session-default",
      title: "Active Session #1",
      messages: [
        {
          id: "welcome",
          role: "agent",
          text: "👋 I'm **AEGIS Agent**. I have full globe control + **persistent memory** via Hindsight.\n\nTry: *\"Remember that my HQ is in Delhi\"* or *\"Add a critical earthquake in Tokyo\"*",
          timestamp: new Date(),
        },
      ],
      groqHistory: [],
      createdAt: new Date().toISOString(),
    };
    return [defaultSession];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const savedId = localStorage.getItem("aegis_current_session_id");
    return savedId || "session-default";
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groqHistory, setGroqHistory] = useState<GroqMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [memoryStatus, setMemoryStatus] = useState<"idle" | "saving" | "recalling">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync currentSessionId to localStorage
  useEffect(() => {
    localStorage.setItem("aegis_current_session_id", currentSessionId);
  }, [currentSessionId]);

  // Load active session messages & history on session switch or mount
  useEffect(() => {
    const saved = localStorage.getItem("aegis_chat_sessions");
    if (saved) {
      const parsed = JSON.parse(saved);
      const session = parsed.find((s: any) => s.id === currentSessionId);
      if (session) {
        // Ensure standard Date objects for timestamps
        const messagesWithDates = session.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(messagesWithDates);
        setGroqHistory(session.groqHistory);
      }
    }
  }, [currentSessionId]);

  // Save current messages & history back to sessions array in localStorage
  useEffect(() => {
    if (messages.length === 0 && groqHistory.length === 0) return;

    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            messages,
            groqHistory,
          };
        }
        return s;
      });
      localStorage.setItem("aegis_chat_sessions", JSON.stringify(next));
      return next;
    });
  }, [messages, groqHistory, currentSessionId]);

  // Load memories from Hindsight Cloud on mount
  useEffect(() => {
    const fetchMemories = async () => {
      setMemoryStatus("recalling");
      const list = await hindsightList();
      setMemoryFacts(list);
      setMemoryStatus("idle");
    };
    if (HINDSIGHT_API_KEY) {
      fetchMemories();
    }
  }, []);

  // Callback to create a new session
  const createNewSession = useCallback(() => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `Active Session #${sessions.length + 1}`,
      messages: [
        {
          id: `welcome-${Date.now()}`,
          role: "agent",
          text: "👋 I've started a **new session**. The conversation history is cleared to save tokens, but I still retain everything we learned in past sessions via Hindsight long-term memory!\n\nTry asking me: *\"What is my HQ location?\"*",
          timestamp: new Date(),
        },
      ],
      groqHistory: [],
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => {
      // Limit to max 10 sessions (keep the most recent ones)
      const truncated = prev.length >= 10 ? prev.slice(prev.length - 9) : prev;
      const next = [...truncated, newSession];
      localStorage.setItem("aegis_chat_sessions", JSON.stringify(next));
      return next;
    });
    setCurrentSessionId(newId);
  }, [sessions.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  /* ─── tool execution ─────────────────────────────────────────────────────── */

  const executeTool = useCallback(
    (name: string, args: Record<string, unknown>): { result: string; action?: string } => {
      const parseNum = (val: unknown): number => {
        if (typeof val === "number") return val;
        const parsed = parseFloat(String(val));
        return isNaN(parsed) ? 0 : parsed;
      };

      switch (name) {
        case "add_disaster_event": {
          const HAZARD_DEFAULTS: Record<string, { color: string; dot: string }> = {
            earthquake: { color: "text-rose-300", dot: "bg-rose-400" },
            wildfire: { color: "text-orange-300", dot: "bg-orange-400" },
            storm: { color: "text-violet-300", dot: "bg-violet-400" },
            volcano: { color: "text-red-400", dot: "bg-red-500" },
            flood: { color: "text-sky-300", dot: "bg-sky-400" },
            other: { color: "text-slate-300", dot: "bg-slate-400" },
          };
          const hazard = (args.hazardType as HazardType) ?? "other";
          const defaults = HAZARD_DEFAULTS[hazard] ?? HAZARD_DEFAULTS.other;
          const lat = parseNum(args.lat);
          const lng = parseNum(args.lng);
          const evt = eventsStore.addEvent({
            title: args.title as string,
            location: args.location as string,
            coords: [lat, lng],
            hazardType: hazard,
            severity: (args.severity as "Critical" | "High" | "Warning" | "Info") ?? "Warning",
            magnitude: (args.magnitude as string) ?? "—",
            magnitudeUnit: (args.magnitudeUnit as string) ?? "",
            source: "AEGIS Agent",
            color: defaults.color,
            dot: defaults.dot,
          });
          return {
            result: `Event added with id="${evt.id}", title="${evt.title}", location="${evt.location}", severity="${evt.severity}"`,
            action: `✅ Disaster marker placed: ${evt.title} at ${evt.location}`,
          };
        }

        case "remove_disaster_event": {
          if (args.id) {
            const removed = eventsStore.removeEvent(args.id as string);
            return removed
              ? { result: "Event removed successfully.", action: `✅ Marker removed: ID ${args.id}` }
              : { result: `No event found with id="${args.id}"` };
          }
          // Find by hint
          const hint = ((args.location_hint as string) ?? "").toLowerCase();
          const hazardHint = ((args.hazard_hint as string) ?? "").toLowerCase();
          const matches = eventsStore.events.filter((e) => {
            const locMatch = hint ? e.location.toLowerCase().includes(hint) : true;
            const hazMatch = hazardHint ? e.hazardType.includes(hazardHint) : true;
            return locMatch && hazMatch;
          });
          if (matches.length > 0) {
            matches.forEach((m) => eventsStore.removeEvent(m.id));
            return {
              result: `Removed ${matches.length} event(s)`,
              action: `✅ Removed ${matches.length} event(s)`,
            };
          }
          return { result: "No matching event found to remove." };
        }

        case "add_supply_route": {
          const fromLat = parseNum(args.from_lat);
          const fromLng = parseNum(args.from_lng);
          const toLat = parseNum(args.to_lat);
          const toLng = parseNum(args.to_lng);
          const fromName = (args.from_name as string) || nearestCity(fromLat, fromLng);
          const toName = (args.to_name as string) || nearestCity(toLat, toLng);
          const route = routesStore.addRoute({
            from: [fromLat, fromLng],
            to: [toLat, toLng],
            kind: (args.kind as RouteKind) ?? "supply",
            fromName,
            toName,
          });
          return {
            result: `Route added with id="${route.id}", kind="${route.kind}", from=${fromName}, to=${toName}`,
            action: `✅ ${route.kind.toUpperCase()} route: ${fromName} → ${toName}`,
          };
        }

        case "remove_supply_route": {
          if (args.id) {
            const removed = routesStore.removeRoute(args.id as string);
            return removed
              ? { result: "Route removed.", action: `✅ Route removed: ID ${args.id}` }
              : { result: `No route found with id="${args.id}"` };
          }
          const fromHint = ((args.from_hint as string) ?? "").toLowerCase();
          const toHint = ((args.to_hint as string) ?? "").toLowerCase();
          const matches = routesStore.routes.filter((r) => {
            const fName = (r.fromName ?? nearestCity(r.from[0], r.from[1])).toLowerCase();
            const tName = (r.toName ?? nearestCity(r.to[0], r.to[1])).toLowerCase();
            const fromMatch = fromHint ? fName.includes(fromHint) : false;
            const toMatch = toHint ? tName.includes(toHint) : false;
            
            const swappedFromMatch = toHint ? fName.includes(toHint) : false;
            const swappedToMatch = fromHint ? tName.includes(fromHint) : false;

            // Match if either matches when only one is provided, or both match when both are provided (including swapped)
            if (fromHint && toHint) return (fromMatch && toMatch) || (swappedFromMatch && swappedToMatch);
            return fromMatch || toMatch;
          });
          if (matches.length > 0) {
            matches.forEach((m) => routesStore.removeRoute(m.id));
            const removedNames = matches.map((m) => `${m.fromName ?? nearestCity(m.from[0], m.from[1])} → ${m.toName ?? nearestCity(m.to[0], m.to[1])}`);
            return {
              result: `${matches.length} route(s) removed successfully.`,
              action: `✅ Removed ${matches.length} route(s): ${removedNames.join(", ")}`,
            };
          }
          return { result: "No matching supply route found to remove." };
        }

        case "add_geo_marker": {
          const lat = parseNum(args.lat);
          const lng = parseNum(args.lng);
          const marker = markersStore.addMarker({
            name: args.name as string,
            lat,
            lng,
            kind: (args.kind as MarkerKind) ?? "safe",
          });
          return {
            result: `Geo marker added id="${marker.id}", name="${marker.name}", kind="${marker.kind}"`,
            action: `✅ Geo pin placed: ${marker.name} [${marker.kind}]`,
          };
        }

        case "remove_geo_marker": {
          if (args.id) {
            const removed = markersStore.removeMarker(args.id as string);
            return removed
              ? { result: "Marker removed.", action: `✅ Geo pin removed: ID ${args.id}` }
              : { result: `No geo marker found with id="${args.id}"` };
          }
          const nameHint = ((args.name_hint as string) ?? "").toLowerCase();
          const matches = markersStore.markers.filter((m) => m.name.toLowerCase().includes(nameHint));
          if (matches.length > 0) {
            matches.forEach((m) => markersStore.removeMarker(m.id));
            return {
              result: `Removed ${matches.length} geo marker(s) successfully.`,
              action: `✅ Removed ${matches.length} geo pin(s)`,
            };
          }
          return { result: "No matching geo marker found to remove." };
        }

        case "list_active_events": {
          if (eventsStore.events.length === 0)
            return { result: "No active events on the globe." };
          const lines = eventsStore.events
            .slice(0, 20)
            .map(
              (e) =>
                `id="${e.id}" | ${e.title} | ${e.location} | severity=${e.severity} | source=${e.source}`,
            );
          return { result: `Active events (${eventsStore.events.length}):\n${lines.join("\n")}` };
        }

        case "list_routes": {
          if (routesStore.routes.length === 0)
            return { result: "No routes currently on the globe." };
          const lines = routesStore.routes.map(
            (r) => {
              const fName = r.fromName ?? nearestCity(r.from[0], r.from[1]);
              const tName = r.toName ?? nearestCity(r.to[0], r.to[1]);
              return `id="${r.id}" | kind=${r.kind} | from="${fName}" [${r.from}] | to="${tName}" [${r.to}]`;
            }
          );
          return { result: `Active routes (${routesStore.routes.length}):\n${lines.join("\n")}` };
        }

        case "list_geo_markers": {
          if (markersStore.markers.length === 0)
            return { result: "No geo markers currently on the globe." };
          const lines = markersStore.markers.map(
            (m) => `id="${m.id}" | name="${m.name}" | kind=${m.kind} | lat=${m.lat}, lng=${m.lng}`,
          );
          return { result: `Geo markers (${markersStore.markers.length}):\n${lines.join("\n")}` };
        }

        case "clear_custom_events": {
          eventsStore.clearCustomEvents();
          return {
            result: "All agent-added events cleared. Live feeds remain active.",
            action: "🧹 Custom events cleared",
          };
        }

        case "clear_custom_routes": {
          routesStore.clearCustomRoutes();
          return {
            result: "Routes reset to defaults.",
            action: "🧹 Routes reset to defaults",
          };
        }

        case "clear_custom_markers": {
          markersStore.clearCustomMarkers();
          return {
            result: "Geo markers reset to defaults.",
            action: "🧹 Geo markers reset",
          };
        }

        case "refresh_live_data": {
          eventsStore.refreshLive();
          return {
            result: "Live feed refresh triggered from USGS and NASA EONET.",
            action: "🔄 Refreshing live feeds…",
          };
        }

        default:
          return { result: `Unknown tool: ${name}` };
      }
    },
    [eventsStore, routesStore, markersStore],
  );

  /* ─── LLM call helper (Groq primary → OpenRouter fallback) ──────────────── */

  const makeLLMCall = useCallback(
    async (
      messages: GroqMessage[],
      isFallback: boolean,
      includeTools: boolean = true,
      isInitialQueryOpenRouter: boolean = false,
      signal?: AbortSignal
    ): Promise<Response> => {
      const systemMessages: GroqMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
      const fullMessages = [...systemMessages, ...messages];

      // Filter tools based on API provider role
      const groqAllowedTools = [
        "add_disaster_event", "remove_disaster_event",
        "add_supply_route", "remove_supply_route",
        "add_geo_marker", "remove_geo_marker",
        "refresh_live_data"
      ];
      
      const openRouterAllowedTools = [
        "memory_retain", "memory_recall",
        "list_active_events", "list_routes", "list_geo_markers",
        "clear_custom_events", "clear_custom_routes", "clear_custom_markers"
      ];

      const provider = !isFallback ? "groq" : "openrouter";
      const payload: Record<string, unknown> = {
        model: !isFallback ? GROQ_MODEL : OPENROUTER_MODEL,
        messages: fullMessages,
        max_tokens: 1024,
        temperature: 0.3,
      };

      if (includeTools) {
        const allowedList = !isFallback 
          ? groqAllowedTools 
          : (isInitialQueryOpenRouter ? openRouterAllowedTools : groqAllowedTools);
        payload.tools = TOOL_DEFINITIONS.filter(t => allowedList.includes(t.function.name));
        payload.tool_choice = "auto";
      }

      return fetch(`${BACKEND_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          body: payload,
        }),
        signal,
      });
    },
    []
  );

  /* ─── Groq API call with tool loop + Hindsight memory ───────────────────── */

  const callGroq = useCallback(
    async (userText: string, signal?: AbortSignal) => {
      // ── Proactive Hindsight Recall ──
      let proactiveMemoryContext = "";
      if (HINDSIGHT_API_KEY) {
        try {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          setMemoryStatus("recalling");
          const { facts } = await hindsightRecall(userText);
          if (facts.length > 0) {
            proactiveMemoryContext = `[Relevant memories from Hindsight Cloud]\n${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n`;
          }
        } catch (err) {
          console.error("[AEGIS Memory] Proactive recall failed:", err);
        } finally {
          setMemoryStatus("idle");
        }
      }

      const userMsgContent = `${proactiveMemoryContext}${userText}`;
      const userMsg: GroqMessage = { role: "user", content: userMsgContent };

      // ── Sliding window: only keep last HISTORY_WINDOW messages (token savings) ──
      const windowedHistory = groqHistory.slice(-HISTORY_WINDOW);
      let currentHistory: GroqMessage[] = [...windowedHistory, userMsg];
      const actionsPerformed: string[] = [];

      // Token Tracking Variables
      let accumulatedInput = 0;
      let accumulatedOutput = 0;
      let accumulatedCost = 0;
      const runModels: string[] = [];
      let isSpike = false;

      // Route to OpenRouter based on keywords (memory, listings, clearings/deleting)
      const lowerText = userText.toLowerCase();
      const openRouterKeywords = [
        "recall", "list", "summarize", "summary", "clear", 
        "remember", "reember", "retain"
      ];
      let isFallback = openRouterKeywords.some(kw => lowerText.includes(kw));
      const isInitiallyOpenRouter = isFallback;

      // Tool-call loop: keep calling until no more tool calls (max 4 iterations)
      let iteration = 0;
      for (; iteration < 4; iteration++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        console.log(`[AEGIS LLM] Iteration ${iteration + 1} — using ${isFallback ? "OpenRouter" : "Groq"}`);

        let res: Response;

        // ── Try primary (Groq), then fall back to OpenRouter ─────────────────
        if (!isFallback) {
          try {
            res = await makeLLMCall(currentHistory, false, true, isInitiallyOpenRouter, signal);
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Groq HTTP ${res.status}: ${errText}`);
            }
          } catch (groqErr) {
            console.warn("[AEGIS LLM] Groq failed — switching to OpenRouter for this turn:", groqErr);
            isFallback = true;
            if (!actionsPerformed.includes("⚠️ Fallback: OpenRouter active")) {
              actionsPerformed.push("⚠️ Fallback: OpenRouter active");
            }
            try {
              res = await makeLLMCall(currentHistory, true, true, isInitiallyOpenRouter, signal);
              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
              }
            } catch (orErr) {
              throw new Error(`Both Groq and OpenRouter failed: ${orErr}`);
            }
          }
        } else {
          // Already in fallback mode — go straight to OpenRouter
          try {
            res = await makeLLMCall(currentHistory, true, true, isInitiallyOpenRouter, signal);
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`OpenRouter fallback failed: ${res.status}`);
            }
          } catch (orErr) {
            throw new Error(`OpenRouter fallback failed: ${orErr}`);
          }
        }

        const data = await res.json();
        console.log(`[AEGIS LLM] Iteration ${iteration + 1} raw response:`, JSON.stringify(data).slice(0, 500));

        // Track tokens for this iteration
        const promptTokens = data.usage?.prompt_tokens ?? 0;
        const completionTokens = data.usage?.completion_tokens ?? 0;
        accumulatedInput += promptTokens;
        accumulatedOutput += completionTokens;
        const modelUsed = data.model ?? (isFallback ? OPENROUTER_MODEL : GROQ_MODEL);
        if (!runModels.includes(modelUsed)) runModels.push(modelUsed);

        const iterationCost = isFallback
          ? 0
          : (promptTokens * 0.59 / 1000000) + (completionTokens * 0.79 / 1000000);
        accumulatedCost += iterationCost;

        const choice = data.choices?.[0];
        const assistantMsg = choice?.message;

        if (!assistantMsg) {
          console.warn("[AEGIS LLM] No assistant message in response — aborting.");
          throw new Error("Empty response from language model.");
        }

        // ── Strip reasoning/reasoning_details (internal chain-of-thought) ────
        const cleanedAssistantMsg: GroqMessage = {
          role: "assistant",
          content: assistantMsg.content ?? null,
          ...(assistantMsg.tool_calls ? { tool_calls: assistantMsg.tool_calls } : {}),
        };
        currentHistory = [...currentHistory, cleanedAssistantMsg];

        // ── No tool calls → final response ───────────────────────────────────
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          let finalReply: string = assistantMsg.content ?? "";

          // If content is empty (reasoning models return null content), do a
          // lightweight follow-up call to extract a clean user-facing answer
          if (!finalReply || finalReply.trim() === "") {
            console.warn("[AEGIS LLM] Empty content — requesting clean summary from model...");
            try {
              const summaryHistory: GroqMessage[] = [
                ...currentHistory,
                {
                  role: "user",
                  content: "Summarize your findings and give a direct, concise answer to my question.",
                },
              ];
              const summaryRes = await makeLLMCall(summaryHistory, isFallback, false, false, signal);
              if (summaryRes.ok) {
                const summaryData = await summaryRes.json();
                finalReply = summaryData.choices?.[0]?.message?.content ?? "";
                
                const sPromptTokens = summaryData.usage?.prompt_tokens ?? 0;
                const sCompletionTokens = summaryData.usage?.completion_tokens ?? 0;
                accumulatedInput += sPromptTokens;
                accumulatedOutput += sCompletionTokens;
                const sModel = summaryData.model ?? (isFallback ? OPENROUTER_MODEL : GROQ_MODEL);
                if (!runModels.includes(sModel)) runModels.push(sModel);
                
                const sCost = isFallback
                  ? 0
                  : (sPromptTokens * 0.59 / 1000000) + (sCompletionTokens * 0.79 / 1000000);
                accumulatedCost += sCost;
                
                console.log("[AEGIS LLM] Clean summary obtained:", finalReply);
              }
            } catch (summaryErr) {
              console.error("[AEGIS LLM] Summary call failed:", summaryErr);
            }
          }

          // ── Pruned Turn History ──
          const cleanTurnHistory: GroqMessage[] = [
            ...windowedHistory,
            { role: "user", content: userText },
            { role: "assistant", content: finalReply || "Operations completed." },
          ];
          setGroqHistory(cleanTurnHistory);

          const totalTokens = accumulatedInput + accumulatedOutput;
          if (totalTokens > 15000) {
            isSpike = true;
          }

          const newRun: TokenRun = {
            id: `run-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
            inputTokens: accumulatedInput,
            outputTokens: accumulatedOutput,
            totalTokens,
            cost: parseFloat(accumulatedCost.toFixed(6)),
            models: runModels,
            iterations: iteration + 1,
            isSpike,
          };
          setTokenHistory((prev) => [newRun, ...prev.slice(0, 49)]);

          console.log("[AEGIS LLM] Returning final reply:", finalReply || "(empty)");
          return {
            text: finalReply || "Operations completed.",
            actions: actionsPerformed,
          };
        }

        // ── Execute tool calls ────────────────────────────────────────────────
        const toolResults: GroqMessage[] = [];
        for (const tc of assistantMsg.tool_calls as GroqToolCall[]) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            parsedArgs = {};
          }

          let toolResult: string;

          // ── Hindsight memory_retain ──────────────────────────────────────────
          if (tc.function.name === "memory_retain") {
            setMemoryStatus("saving");
            const content = parsedArgs.content as string;
            toolResult = await hindsightRetain(content);
            const updated = await hindsightList();
            if (updated.length > 0) {
              setMemoryFacts(updated);
            } else {
              setMemoryFacts((prev) => [
                { id: `mem-${Date.now()}`, content, timestamp: new Date().toISOString() },
                ...prev.slice(0, 19),
              ]);
            }
            actionsPerformed.push(`🧠 Memory retained: "${content.slice(0, 60)}${content.length > 60 ? "…" : ""}"`);
            setMemoryStatus("idle");

          // ── Hindsight memory_recall ──────────────────────────────────────────
          } else if (tc.function.name === "memory_recall") {
            setMemoryStatus("recalling");
            const query = parsedArgs.query as string;
            const { result, facts } = await hindsightRecall(query);
            toolResult = result;
            if (facts.length > 0) {
              actionsPerformed.push(`🧠 Recalled ${facts.length} memory snippet(s) for "${query}"`);
            }
            setMemoryStatus("idle");

          // ── All other globe tools ────────────────────────────────────────────
          } else {
            const { result, action } = executeTool(tc.function.name, parsedArgs);
            if (action) actionsPerformed.push(action);
            toolResult = result;
          }

          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResult,
          });
        }

        currentHistory = [...currentHistory, ...toolResults];
      }

      // Max iterations reached — return summary of actions
      const cleanTurnHistory: GroqMessage[] = [
        ...windowedHistory,
        { role: "user", content: userText },
        { role: "assistant", content: "Operations completed." },
      ];
      setGroqHistory(cleanTurnHistory);

      const totalTokens = accumulatedInput + accumulatedOutput;
      if (totalTokens > 15000) {
        isSpike = true;
      }

      const newRun: TokenRun = {
        id: `run-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        inputTokens: accumulatedInput,
        outputTokens: accumulatedOutput,
        totalTokens,
        cost: parseFloat(accumulatedCost.toFixed(6)),
        models: runModels,
        iterations: iteration,
        isSpike,
      };
      setTokenHistory((prev) => [newRun, ...prev.slice(0, 49)]);

      return {
        text: "Operations completed.",
        actions: actionsPerformed,
      };
    },
    [groqHistory, executeTool, makeLLMCall],
  );


  /* ─── send handler ───────────────────────────────────────────────────────── */

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || typing) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userChatMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userChatMsg]);
    setInput("");
    setTyping(true);

    try {
      const { text: reply, actions } = await callGroq(text, controller.signal);
      const agentMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "agent",
        text: reply,
        timestamp: new Date(),
        actions,
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Request was aborted by user
      }
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "agent",
        text: `❌ **Connection error:** ${err instanceof Error ? err.message : "Failed to reach Groq API."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setTyping(false);
    }
  }, [input, typing, callGroq]);

  /* ─── render helpers ─────────────────────────────────────────────────────── */

  function renderText(text: string) {
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      const isNumbered = /^\d+\.\s/.test(line.trim());
      const contentText = isBullet 
        ? line.trim().substring(2) 
        : (isNumbered ? line.trim().replace(/^\d+\.\s/, "") : line);

      const parsedElements = contentText.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <span key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </span>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <em key={i} className="text-white/70 not-italic font-medium">
              {part.slice(1, -1)}
            </em>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-sky-200">
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      });

      if (isBullet) {
        return (
          <div key={lineIdx} className="flex items-start gap-1.5 ml-2 mt-0.5">
            <span className="text-sky-300">•</span>
            <div>{parsedElements}</div>
          </div>
        );
      }
      if (isNumbered) {
        const num = line.trim().match(/^\d+/)?.[0] ?? "1";
        return (
          <div key={lineIdx} className="flex items-start gap-1.5 ml-2 mt-0.5">
            <span className="text-sky-300 font-mono text-[11px]">{num}.</span>
            <div>{parsedElements}</div>
          </div>
        );
      }
      return (
        <div key={lineIdx} className={line.trim() === "" ? "h-2" : "min-h-[1.2em]"}>
          {parsedElements}
        </div>
      );
    });
  }

  /* ─── floating trigger ───────────────────────────────────────────────────── */

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/90 to-emerald-500/90 text-white shadow-[0_0_24px_rgba(56,189,248,0.35)] transition-all duration-280 hover:scale-110 hover:shadow-[0_0_40px_rgba(56,189,248,0.55)]"
      >
        <MessageSquare className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 text-[7px] font-bold text-black">
          AI
        </span>
      </button>
    );
  }

  /* ─── chat panel ─────────────────────────────────────────────────────────── */

  return (
    <div
      className={`pointer-events-auto fixed right-5 z-50 flex flex-col glass-panel transition-all duration-280 ${
        minimized ? "bottom-5 h-12 w-[400px]" : "bottom-5 h-[520px] w-[400px]"
      }`}
    >
      {/* ── header ── */}
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between border-b border-white/[0.06] px-4 py-3"
        onClick={() => setMinimized((m) => !m)}
      >
        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/30 to-emerald-400/20 ring-1 ring-white/10 shrink-0">
            <Bot className="h-4 w-4 text-sky-300" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0a0d14]" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-white/90 shrink-0">AEGIS Agent</span>
              <select
                value={currentSessionId}
                onChange={(e) => setCurrentSessionId(e.target.value)}
                className="glass-input text-[10px] text-white/50 px-1.5 py-0.5 cursor-pointer max-w-[120px] truncate hover:text-white/80 transition-colors !rounded-lg"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0e111a] text-white/80">
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[8px] text-emerald-200 shrink-0">
                <Zap className="h-2 w-2" /> AI Ready
              </span>
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] transition-colors shrink-0 ${
                memoryStatus !== "idle"
                  ? "bg-violet-400/30 text-violet-200"
                  : "bg-violet-400/10 text-violet-400/60"
              }`}>
                <Brain className="h-2 w-2" />
                {memoryStatus === "saving" ? "Saving…" : memoryStatus === "recalling" ? "Recalling…" : "Memory"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={createNewSession}
            title="Start New Session"
            className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
          {minimized ? (
            <ChevronUp onClick={() => setMinimized(false)} className="h-4 w-4 text-white/40 hover:text-white" />
          ) : (
            <ChevronDown onClick={() => setMinimized(true)} className="h-4 w-4 text-white/40 hover:text-white" />
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── tabs ── */}
      {!minimized && (
        <div className="flex shrink-0 border-b border-white/[0.06]">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${
              activeTab === "chat"
                ? "border-b border-sky-400 text-sky-300"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            OPERATIONS
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors ${
              activeTab === "memory"
                ? "border-b border-violet-400 text-violet-300"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            <Brain className="h-3 w-3" />
            MEMORY
            {memoryFacts.length > 0 && (
              <span className="rounded-full bg-violet-500/30 px-1.5 py-0.5 text-[8px] text-violet-300">
                {memoryFacts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors ${
              activeTab === "diagnostics"
                ? "border-b border-amber-400 text-amber-300"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            <Server className="h-3 w-3" />
            ANALYTICS
            {tokenHistory.some((r) => r.isSpike) && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            )}
          </button>
        </div>
      )}

      {/* ── capability pills (chat tab only) ── */}
      {!minimized && activeTab === "chat" && (
        <div className="flex shrink-0 gap-1.5 border-b border-white/[0.04] px-3 py-2">
          {[
            { icon: Plus, label: "Markers" },
            { icon: Navigation, label: "Routes" },
            { icon: Trash2, label: "Delete" },
            { icon: Sparkles, label: "Analyze" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1 glass-chip px-2 py-0.5"
            >
              <Icon className="h-2.5 w-2.5 text-sky-300/60" />
              <span className="text-[9px] text-white/35">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── memory bank panel ── */}
      {!minimized && activeTab === "memory" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[11px] font-medium text-white/70">Hindsight Memory Bank</span>
            </div>
            <span className={`text-[9px] rounded-full px-2 py-0.5 ${
              memoryStatus === "saving" ? "bg-amber-400/20 text-amber-300" :
              memoryStatus === "recalling" ? "bg-sky-400/20 text-sky-300" :
              "bg-violet-400/20 text-violet-300"
            }`}>
              {memoryStatus === "saving" ? "● Saving…" :
               memoryStatus === "recalling" ? "● Recalling…" :
               `${memoryFacts.length} facts stored`}
            </span>
          </div>
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
          >
            {memoryFacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <Brain className="h-8 w-8 text-white/10" />
                <div>
                  <p className="text-[12px] text-white/40">No memories yet</p>
                  <p className="text-[10px] text-white/20 mt-1">Tell me something to remember,<br/>like your HQ location or preferences.</p>
                </div>
              </div>
            ) : (
              memoryFacts.map((fact) => (
                <div
                  key={fact.id}
                  className="rounded-xl border border-violet-400/10 bg-violet-400/5 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    <Brain className="h-3 w-3 mt-0.5 text-violet-400/60 shrink-0" />
                    <p className="text-[11px] text-white/75 leading-relaxed">{fact.content}</p>
                  </div>
                  <p className="mt-1.5 text-[9px] text-white/20 pl-5">
                    {new Date(fact.timestamp).toLocaleString("en-US", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 border-t border-white/[0.04] px-3 py-2">
            <p className="text-[9px] text-white/20 text-center">Powered by Hindsight Cloud · Persistent across sessions</p>
          </div>
        </div>
      )}

      {/* ── analytics panel ── */}
      {!minimized && activeTab === "diagnostics" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-medium text-white/70">Token Diagnostics & Cost</span>
            </div>
            <button
              onClick={() => {
                setTokenHistory([]);
                localStorage.removeItem("aegis_token_history");
              }}
              className="text-[9px] text-rose-400 hover:text-rose-300 hover:underline transition-colors"
            >
              Clear Logs
            </button>
          </div>
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
          >
            {tokenHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <Activity className="h-8 w-8 text-white/10" />
                <div>
                  <p className="text-[12px] text-white/40">No analytics data yet</p>
                  <p className="text-[10px] text-white/20 mt-1">Interact with the agent to start logging.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 leading-tight">
                    <span className="text-[9px] tracking-wider text-white/30 block uppercase">Total Cost</span>
                    <span className="text-lg font-semibold text-white/95 mt-1 block">
                      ${tokenHistory.reduce((sum, r) => sum + r.cost, 0).toFixed(5)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 leading-tight">
                    <span className="text-[9px] tracking-wider text-white/30 block uppercase">Total Tokens</span>
                    <span className="text-lg font-semibold text-white/95 mt-1 block">
                      {(tokenHistory.reduce((sum, r) => sum + r.totalTokens, 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>

                {tokenHistory[0]?.isSpike && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-rose-300">Token Spike Detected</p>
                      <p className="text-[9px] text-rose-300/75 mt-0.5 leading-normal">
                        The last turn consumed {tokenHistory[0].totalTokens.toLocaleString()} tokens. Ensure you are not loading extremely large datasets.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="text-[9px] tracking-wider text-white/30 uppercase pl-1 block">Request Log (Recent First)</span>
                  {tokenHistory.map((run) => (
                    <div
                      key={run.id}
                      className={`rounded-xl border p-2.5 transition-colors ${
                        run.isSpike
                          ? "border-rose-500/25 bg-rose-500/5"
                          : "border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-white/80">
                          {run.models.map(m => m.split("/").pop()).join(" + ")}
                        </span>
                        <span className="text-[9px] text-white/30">{run.timestamp}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[9px] text-white/45">
                        <div>
                          <span>In: <strong>{run.inputTokens.toLocaleString()}</strong></span>
                          <span className="mx-1.5">·</span>
                          <span>Out: <strong>{run.outputTokens.toLocaleString()}</strong></span>
                        </div>
                        <div className="text-right">
                          <span>{run.iterations} iter</span>
                          <span className="mx-1.5">·</span>
                          <span className={run.cost > 0 ? "text-emerald-400/80 font-medium" : "text-white/40"}>
                            {run.cost > 0 ? `$${run.cost.toFixed(5)}` : "Free"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="shrink-0 border-t border-white/[0.04] px-3 py-2">
            <p className="text-[9px] text-white/20 text-center">Optimized Token Architecture Active</p>
          </div>
        </div>
      )}

      {/* ── messages ── */}
      {!minimized && activeTab === "chat" && (
        <>
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
          >
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-sky-500/20 text-white/90 rounded-br-md"
                      : "bg-white/[0.04] text-white/80 rounded-bl-md border border-white/[0.04]"
                  }`}
                >
                  {msg.role === "agent" && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-sky-300/70" />
                      <span className="text-[9px] tracking-wider text-white/30">AEGIS AI</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{renderText(msg.text)}</div>

                  {/* Action badges */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.actions.map((action, i) => {
                        const isError = action.includes("❌") || action.includes("Failed") || action.includes("error");
                        const isWarning = action.includes("⚠️") || action.includes("Warning");
                        const colorClass = isError 
                          ? "border-rose-400/20 bg-rose-400/5 text-rose-300/80"
                          : (isWarning 
                            ? "border-amber-400/20 bg-amber-400/5 text-amber-300/80"
                            : "border-emerald-400/20 bg-emerald-400/5 text-emerald-300/80");
                        return (
                          <div
                            key={i}
                            className={`rounded-md border px-2 py-1 text-[10px] ${colorClass}`}
                          >
                            {action}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-1 text-[9px] text-white/20">
                    {msg.timestamp.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </div>
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/[0.04] bg-white/[0.04] px-3.5 py-2.5">
                  <Loader2 className="h-3 w-3 animate-spin text-sky-300/70" />
                  <span className="text-[11px] text-white/35">Thinking…</span>
                </div>
              </div>
            )}
          </div>

          {/* ── suggestions ── */}
          <div
            className="shrink-0 flex gap-1.5 overflow-x-auto border-t border-white/[0.04] px-3 py-2"
            style={{ scrollbarWidth: "none" }}
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="shrink-0 rounded-full border border-white/[0.06] px-2.5 py-1 text-[9px] text-white/30 transition-colors hover:border-sky-400/30 hover:bg-sky-400/5 hover:text-white/60"
              >
                {s}
              </button>
            ))}
          </div>

          {/* ── input ── */}
          <div className="shrink-0 border-t border-white/[0.06] px-3 py-2.5">
            <div className="relative flex items-center gap-2 glass-input px-3 py-2 focus-within:!border-sky-400/30 transition-all">
              {/* AEGIS Secure Channel overlay — blocks the text input */}
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] overflow-hidden"
                style={{
                  background: "linear-gradient(90deg, rgba(10,14,26,0.97) 0%, rgba(10,14,26,0.93) 60%, transparent 100%)",
                }}
              >
                <div className="flex items-center gap-2 px-3">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
                  </span>
                  <span
                    className="text-[10px] font-semibold tracking-[0.2em] text-sky-300/80 uppercase select-none"
                    style={{ textShadow: "0 0 12px rgba(56,189,248,0.6)" }}
                  >
                    AEGIS Secure Channel
                  </span>
                  <span className="ml-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[7px] font-bold tracking-widest text-emerald-300/80 uppercase">
                    AES-256
                  </span>
                </div>
              </div>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Control the globe with natural language…"
                disabled={typing}
                className="flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/25 outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || typing}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300 transition-all hover:bg-sky-500/35 disabled:opacity-30"
              >
                {typing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-1.5 px-1 text-[9px] text-white/20 flex items-center gap-1">
              Full globe control · <Brain className="h-2.5 w-2.5 text-violet-400/50" /> Hindsight memory active
            </div>
          </div>
        </>
      )}
    </div>
  );
}

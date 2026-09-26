import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { LiveEvent, HazardType } from "../lib/api/live-data";

/* ─── API configuration ──────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_BACKEND_URL || "";

/* ─── severity helpers ──────────────────────────────────────────────────────── */

const SEVERITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Warning: 2,
  Info: 1,
};

const HAZARD_DEFAULTS: Record<HazardType, { color: string; dot: string; magnitudeUnit: string }> = {
  earthquake: { color: "text-rose-300",   dot: "bg-rose-400",   magnitudeUnit: "Mw" },
  wildfire:   { color: "text-orange-300", dot: "bg-orange-400", magnitudeUnit: "acres" },
  storm:      { color: "text-violet-300", dot: "bg-violet-400", magnitudeUnit: "kts" },
  volcano:    { color: "text-red-400",    dot: "bg-red-500",    magnitudeUnit: "" },
  flood:      { color: "text-sky-300",    dot: "bg-sky-400",    magnitudeUnit: "" },
  other:      { color: "text-slate-300",  dot: "bg-slate-400",  magnitudeUnit: "" },
};

/* ─── context types ─────────────────────────────────────────────────────────── */

export interface EventsState {
  events: LiveEvent[];
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  addEvent: (evt: Partial<LiveEvent> & { title: string; coords: [number, number]; hazardType: HazardType }) => LiveEvent;
  removeEvent: (id: string) => boolean;
  updateEvent: (id: string, patch: Partial<LiveEvent>) => boolean;
  clearCustomEvents: () => void;
  refreshLive: () => Promise<void>;
}

const EventsContext = createContext<EventsState | null>(null);

export function useEventsStore() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEventsStore must be inside <EventsProvider>");
  return ctx;
}

/* ─── provider ──────────────────────────────────────────────────────────────── */

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
      setLastUpdated(data.lastUpdated ? new Date(data.lastUpdated) : null);
      setError(null);
    } catch (err) {
      console.error("Data fetch failed", err);
      setError("Offline: Connection to disaster command center lost.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    const id = setInterval(loadEvents, 30 * 1000); // Poll backend every 30 seconds
    return () => clearInterval(id);
  }, [loadEvents]);

  const addEvent = useCallback(
    (partial: Partial<LiveEvent> & { title: string; coords: [number, number]; hazardType: HazardType }): LiveEvent => {
      const defaults = HAZARD_DEFAULTS[partial.hazardType] ?? HAZARD_DEFAULTS.other;
      const newEvt = {
        title: partial.title,
        location: partial.location ?? partial.title,
        severity: partial.severity ?? "Warning",
        magnitude: partial.magnitude ?? "—",
        magnitudeUnit: partial.magnitudeUnit ?? defaults.magnitudeUnit,
        affected: partial.affected ?? "—",
        detected: "Just now",
        color: partial.color ?? defaults.color,
        dot: partial.dot ?? defaults.dot,
        coords: partial.coords,
        hazardType: partial.hazardType,
        source: partial.source ?? "Agent",
      };

      // Optimistic update local state first
      const tempId = `temp-${Date.now()}`;
      const returnedEvt: LiveEvent = { ...newEvt, id: tempId };
      setEvents((prev) => [returnedEvt, ...prev].slice(0, 30));

      // Call backend and swap the tempId with the real ID
      fetch(`${API_BASE}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvt),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to add event to backend");
          return res.json();
        })
        .then((realEvt) => {
          setEvents((prev) =>
            prev.map((e) => (e.id === tempId ? realEvt : e))
          );
        })
        .catch((err) => {
          console.error("Failed to add event on backend", err);
          // Rollback: remove temporary event
          setEvents((prev) => prev.filter((e) => e.id !== tempId));
        });

      return returnedEvt;
    },
    [],
  );

  const removeEvent = useCallback((id: string): boolean => {
    let found = false;
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      found = next.length < prev.length;
      return next;
    });

    // Call backend in background
    fetch(`${API_BASE}/api/events/${id}`, {
      method: "DELETE",
    })
      .then(() => loadEvents())
      .catch((err) => console.error("Failed to delete event", err));

    return found;
  }, [loadEvents]);

  const updateEvent = useCallback((id: string, patch: Partial<LiveEvent>): boolean => {
    // Optimistic local update
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
    return true;
  }, []);

  const clearCustomEvents = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/events/clear`, { method: "POST" });
      await loadEvents();
    } catch (err) {
      console.error("Failed to clear custom events", err);
    }
  }, [loadEvents]);

  const refreshLive = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/events/refresh`, { method: "POST" });
      await loadEvents();
    } catch (err) {
      console.error("Failed to refresh live events", err);
    }
  }, [loadEvents]);

  return (
    <EventsContext.Provider
      value={{ events, loading, lastUpdated, error, addEvent, removeEvent, updateEvent, clearCustomEvents, refreshLive }}
    >
      {children}
    </EventsContext.Provider>
  );
}

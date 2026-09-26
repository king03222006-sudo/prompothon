import { useState, useEffect } from "react";
import { fetchUSGS, fetchEONET, LiveEvent } from "../lib/api/live-data";

// Severity rank for sorting (higher = shown first)
const SEVERITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Warning: 2,
  Info: 1,
};

export function useLiveEvents() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      try {
        // Fetch all sources in parallel
        const [usgsEvents, eonetEvents] = await Promise.all([
          fetchUSGS(),
          fetchEONET(),
        ]);

        if (!mounted) return;

        const combined = [...usgsEvents, ...eonetEvents];

        // Sort: severity first, then by recency (most recently detected first)
        const sorted = combined.sort((a, b) => {
          const sevDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
          if (sevDiff !== 0) return sevDiff;
          // Fallback: sort by title alphabetically
          return a.title.localeCompare(b.title);
        });

        setEvents(sorted.slice(0, 15)); // Top 15 most critical events
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Error loading live events", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    // Poll every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { events, loading, lastUpdated };
}

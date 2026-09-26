import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Marker, type MarkerKind, MARKERS } from "../components/globe/geo";

/* ─── context type ────────────────────────────────────────────────────────── */

export interface MarkersState {
  markers: Marker[];
  addMarker: (marker: Omit<Marker, "id">) => Marker;
  removeMarker: (id: string) => boolean;
  clearCustomMarkers: () => void;
}

const MarkersContext = createContext<MarkersState | null>(null);

export function useMarkersStore() {
  const ctx = useContext(MarkersContext);
  if (!ctx) throw new Error("useMarkersStore must be inside <MarkersProvider>");
  return ctx;
}

/* ─── provider ────────────────────────────────────────────────────────────── */

export function MarkersProvider({ children }: { children: ReactNode }) {
  const [markers, setMarkers] = useState<Marker[]>(() => {
    try {
      const saved = localStorage.getItem("aegis_markers");
      return saved ? JSON.parse(saved) : MARKERS;
    } catch {
      return MARKERS;
    }
  });

  useEffect(() => {
    localStorage.setItem("aegis_markers", JSON.stringify(markers));
  }, [markers]);

  const addMarker = useCallback((partial: Omit<Marker, "id">): Marker => {
    const id = `marker-${Date.now()}`;
    const newMarker: Marker = { id, ...partial };
    setMarkers((prev) => [...prev, newMarker]);
    return newMarker;
  }, []);

  const removeMarker = useCallback((id: string): boolean => {
    let found = false;
    setMarkers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      found = next.length < prev.length;
      return next;
    });
    return found;
  }, []);

  const clearCustomMarkers = useCallback(() => {
    setMarkers(MARKERS);
  }, []);

  return (
    <MarkersContext.Provider value={{ markers, addMarker, removeMarker, clearCustomMarkers }}>
      {children}
    </MarkersContext.Provider>
  );
}

export type { Marker, MarkerKind };

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/* ─── types ──────────────────────────────────────────────────────────────────── */

export type SelectionItem =
  | { type: "event"; id: string }
  | { type: "route"; id: string }
  | { type: "geoMarker"; id: string };

interface SelectionState {
  selected: SelectionItem | null;
  toggleSelect: (item: SelectionItem) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function useSelectionStore() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelectionStore must be inside <SelectionProvider>");
  return ctx;
}

/* ─── provider ───────────────────────────────────────────────────────────────── */

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectionItem | null>(null);

  const toggleSelect = useCallback((item: SelectionItem) => {
    setSelected((prev) => {
      // Same item clicked twice → deselect
      if (prev && prev.type === item.type && prev.id === item.id) return null;
      return item;
    });
  }, []);

  const clear = useCallback(() => setSelected(null), []);

  return (
    <SelectionContext.Provider value={{ selected, toggleSelect, clear }}>
      {children}
    </SelectionContext.Provider>
  );
}

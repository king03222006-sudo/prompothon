import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Route, type RouteKind, ROUTES } from "../components/globe/geo";

/* ─── context type ────────────────────────────────────────────────────────── */

export interface RoutesState {
  routes: Route[];
  addRoute: (route: Omit<Route, "id">) => Route;
  removeRoute: (id: string) => boolean;
  clearCustomRoutes: () => void;
}

const RoutesContext = createContext<RoutesState | null>(null);

export function useRoutesStore() {
  const ctx = useContext(RoutesContext);
  if (!ctx) throw new Error("useRoutesStore must be inside <RoutesProvider>");
  return ctx;
}

/* ─── provider ────────────────────────────────────────────────────────────── */

export function RoutesProvider({ children }: { children: ReactNode }) {
  const [routes, setRoutes] = useState<Route[]>(() => {
    try {
      const saved = localStorage.getItem("aegis_routes");
      return saved ? JSON.parse(saved) : ROUTES;
    } catch {
      return ROUTES;
    }
  });

  useEffect(() => {
    localStorage.setItem("aegis_routes", JSON.stringify(routes));
  }, [routes]);

  const addRoute = useCallback((partial: Omit<Route, "id">): Route => {
    const id = `route-${Date.now()}`;
    const newRoute: Route = { id, ...partial };
    setRoutes((prev) => [...prev, newRoute]);
    return newRoute;
  }, []);

  const removeRoute = useCallback((id: string): boolean => {
    let found = false;
    setRoutes((prev) => {
      const next = prev.filter((r) => r.id !== id);
      found = next.length < prev.length;
      return next;
    });
    return found;
  }, []);

  const clearCustomRoutes = useCallback(() => {
    setRoutes(ROUTES);
  }, []);

  return (
    <RoutesContext.Provider value={{ routes, addRoute, removeRoute, clearCustomRoutes }}>
      {children}
    </RoutesContext.Provider>
  );
}

export type { Route, RouteKind };

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GlobeClient } from "@/components/globe/GlobeClient";
import { HUD } from "@/components/globe/HUD";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { EventsProvider } from "@/hooks/useEventsStore";
import { RoutesProvider } from "@/hooks/useRoutesStore";
import { MarkersProvider } from "@/hooks/useMarkersStore";
import { SelectionProvider } from "@/hooks/useSelectionStore";
import { ModeSwitcher, type AppMode } from "@/components/theory/ModeSwitcher";
import { TheoryMode } from "@/components/theory/TheoryMode";

export const Route = createFileRoute("/")({\
  head: () => ({
    meta: [
      { title: "AEGIS AI — Autonomous Emergency & Global Intelligence System" },
      { name: "description", content: "AI-powered disaster command center with live 3D Earth, real-time multi-hazard tracking, and an AI agent that controls the globe." },
      { property: "og:title", content: "AEGIS AI — Disaster Intelligence" },
      { property: "og:description", content: "AI-first disaster command center built around a live 3D Earth." },
    ],
  }),
  component: Index,
});

function Index() {
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      return (localStorage.getItem("aegis_mode") as AppMode) || "interactive";
    } catch {
      return "interactive";
    }
  });

  const handleModeChange = (m: AppMode) => {
    setMode(m);
    try { localStorage.setItem("aegis_mode", m); } catch { /* ignore */ }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* ── Mode Switcher — always visible, top-left ── */}
      <div className="mode-switcher-container">
        <ModeSwitcher mode={mode} onChange={handleModeChange} />
      </div>

      {/* ── Interactive Mode (3D globe) ── */}
      {mode === "interactive" && (
        <EventsProvider>
          <RoutesProvider>
            <MarkersProvider>
              <SelectionProvider>
                <main className="relative h-full w-full">
                  <GlobeClient />
                  <HUD />
                  <Dashboard />
                </main>
              </SelectionProvider>
            </MarkersProvider>
          </RoutesProvider>
        </EventsProvider>
      )}

      {/* ── Theory Mode (Wikipedia-based education) ── */}
      {mode === "theory" && (
        <div className="theory-mode-container">
          <TheoryMode />
        </div>
      )}
    </div>
  );
}

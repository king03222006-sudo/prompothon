import { createFileRoute } from "@tanstack/react-router";
import { GlobeClient } from "@/components/globe/GlobeClient";
import { HUD } from "@/components/globe/HUD";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { EventsProvider } from "@/hooks/useEventsStore";
import { RoutesProvider } from "@/hooks/useRoutesStore";
import { MarkersProvider } from "@/hooks/useMarkersStore";
import { SelectionProvider } from "@/hooks/useSelectionStore";

export const Route = createFileRoute("/")({
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
  return (
    <EventsProvider>
      <RoutesProvider>
        <MarkersProvider>
          <SelectionProvider>
            <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
              <GlobeClient />
              <HUD />
              <Dashboard />
            </main>
          </SelectionProvider>
        </MarkersProvider>
      </RoutesProvider>
    </EventsProvider>
  );
}



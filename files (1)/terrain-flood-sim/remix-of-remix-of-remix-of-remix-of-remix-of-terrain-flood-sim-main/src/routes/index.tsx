import { createFileRoute } from "@tanstack/react-router";
import { CesiumViewer } from "@/components/CesiumViewer";
import { ControlPanel } from "@/components/ControlPanel";
import { RightPanel } from "@/components/RightPanel";
import { FloodLayer } from "@/components/FloodLayer";
import { RainOverlay } from "@/components/RainOverlay";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "3D Flood Simulation Platform" },
      { name: "description", content: "Simulate rainfall and point-source flooding on real 3D terrain with OSM buildings — Google Earth-style." },
      { property: "og:title", content: "3D Flood Simulation Platform" },
      { property: "og:description", content: "Real terrain, OSM buildings, interactive flood simulation in the browser." },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <CesiumViewer />
      <FloodLayer />
      <RainOverlay />
      <ControlPanel />
      <RightPanel />
      <Toaster position="bottom-right" theme="dark" richColors />
    </main>
  );
}

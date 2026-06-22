import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CesiumViewer } from "@/components/CesiumViewer";
import { ControlPanel } from "@/components/ControlPanel";
import { FloodLayer } from "@/components/FloodLayer";
import { RainOverlay } from "@/components/RainOverlay";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUser === "Simulation" && loginPass === "3Dsimulation") {
      setIsLoggedIn(true);
      setError("");
    } else {
      setError("Login yoki parol noto'g'ri");
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-secondary/30 p-6 shadow-xl backdrop-blur-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Tizimga kirish</h1>
            <p className="mt-2 text-sm text-muted-foreground">Platformadan foydalanish uchun ma'lumotlarni kiriting</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="username">Login</Label>
            <Input id="username" placeholder="Loginni kiriting" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Parol</Label>
            <Input id="password" type="password" placeholder="Parolni kiriting" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
          </div>

          {error && <p className="text-sm font-medium text-red-500">{error}</p>}

          <Button type="submit" className="w-full mt-2">Kirish</Button>
        </form>
      </div>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <CesiumViewer />
      <FloodLayer />
      <RainOverlay />
      <ControlPanel />
      <Toaster position="bottom-right" theme="dark" richColors />
    </main>
  );
}


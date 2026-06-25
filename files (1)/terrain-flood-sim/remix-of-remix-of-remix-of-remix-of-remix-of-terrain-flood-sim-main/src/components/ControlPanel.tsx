/// <reference types="geojson" />
import { useRef, useState, useEffect } from "react";
import {
  Mountain, Upload, Loader2, MapPin, Key, CloudRain, Crosshair, RotateCcw, Droplets,
  Play, Pause, MousePointerClick, Gauge, Clock, Trash2, Video, StopCircle, AlertTriangle,
  Shield, Download, Building2, Box, Shapes, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useAppStore } from "@/store/app-store";
import { sampleElevationGrid } from "@/lib/elevation";
import { depthColor } from "@/lib/flood";
import { LevelChart } from "@/components/LevelChart";
import { floodEngineState } from "@/components/FloodLayer";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { rasterizeCustomObjects } from "@/lib/rasterize";

const SAMPLE_GEOJSON = `{
  "type": "Feature",
  "properties": { "name": "Sample area — Chimgan, Uzbekistan" },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [70.00, 41.52],
      [70.06, 41.52],
      [70.06, 41.56],
      [70.00, 41.56],
      [70.00, 41.52]
    ]]
  }
}`;

function rgbaCss([r, g, b, a]: [number, number, number, number]) {
  return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
}

function DepthLegend({ maxDepth }: { maxDepth: number }) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => rgbaCss(depthColor(t * Math.max(maxDepth, 0.1), 1)));
  return (
    <div>
      <div className="h-2.5 w-full rounded" style={{ background: `linear-gradient(to right, ${stops.join(",")})` }} />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0 m</span>
        <span>{Math.max(maxDepth, 0.1).toFixed(2)} m</span>
      </div>
    </div>
  );
}

export function ControlPanel() {
  const {
    ionToken, setIonToken,
    geojson, setGeojson,
    grid, setGrid,
    customObjects,
    gridResolution, setGridResolution,
    samplingProgress, setSamplingProgress,
    mode, setMode,
    targetRainfallMm, setTargetRainfallMm,
    currentRainfallMm, setCurrentRainfallMm,
    runoffCoeff, setRunoffCoeff,
    waterLevelOverride, setWaterLevelOverride,
    waterOpacity, setWaterOpacity,
    pointSource, setPointSource,
    targetPointVolumeM3, setTargetPointVolumeM3,
    currentPointVolumeM3, setCurrentPointVolumeM3,
    clipToBoundary, setClipToBoundary,
    isPlaying, setIsPlaying,
    simSpeed, setSimSpeed,
    simDurationSec, setSimDurationSec,
    elapsedSec,
    clearLevelHistory,
    floodResult,
    status, setStatus,
    resetSimulation,
  } = useAppStore();

  const [tokenInput, setTokenInput] = useState(ionToken);
  const [gjText, setGjText] = useState("");
  const [sampling, setSampling] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showHazards, setShowHazardState] = useState(false);
  const [hazardSnap, setHazardSnap] = useState<typeof floodEngineState.hazardMap>(null);
  const [massBalance, setMassBalance] = useState<typeof floodEngineState.massBalance>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Poll engine state for hazard + mass balance display
  useEffect(() => {
    const id = setInterval(() => {
      setHazardSnap(floodEngineState.hazardMap ? { ...floodEngineState.hazardMap } : null);
      setMassBalance(floodEngineState.massBalance ? { ...floodEngineState.massBalance } : null);
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Avtomatik yuklash: Plagindan kelgan fayllar
  useEffect(() => {
    // Boundary yuklash
    fetch("/boundary.geojson")
      .then((r) => {
        if (!r.ok) throw new Error("boundary topilmadi");
        return r.json();
      })
      .then((data) => {
        setGeojson(data);
        setStatus("Boundary loaded from QGIS. Auto-sampling...");
      })
      .catch(() => {}); // e'tiborsiz qoldirish

    // Buildings yuklash
    fetch("/buildings.geojson")
      .then((r) => {
        if (!r.ok) throw new Error("buildings topilmadi");
        return r.json();
      })
      .then((data) => {
        if (data.type === "FeatureCollection" && data.features) {
          const loadedObjects = data.features.map((feat: any, idx: number) => {
            const props = feat.properties || {};
            // Poligon koordinatalarini ajratib olamiz
            const coords = feat.geometry?.coordinates?.[0] || [];
            const positions = coords.map((c: number[]) => ({ lng: c[0], lat: c[1] }));
            return {
              id: `qgis-bldg-${Date.now()}-${idx}`,
              type: "polygon",
              name: `Bino ${idx+1}`,
              positions,
              height: props.height_m || 4.0,
              wallWidth: 0,
              color: "#94a3b8", // Microsoft binolari uchun default kulrang
            };
          });
          
          const currentStore = useAppStore.getState();
          currentStore.clearCustomObjects(); // avvalgilarini o'chirish
          loadedObjects.forEach((obj: any) => currentStore.addCustomObject(obj));
          toast.success(`${loadedObjects.length} ta bino yuklandi`);
        }
      })
      .catch(() => {}); // e'tiborsiz qoldirish
  }, []);

  // Avtomatik Sample elevation grid
  useEffect(() => {
    if (geojson && !grid && !sampling) {
      runSampling();
    }
  }, [geojson]);

  // Rasterize buildings/walls into the DEM whenever they change
  useEffect(() => {
    if (grid && grid.baseData) {
      rasterizeCustomObjects(grid, customObjects);
    }
  }, [grid, customObjects]);

  const toggleHazards = () => {
    floodEngineState.showHazards = !floodEngineState.showHazards;
    setShowHazardState(floodEngineState.showHazards);
  };

  const downloadHazardMap = () => {
    const viewer = (window as any).__viewer;
    if (!viewer) return;
    
    // Switch to hazard mode if not already on
    if (!floodEngineState.showHazards) {
      floodEngineState.showHazards = true;
      setShowHazardState(true);
    }
    
    // Wait a brief moment to ensure render completes, then capture
    setTimeout(() => {
      viewer.scene.render();
      const canvas = viewer.scene.canvas;
      const dataUrl = canvas.toDataURL("image/png");
      
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `havf-zonasi-xaritasi-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Xarita saqlandi (PNG)");
    }, 100);
  };

  const zoomToArea = () => {
    const viewer = (window as any).__viewer;
    const Cesium = (window as any).Cesium;
    if (!viewer || !Cesium || !geojson) return;

    const polys: GeoJSON.Position[][][] =
      geojson.geometry.type === "Polygon"
        ? [geojson.geometry.coordinates as GeoJSON.Position[][]]
        : (geojson.geometry.coordinates as GeoJSON.Position[][][]);

    let allLngLat: number[] = [];
    polys.forEach((rings) => {
      const outer = rings[0];
      const positions = outer.flatMap(([lng, lat]) => [lng, lat]);
      allLngLat = allLngLat.concat(positions);
    });

    if (allLngLat.length >= 4) {
      const lngs = allLngLat.filter((_, i) => i % 2 === 0);
      const lats = allLngLat.filter((_, i) => i % 2 === 1);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const corners = [
        Cesium.Cartesian3.fromDegrees(minLng, minLat),
        Cesium.Cartesian3.fromDegrees(maxLng, minLat),
        Cesium.Cartesian3.fromDegrees(maxLng, maxLat),
        Cesium.Cartesian3.fromDegrees(minLng, maxLat),
        Cesium.Cartesian3.fromDegrees((minLng + maxLng) / 2, (minLat + maxLat) / 2),
      ];
      const sphere = Cesium.BoundingSphere.fromPoints(corners);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-55),
          sphere.radius * 2.4,
        ),
      });
    }
  };

  const clearBoundary = () => {
    setIsPlaying(false);
    setGeojson(null);
    setGrid(null);
    setPointSource(null);
    setWaterLevelOverride(null);
    setGjText("");
    setStatus("Boundary cleared. Paste or upload a new GeoJSON polygon.");
    toast.success("Area cleared");
  };

  const startRecording = () => {
    const viewer = (window as any).__viewer;
    const canvas: HTMLCanvasElement | undefined = viewer?.canvas;
    if (!canvas || typeof canvas.captureStream !== "function") {
      toast.error("Recording not supported in this browser");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const mimeCandidates = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `flood-simulation-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success("Recording saved");
      };
      rec.start(250);
      recorderRef.current = rec;
      setRecording(true);
      toast.success("Recording started");
    } catch (e: any) {
      toast.error(`Cannot start recording: ${e.message ?? e}`);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const [isAutoTouring, setIsAutoTouring] = useState(false);
  const autoTourTimeoutRef = useRef<any>(null);

  const startCameraTour = () => {
    const viewer = (window as any).__viewer;
    const Cesium = (window as any).Cesium;
    if (!viewer || !Cesium || !geojson) return;

    // Get the center of the bounding box
    const polys: GeoJSON.Position[][][] =
      geojson.geometry.type === "Polygon"
        ? [geojson.geometry.coordinates as GeoJSON.Position[][]]
        : (geojson.geometry.coordinates as GeoJSON.Position[][][]);

    let sumLng = 0, sumLat = 0, count = 0;
    polys.forEach((rings) => {
      rings[0].forEach(([lng, lat]) => {
        sumLng += lng;
        sumLat += lat;
        count++;
      });
    });
    if (count === 0) return;
    const centerLng = sumLng / count;
    const centerLat = sumLat / count;
    const centerCartesian = Cesium.Cartesian3.fromDegrees(centerLng, centerLat);

    let angle = 0;
    const onTickListener = () => {
      angle += 0.005; // speed of rotation
      // Position camera around the center with dynamic orbit height and angle
      const initialRadius = viewer.camera.positionCartographic.height || 1000;
      const radius = initialRadius * (1 + 0.15 * Math.sin(angle * 2));
      const pitch = Cesium.Math.toRadians(-40 + 10 * Math.sin(angle));
      const heading = angle;
      
      // Update camera view locked to terrain center
      viewer.camera.lookAt(
        centerCartesian,
        new Cesium.HeadingPitchRange(heading, pitch, radius)
      );
    };

    viewer.clock.onTick.addEventListener(onTickListener);
    (window as any).__cameraTourListener = onTickListener;
  };

  const stopCameraTour = () => {
    const viewer = (window as any).__viewer;
    const Cesium = (window as any).Cesium;
    if (viewer && (window as any).__cameraTourListener) {
      viewer.clock.onTick.removeEventListener((window as any).__cameraTourListener);
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); // unlock camera navigation
      (window as any).__cameraTourListener = null;
    }
  };

  const startAutoTourRecord = () => {
    if (!grid) return toast.error("Sample terrain elevations first");
    
    // 1. Reset simulation state
    resetSimulation();
    useAppStore.setState({ elapsedSec: 0 });
    clearLevelHistory();

    // 2. Start video capture
    startRecording();

    // 3. Start simulation playback
    setIsPlaying(true);

    // 4. Start camera orbit fly-through
    startCameraTour();
    setIsAutoTouring(true);

    toast.info("Auto 30s recording started... Camera will fly around the area of interest!");

    // 5. Schedule stop after 30 seconds
    autoTourTimeoutRef.current = setTimeout(() => {
      stopAutoTourRecord();
      toast.success("Completed! Video downloaded.");
    }, 30000);
  };

  const stopAutoTourRecord = () => {
    if (autoTourTimeoutRef.current) {
      clearTimeout(autoTourTimeoutRef.current);
      autoTourTimeoutRef.current = null;
    }
    stopCameraTour();
    stopRecording();
    setIsPlaying(false);
    setIsAutoTouring(false);
  };

  const loadGeojson = (text: string) => {
    try {
      const raw = JSON.parse(text);
      const feat: GeoJSON.Feature =
        raw.type === "FeatureCollection" ? raw.features[0] : raw.type === "Feature" ? raw : { type: "Feature", properties: {}, geometry: raw };
      if (!feat.geometry || (feat.geometry.type !== "Polygon" && feat.geometry.type !== "MultiPolygon")) {
        throw new Error("Geometry must be Polygon or MultiPolygon");
      }
      setGeojson(feat as any);
      setGrid(null);
      const areaKm2 = turf.area(feat as any) / 1e6;
      setStatus(`Loaded area · ${areaKm2.toFixed(2)} km²`);
      toast.success(`Area loaded — ${areaKm2.toFixed(2)} km²`);
    } catch (e: any) {
      toast.error(`Invalid GeoJSON: ${e.message}`);
    }
  };

  const onFile = async (f: File) => {
    const txt = await f.text();
    setGjText(txt);
    loadGeojson(txt);
  };

  const runSampling = async () => {
    if (!geojson) return toast.error("Load a GeoJSON polygon first");
    setSampling(true);
    setSamplingProgress(0);
    setStatus("Sampling terrain elevations…");
    try {
      const g = await sampleElevationGrid(geojson, gridResolution, setSamplingProgress);
      setGrid(g);
      setStatus(`Grid ready · ${g.nRows}×${g.nCols} · elevation ${g.minElevation.toFixed(1)}–${g.maxElevation.toFixed(1)} m`);
      toast.success("Elevation grid sampled");
    } catch (e: any) {
      toast.error(e.message ?? "Sampling failed");
      setStatus(`Error: ${e.message}`);
    } finally {
      setSampling(false);
    }
  };

  const togglePlay = () => {
    if (!grid) return;
    if (mode === "point" && !pointSource) {
      toast.error("Click on the map to place a water source first");
      return;
    }
    const restartRain = mode === "rainfall" && currentRainfallMm >= targetRainfallMm;
    const restartPoint = mode === "point" && currentPointVolumeM3 >= targetPointVolumeM3;
    if (restartRain) setCurrentRainfallMm(0);
    if (restartPoint) setCurrentPointVolumeM3(0);
    if (!isPlaying && (restartRain || restartPoint || (mode === "rainfall" ? currentRainfallMm === 0 : currentPointVolumeM3 === 0))) {
      useAppStore.setState({ elapsedSec: 0 });
      clearLevelHistory();
    }
    setWaterLevelOverride(null);
    setIsPlaying(!isPlaying);
  };

  return (
    <aside className="pointer-events-auto absolute left-4 top-4 z-10 flex max-h-[calc(100vh-2rem)] w-[380px] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl backdrop-blur-xl">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Mountain className="h-5 w-5 text-accent" />
          Flood Simulation 3D
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Real terrain · rainfall &amp; point-source flooding</p>
      </header>

      {/* Area */}
      <section className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Area boundary (GeoJSON)
        </Label>
        <Textarea rows={5} spellCheck={false} placeholder="Paste a Polygon / MultiPolygon Feature…"
          value={gjText} onChange={(e) => setGjText(e.target.value)} className="font-mono text-[11px]" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => loadGeojson(gjText)} disabled={!gjText.trim()}>Load</Button>
          <Button size="sm" variant="secondary" onClick={() => { setGjText(SAMPLE_GEOJSON); loadGeojson(SAMPLE_GEOJSON); }}>Use sample</Button>
          <label className="inline-flex">
            <input type="file" accept=".geojson,.json,application/json" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent/30">
              <Upload className="h-3.5 w-3.5" /> Upload
            </span>
          </label>
          <Button size="sm" variant="outline" onClick={zoomToArea} disabled={!geojson}>
            <Crosshair className="mr-1.5 h-3.5 w-3.5" /> Zoom to area
          </Button>
          <Button size="sm" variant="ghost" onClick={clearBoundary} disabled={!geojson && !gjText.trim()}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear area
          </Button>
        </div>
      </section>

      <Separator />

      {/* Grid */}
      <section className="space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Terrain elevation grid</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Resolution</Label>
          <Input type="number" min={50} max={1000} value={gridResolution}
            onChange={(e) => setGridResolution(Math.max(50, Math.min(1000, Number(e.target.value) || 150)))}
            className="h-8 w-20" />
          <span className="text-[11px] text-muted-foreground">N × N cells</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input 
            type="checkbox" 
            id="clip-toggle" 
            checked={clipToBoundary} 
            onChange={(e) => setClipToBoundary(e.target.checked)} 
            className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
          />
          <Label htmlFor="clip-toggle" className="text-xs cursor-pointer">Clip globe to boundary (faster)</Label>
        </div>
        {sampling && <Progress value={samplingProgress * 100} />}
        {grid && !sampling && (
          <div className="rounded-md border border-border bg-secondary/50 p-2 text-[11px] text-muted-foreground">
            <div>Elevation: <span className="text-foreground">{grid.minElevation.toFixed(1)} – {grid.maxElevation.toFixed(1)} m</span></div>
            <div>Cell size: ~{grid.cellWidthM.toFixed(1)} × {grid.cellHeightM.toFixed(1)} m</div>
            <div>Area: {(grid.validArea / 1e6).toFixed(3)} km²</div>
          </div>
        )}
      </section>

      <Separator />

      {/* Mode */}
      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Simulation mode</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant={mode === "rainfall" ? "default" : "secondary"} onClick={() => setMode("rainfall")}>
            <CloudRain className="mr-1.5 h-3.5 w-3.5" /> Rainfall
          </Button>
          <Button size="sm" variant={mode === "point" ? "default" : "secondary"} onClick={() => setMode("point")}>
            <Crosshair className="mr-1.5 h-3.5 w-3.5" /> Point source
          </Button>
        </div>
      </section>

      {/* Playback (duration + speed) */}
      <section className="space-y-3 rounded-md border border-border bg-secondary/20 p-3">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" /> Playback
        </Label>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> Duration (sec)</Label>
            <Input type="number" min={5} max={300} step={1} value={simDurationSec}
              onChange={(e) => setSimDurationSec(Math.max(5, Math.min(300, Number(e.target.value) || 30)))}
              className="h-7 w-20 text-right" />
          </div>
          <Slider min={5} max={120} step={1} value={[Math.min(simDurationSec, 120)]}
            onValueChange={([v]) => setSimDurationSec(v)} />
          <div className="text-[10px] text-muted-foreground">
            Istalgan miqdor shu vaqt ichida to'liq quyiladi (default 30s).
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Speed</Label>
            <span className="text-[11px] text-foreground">{simSpeed.toFixed(2)}×</span>
          </div>
          <Slider min={0.25} max={5} step={0.25} value={[simSpeed]} onValueChange={([v]) => setSimSpeed(v)} />
          <div className="flex gap-1">
            {[0.5, 1, 2, 4].map((s) => (
              <Button key={s} size="sm" variant={simSpeed === s ? "default" : "ghost"}
                className="h-6 flex-1 text-[11px]" onClick={() => setSimSpeed(s)}>
                {s}×
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between rounded bg-background/40 px-2 py-1 text-[11px]">
          <span className="text-muted-foreground">Holat:</span>
          <span className="text-foreground font-mono">
            {elapsedSec < simDurationSec
              ? `Yomg'ir yog'moqda: ${Math.ceil(Math.max(0, simDurationSec - elapsedSec))}s qoldi`
              : `Suv yig'ilmoqda: ${Math.ceil(Math.max(0, (simDurationSec + 5) - elapsedSec))}s qoldi`
            }
          </span>
        </div>
      </section>



      {/* Rainfall controls */}
      {mode === "rainfall" && (
        <section className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <CloudRain className="h-3.5 w-3.5" /> Rainfall input
          </Label>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Target rainfall (mm)</Label>
              <Input type="number" min={0} max={100000} step={10} value={targetRainfallMm}
                onChange={(e) => setTargetRainfallMm(Math.max(0, Math.min(100000, Number(e.target.value) || 0)))}
                className="h-7 w-24 text-right" disabled={!grid} />
            </div>
            <Slider min={0} max={100000} step={10} value={[targetRainfallMm]}
              onValueChange={([v]) => setTargetRainfallMm(v)} disabled={!grid} />
            <div className="text-[10px] text-muted-foreground">
              Currently fallen: <span className="text-foreground">{currentRainfallMm.toFixed(0)} mm</span> / {targetRainfallMm} mm
            </div>
            <Progress value={targetRainfallMm > 0 ? (currentRainfallMm / targetRainfallMm) * 100 : 0} />
          </div>

          <div className="rounded-md bg-background/40 p-2 text-[10px] text-muted-foreground">
            Yomg'ir tezligi avtomatik tanlanadi — istalgan miqdor <span className="text-foreground">{Math.max(1, Math.round(simDurationSec))} sekundda</span> to'liq yog'ib bo'ladi
            (≈ <span className="text-foreground">{(targetRainfallMm / Math.max(1, simDurationSec)).toFixed(1)} mm/s</span>). Shundan so'ng 5 sekund davomida suv oqib tarqaladi.
          </div>


          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Runoff coefficient</Label>
              <Input type="number" min={0} max={1} step={0.05} value={runoffCoeff}
                onChange={(e) => setRunoffCoeff(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                className="h-7 w-20 text-right" disabled={!grid} />
            </div>
            <Slider min={0} max={1} step={0.05} value={[runoffCoeff]}
              onValueChange={([v]) => setRunoffCoeff(v)} disabled={!grid} />
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={togglePlay} disabled={!grid}>
              {isPlaying ? <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pause</> : <><Play className="mr-1.5 h-3.5 w-3.5" /> {currentRainfallMm > 0 && currentRainfallMm < targetRainfallMm ? "Resume" : "Start rain"}</>}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setIsPlaying(false); setCurrentRainfallMm(0); setWaterLevelOverride(null); }} disabled={!grid}>
              Clear
            </Button>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Water level override (m)</Label>
              <span className="text-[11px] text-muted-foreground">
                {waterLevelOverride != null ? waterLevelOverride.toFixed(1) : "auto"}
              </span>
            </div>
            <Slider min={grid?.minElevation ?? 0} max={grid?.maxElevation ?? 1}
              step={(grid ? (grid.maxElevation - grid.minElevation) / 200 : 0.01) || 0.01}
              value={[waterLevelOverride ?? floodResult?.level ?? grid?.minElevation ?? 0]}
              onValueChange={([v]) => { setIsPlaying(false); setWaterLevelOverride(v); }}
              disabled={!grid} />
            {waterLevelOverride != null && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setWaterLevelOverride(null)}>
                ← back to rainfall-derived
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Point source controls */}
      {mode === "point" && (
        <section className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Crosshair className="h-3.5 w-3.5" /> Point water source
          </Label>

          <div className="rounded-md bg-background/40 p-2 text-[11px]">
            {pointSource ? (
              <div className="flex items-center justify-between">
                <span className="text-foreground">
                  📍 {pointSource.lat.toFixed(5)}, {pointSource.lng.toFixed(5)}
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                  onClick={() => { setPointSource(null); setIsPlaying(false); }}>
                  Clear
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MousePointerClick className="h-3.5 w-3.5" /> Click on the terrain to place a source
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Target volume (m³)</Label>
              <Input type="number" min={0} max={1e9} step={1000} value={targetPointVolumeM3}
                onChange={(e) => setTargetPointVolumeM3(Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-28 text-right" disabled={!grid} />
            </div>
            <Slider min={0} max={5_000_000} step={10_000} value={[Math.min(targetPointVolumeM3, 5_000_000)]}
              onValueChange={([v]) => setTargetPointVolumeM3(v)} disabled={!grid} />
            <div className="text-[10px] text-muted-foreground">
              Poured: <span className="text-foreground">{currentPointVolumeM3.toFixed(0)} m³</span> / {targetPointVolumeM3.toFixed(0)} m³
            </div>
            <Progress value={targetPointVolumeM3 > 0 ? (currentPointVolumeM3 / targetPointVolumeM3) * 100 : 0} />
          </div>

          <div className="rounded-md bg-background/40 p-2 text-[10px] text-muted-foreground">
            Oqim tezligi avtomatik — jami hajm belgilangan <span className="text-foreground">{Math.max(1, Math.round(simDurationSec))} sekundda</span> quyiladi
            (≈ <span className="text-foreground">{(targetPointVolumeM3 / Math.max(1, simDurationSec)).toFixed(0)} m³/s</span>), so'ng yana 5 sekund oqib tarqaladi.
          </div>


          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={togglePlay} disabled={!grid || !pointSource}>
              {isPlaying ? <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pause</> : <><Play className="mr-1.5 h-3.5 w-3.5" /> {currentPointVolumeM3 > 0 && currentPointVolumeM3 < targetPointVolumeM3 ? "Resume" : "Start flow"}</>}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setIsPlaying(false); setCurrentPointVolumeM3(0); }} disabled={!grid}>
              Clear
            </Button>
          </div>
        </section>
      )}

      {/* Opacity (always visible) */}
      {grid && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1 text-xs">
              <Droplets className="h-3 w-3" /> Water opacity
            </Label>
            <span className="text-[11px] text-muted-foreground">{Math.round(waterOpacity * 100)}%</span>
          </div>
          <Slider min={0.1} max={1} step={0.05} value={[waterOpacity]} onValueChange={([v]) => setWaterOpacity(v)} />
        </div>
      )}

      {/* Results */}
      {floodResult && grid && (
        <section className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Natijalar / Results</Label>

          {/* Prominent flooded area display */}
          <div className="rounded-md bg-cyan-900/30 border border-cyan-500/40 p-2 text-center">
            <div className="text-[10px] text-cyan-300 uppercase tracking-wide mb-0.5">Suv bosgan maydon</div>
            <div className="text-xl font-bold text-cyan-100">
              {floodResult.floodedArea >= 1e6
                ? `${(floodResult.floodedArea / 1e6).toFixed(3)} km²`
                : `${(floodResult.floodedArea / 1e4).toFixed(2)} ha`}
            </div>
            <div className="text-[10px] text-cyan-400">
              {((floodResult.floodedArea / grid.validArea) * 100).toFixed(1)}% hududdan
              {" · "}{floodResult.floodedCells.toLocaleString()} katak
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Max chuqurlik</span>
            <span className="text-right text-foreground font-medium">{floodResult.maxDepth.toFixed(2)} m</span>
            <span className="text-muted-foreground">O'rtacha chuqurlik</span>
            <span className="text-right text-foreground">{floodResult.meanDepth.toFixed(2)} m</span>
            <span className="text-muted-foreground">Suv sathi</span>
            <span className="text-right text-foreground">{floodResult.level.toFixed(1)} m</span>
            {massBalance && (
              <>
                <span className="text-muted-foreground">Jami suv hajmi</span>
                <span className="text-right text-foreground">
                  {massBalance.currentVolume >= 1e6
                    ? `${(massBalance.currentVolume / 1e6).toFixed(2)} Mm³`
                    : `${(massBalance.currentVolume / 1e3).toFixed(0)} k m³`}
                </span>
              </>
            )}
          </div>
          <DepthLegend maxDepth={floodResult.maxDepth} />
          <LevelChart />
        </section>
      )}

      {/* Hazard Zone Panel */}
      {hazardSnap && (
        <section className="space-y-2 rounded-md border border-orange-500/40 bg-orange-950/20 p-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-orange-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Havf zonalari
            </Label>
            <div className="flex gap-1.5">
              <Button size="sm" variant={showHazards ? "default" : "outline"}
                className="h-6 px-2 text-[10px]" onClick={toggleHazards}>
                <Shield className="mr-1 h-3 w-3" />
                {showHazards ? "Havf xaritasi" : "Ko'k xarita"}
              </Button>
              <Button size="sm" variant="outline"
                className="h-6 px-2 text-[10px]" onClick={downloadHazardMap} title="PNG rasm qilib saqlash">
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-cyan-300"/>Past havf</span>
            <span className="text-right text-foreground">{hazardSnap.lowCount + hazardSnap.mediumCount} ta</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500"/>Yuqori havf</span>
            <span className="text-right text-foreground">{hazardSnap.highCount} ta</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-900"/>Juda yuqori</span>
            <span className="text-right text-foreground">{hazardSnap.veryHighCount} ta</span>
          </div>
          {massBalance && (
            <div className={`rounded px-2 py-1 text-[10px] ${
              massBalance.isBalanced ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"
            }`}>
              Massa balansi: {massBalance.isBalanced ? "✅ Normal" : `⚠️ Xato ${massBalance.errorPercent.toFixed(1)}%`}
              {" · "} Joriy: {(massBalance.currentVolume / 1e6).toFixed(2)} Mm³
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetSimulation} disabled={!grid} className="flex-1">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          {recording && !isAutoTouring ? (
            <Button variant="destructive" size="sm" onClick={stopRecording} className="flex-1">
              <StopCircle className="mr-1.5 h-3.5 w-3.5" /> Stop &amp; save
            </Button>
          ) : !recording ? (
            <Button variant="secondary" size="sm" onClick={startRecording} disabled={!grid} className="flex-1">
              <Video className="mr-1.5 h-3.5 w-3.5" /> Record video
            </Button>
          ) : null}
        </div>
      </div>

      <footer className="rounded-md bg-secondary/40 p-2 text-[11px] text-muted-foreground">
        <strong className="text-foreground">Status:</strong> {status}
      </footer>
    </aside>
  );
}

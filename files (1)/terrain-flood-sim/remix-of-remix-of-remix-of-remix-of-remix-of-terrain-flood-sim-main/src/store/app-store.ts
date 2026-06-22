/// <reference types="geojson" />
import { create } from "zustand";

export type SimMode = "rainfall" | "point";

export interface ElevationGrid {
  data: Float32Array;
  nRows: number;
  nCols: number;
  bbox: [number, number, number, number];
  cellWidthM: number;
  cellHeightM: number;
  minElevation: number;
  maxElevation: number;
  validArea: number;
}

export interface FloodResult {
  level: number;
  floodedCells: number;
  floodedArea: number;
  maxDepth: number;
  meanDepth: number;
}

export interface PointSource {
  lng: number;
  lat: number;
}

// 3D Custom Objects drawn by the user (like in ArcGIS Pro)
export interface Custom3DObject {
  id: string;
  type: "box" | "polygon";
  name: string;
  // For box:
  center?: { lng: number; lat: number };
  length?: number; // north-south distance in meters
  width?: number;  // east-west distance in meters
  // For polygon:
  positions?: { lng: number; lat: number }[];
  // Common details:
  height: number;  // extrusion height in meters
  color: string;   // hex string for color
}

interface AppState {
  ionToken: string;
  setIonToken: (t: string) => void;

  customObjects: Custom3DObject[];
  addCustomObject: (obj: Custom3DObject) => void;
  removeCustomObject: (id: string) => void;
  clearCustomObjects: () => void;

  drawMode: "none" | "box" | "polygon";
  setDrawMode: (mode: "none" | "box" | "polygon") => void;
  drawPoints: { lng: number; lat: number }[];
  setDrawPoints: (pts: { lng: number; lat: number }[]) => void;
  activeObject: Custom3DObject | null;
  setActiveObject: (obj: Custom3DObject | null) => void;

  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  setGeojson: (g: AppState["geojson"]) => void;

  grid: ElevationGrid | null;
  setGrid: (g: ElevationGrid | null) => void;

  gridResolution: number;
  setGridResolution: (n: number) => void;

  clipToBoundary: boolean;
  setClipToBoundary: (b: boolean) => void;

  samplingProgress: number;
  setSamplingProgress: (p: number) => void;

  mode: SimMode;
  setMode: (m: SimMode) => void;

  // --- Rainfall ---
  /** Target rainfall the simulation will animate up to (mm). Up to 100000. */
  targetRainfallMm: number;
  setTargetRainfallMm: (v: number) => void;
  /** Currently applied rainfall (mm). Driven by the play loop. */
  currentRainfallMm: number;
  setCurrentRainfallMm: (v: number) => void;
  /** Rain intensity in mm per second of wall-clock time. */
  rainRateMmPerSec: number;
  setRainRateMmPerSec: (v: number) => void;
  runoffCoeff: number;
  setRunoffCoeff: (v: number) => void;

  /** When set, overrides any computed water level (only used when paused). */
  waterLevelOverride: number | null;
  setWaterLevelOverride: (v: number | null) => void;

  waterOpacity: number;
  setWaterOpacity: (v: number) => void;

  // --- Point source ---
  pointSource: PointSource | null;
  setPointSource: (p: PointSource | null) => void;
  /** Target volume of water to pour from the point (m³). */
  targetPointVolumeM3: number;
  setTargetPointVolumeM3: (v: number) => void;
  /** Current volume already poured (m³). Driven by play loop. */
  currentPointVolumeM3: number;
  setCurrentPointVolumeM3: (v: number) => void;
  /** Flow rate in m³ / second of wall-clock time. */
  pointFlowRateM3PerSec: number;
  setPointFlowRateM3PerSec: (v: number) => void;

  // --- Playback ---
  isPlaying: boolean;
  setIsPlaying: (b: boolean) => void;
  /** Speed multiplier (0.25x – 5x). */
  simSpeed: number;
  setSimSpeed: (v: number) => void;
  /** Total simulated wall-clock duration in seconds to fully reach the target. */
  simDurationSec: number;
  setSimDurationSec: (v: number) => void;
  /** Elapsed simulated seconds since start of current run. */
  elapsedSec: number;
  setElapsedSec: (v: number) => void;
  /** Recent (t, level, maxDepth) samples for the chart. */
  levelHistory: { t: number; level: number; depth: number }[];
  pushLevelSample: (s: { t: number; level: number; depth: number }) => void;
  clearLevelHistory: () => void;

  floodResult: FloodResult | null;
  setFloodResult: (r: FloodResult | null) => void;

  status: string;
  setStatus: (s: string) => void;

  resetSimulation: () => void;
}

const TOKEN_KEY = "cesium_ion_token";

export const useAppStore = create<AppState>((set) => ({
  ionToken: typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) ?? "" : "",
  setIonToken: (t) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(TOKEN_KEY, t);
    set({ ionToken: t });
  },

  geojson: null,
  setGeojson: (g) => set({ geojson: g }),

  grid: null,
  setGrid: (g) =>
    set({
      grid: g,
      waterLevelOverride: null,
      floodResult: null,
      currentRainfallMm: 0,
      currentPointVolumeM3: 0,
      isPlaying: false,
      elapsedSec: 0,
      levelHistory: [],
    }),

  gridResolution: 400,
  setGridResolution: (n) => set({ gridResolution: n }),

  clipToBoundary: false,
  setClipToBoundary: (b) => set({ clipToBoundary: b }),

  samplingProgress: 0,
  setSamplingProgress: (p) => set({ samplingProgress: p }),

  mode: "rainfall",
  setMode: (m) =>
    set({
      mode: m,
      isPlaying: false,
      waterLevelOverride: null,
      elapsedSec: 0,
      levelHistory: [],
    }),

  targetRainfallMm: 100,
  setTargetRainfallMm: (v) => set({ targetRainfallMm: v }),
  currentRainfallMm: 0,
  setCurrentRainfallMm: (v) => set({ currentRainfallMm: v }),
  rainRateMmPerSec: 20,
  setRainRateMmPerSec: (v) => set({ rainRateMmPerSec: v }),
  runoffCoeff: 0.7,
  setRunoffCoeff: (v) => set({ runoffCoeff: v }),

  waterLevelOverride: null,
  setWaterLevelOverride: (v) => set({ waterLevelOverride: v }),

  waterOpacity: 0.65,
  setWaterOpacity: (v) => set({ waterOpacity: v }),

  pointSource: null,
  setPointSource: (p) => set({ pointSource: p, currentPointVolumeM3: 0 }),
  targetPointVolumeM3: 500_000,
  setTargetPointVolumeM3: (v) => set({ targetPointVolumeM3: v }),
  currentPointVolumeM3: 0,
  setCurrentPointVolumeM3: (v) => set({ currentPointVolumeM3: v }),
  pointFlowRateM3PerSec: 50_000,
  setPointFlowRateM3PerSec: (v) => set({ pointFlowRateM3PerSec: v }),

  isPlaying: false,
  setIsPlaying: (b) => set({ isPlaying: b }),

  simSpeed: 1,
  setSimSpeed: (v) => set({ simSpeed: v }),
  simDurationSec: 30,
  setSimDurationSec: (v) => set({ simDurationSec: v }),
  elapsedSec: 0,
  setElapsedSec: (v) => set({ elapsedSec: v }),
  levelHistory: [],
  pushLevelSample: (s) =>
    set((st) => {
      const next = st.levelHistory.length > 240 ? st.levelHistory.slice(-240) : st.levelHistory;
      return { levelHistory: [...next, s] };
    }),
  clearLevelHistory: () => set({ levelHistory: [] }),

  floodResult: null,
  setFloodResult: (r) => set({ floodResult: r }),

  status: "Ready. Load a GeoJSON polygon to begin.",
  setStatus: (s) => set({ status: s }),

  customObjects: [],
  addCustomObject: (obj) => set((s) => ({ customObjects: [...s.customObjects, obj] })),
  removeCustomObject: (id) => set((s) => ({ customObjects: s.customObjects.filter((o) => o.id !== id) })),
  clearCustomObjects: () => set({ customObjects: [] }),

  drawMode: "none",
  setDrawMode: (mode) => set({ drawMode: mode, drawPoints: [], activeObject: null }),
  drawPoints: [],
  setDrawPoints: (pts) => set({ drawPoints: pts }),
  activeObject: null,
  setActiveObject: (obj) => set({ activeObject: obj }),

  resetSimulation: () =>
    set({
      waterLevelOverride: null,
      floodResult: null,
      currentRainfallMm: 0,
      currentPointVolumeM3: 0,
      isPlaying: false,
      elapsedSec: 0,
      levelHistory: [],
      drawMode: "none",
      drawPoints: [],
      activeObject: null,
    }),
}));

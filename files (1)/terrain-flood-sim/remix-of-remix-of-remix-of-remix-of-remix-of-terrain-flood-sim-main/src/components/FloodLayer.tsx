import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/app-store";
import type { ElevationGrid } from "@/store/app-store";
import { computeFloodStats, lngLatToCellIndex } from "@/lib/flood";
import {
  PHYS_MULT,
  DEFAULT_CONFIG,
  ActiveCellTracker,
  MassBalanceTracker,
  VelocityField,
  HazardMap,
  advancedShallowWaterStep,
  advancedCFLTimestep,
  assessHazardZones,
  buildAdvancedCanvas,
  computeAdvancedStats,
  createVelocityField,
  classifyManningN,
} from "@/lib/advanced-flood-engine";

// ─── Shared flag to expose hazard state to ControlPanel ─────────────────────
export const floodEngineState = {
  showHazards: false,
  hazardMap: null as HazardMap | null,
  massBalance: null as { addedVolume: number; currentVolume: number; infiltratedVolume: number; errorPercent: number; isBalanced: boolean } | null,
};

/**
 * Advanced headless flood simulation component.
 *
 * Key improvements over the basic version:
 * • 60× physics acceleration → water flows full terrain in ~20s animation
 * • Spatial Manning's n (slope-classified roughness per cell)
 * • Active cell tracking → 3-5× speedup on small/medium floods
 * • Hazard zone rendering (Low=blue / Medium=orange / High=red)
 * • Mass balance verification
 * • Bilinear-upscaled 4× canvas (no blocky pixels)
 */
export function FloodLayer() {
  const grid               = useAppStore((s) => s.grid);
  const mode               = useAppStore((s) => s.mode);
  const targetRainfallMm   = useAppStore((s) => s.targetRainfallMm);
  const runoffCoeff        = useAppStore((s) => s.runoffCoeff);
  const waterLevelOverride = useAppStore((s) => s.waterLevelOverride);
  const waterOpacity       = useAppStore((s) => s.waterOpacity);
  const pointSource        = useAppStore((s) => s.pointSource);
  const targetPointVolumeM3 = useAppStore((s) => s.targetPointVolumeM3);
  const isPlaying          = useAppStore((s) => s.isPlaying);
  const setIsPlaying       = useAppStore((s) => s.setIsPlaying);
  const setFloodResult     = useAppStore((s) => s.setFloodResult);

  // Simulation buffers
  const depthsRef       = useRef<Float32Array | null>(null);
  const velocitiesRef   = useRef<VelocityField | null>(null);
  const infiltrationRef = useRef<Float32Array | null>(null);
  const manningNRef     = useRef<Float32Array | null>(null);
  const trackerRef      = useRef<ActiveCellTracker | null>(null);
  const balanceRef      = useRef<MassBalanceTracker | null>(null);
  const gridIdRef       = useRef<unknown>(null);

  // Wall-clock elapsed for rainfall phase (0 → animDur)
  const wallElapsedRef  = useRef(0);
  // After rain stops, continue physics until ridges drain (drain phase)
  const drainElapsedRef = useRef(0);
  // Pre-computed high-elevation "ridge" cells that receive rainfall
  // (top 35% of valid terrain elevation → rainfall concentrates on peaks/ridges)
  const rainSourceCellsRef = useRef<Int32Array | null>(null);
  
  // Ref to hold the latest rendered canvas for Cesium CallbackProperty
  const latestCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Allocate / reallocate when grid changes
  if (grid && gridIdRef.current !== grid) {
    gridIdRef.current     = grid;
    const N               = grid.data.length;
    depthsRef.current     = new Float32Array(N);
    velocitiesRef.current = createVelocityField(N);
    infiltrationRef.current = new Float32Array(N);
    manningNRef.current   = classifyManningN(grid);
    trackerRef.current    = new ActiveCellTracker(N);
    balanceRef.current    = new MassBalanceTracker(grid);
    wallElapsedRef.current = 0;

    // Pre-compute rainfall source cells: top 35% elevation (mountain ridges/peaks)
    // These act like many distributed point sources — water flows down from here.
    const validElev: number[] = [];
    for (let i = 0; i < N; i++) {
      if (grid.data[i] === grid.data[i]) validElev.push(grid.data[i]);
    }
    validElev.sort((a, b) => b - a); // descending
    const threshold35 = validElev[Math.floor(validElev.length * 0.35)] ?? grid.minElevation;
    const ridgeCells: number[] = [];
    for (let i = 0; i < N; i++) {
      if (grid.data[i] >= threshold35) ridgeCells.push(i);
    }
    rainSourceCellsRef.current = new Int32Array(ridgeCells);
  } else if (!grid) {
    depthsRef.current     = null;
    velocitiesRef.current = null;
    infiltrationRef.current = null;
    manningNRef.current   = null;
    trackerRef.current    = null;
    balanceRef.current    = null;
    rainSourceCellsRef.current = null;
    gridIdRef.current     = null;
    wallElapsedRef.current = 0;
  }

  const resetBuffers = () => {
    depthsRef.current?.fill(0);
    infiltrationRef.current?.fill(0);
    wallElapsedRef.current = 0;
    drainElapsedRef.current = 0;
    balanceRef.current?.reset();
    if (velocitiesRef.current) {
      velocitiesRef.current.u.fill(0);
      velocitiesRef.current.v.fill(0);
      velocitiesRef.current.magnitude.fill(0);
    }
    floodEngineState.hazardMap = null;
    floodEngineState.massBalance = null;
  };

  useEffect(() => {
    if (isPlaying && useAppStore.getState().elapsedSec === 0) resetBuffers();
  }, [isPlaying]);

  useEffect(() => { resetBuffers(); }, [pointSource?.lng, pointSource?.lat, mode]);

  // ─── Render helper ─────────────────────────────────────────────────────────
  const lastRenderRef = useRef(0);

  const renderNow = (force = false) => {
    const now = performance.now();
    if (!force && now - lastRenderRef.current < 80) return;
    lastRenderRef.current = now;

    const viewer = (window as any).__viewer;
    const Cesium = (window as any).Cesium;
    if (!viewer || !Cesium) return;

    const clearWater = () =>
      viewer.entities.values
        .filter((e: any) => e.name === "water" || e.name === "water-old")
        .forEach((e: any) => viewer.entities.remove(e));

    if (!grid) { clearWater(); setFloodResult(null); return; }

    const [w, s, e, n] = grid.bbox;

    const updateWaterEntity = () => {
      const waterEnt = viewer.entities.values.find((e: any) => e.name === "water");
      if (!waterEnt) {
        viewer.entities.add({
          name: "water",
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(w, s, e, n),
            material: new Cesium.ImageMaterialProperty({
              image: new Cesium.CallbackProperty(() => latestCanvasRef.current, false),
              transparent: true
            }),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        });
      }
    };

    // Static level override
    if (waterLevelOverride != null) {
      const H = waterLevelOverride;
      const stats = computeFloodStats(grid, H);
      setFloodResult(stats);
      if (stats.floodedCells === 0) { clearWater(); return; }
      const od = new Float32Array(grid.data.length);
      for (let i = 0; i < od.length; i++) od[i] = Math.max(0, H - grid.data[i]);
      const emptyVels = createVelocityField(od.length);
      const cnv = buildAdvancedCanvas(grid, od, emptyVels, null, waterOpacity, false);
      latestCanvasRef.current = cnv;
      updateWaterEntity();
      return;
    }

    const depths = depthsRef.current;
    const vels   = velocitiesRef.current;
    if (!depths || !vels) { clearWater(); return; }

    let hasWater = false;
    for (let i = 0; i < depths.length; i++) if (depths[i] >= 0.01) { hasWater = true; break; }
    if (!hasWater) { clearWater(); setFloodResult(null); return; }

    // Compute hazard map
    const hz = assessHazardZones(depths, vels);
    floodEngineState.hazardMap = hz;

    const cnv = buildAdvancedCanvas(
      grid, depths, vels, hz, waterOpacity, floodEngineState.showHazards,
    );
    latestCanvasRef.current = cnv;
    updateWaterEntity();

    const stats = computeAdvancedStats(grid, depths, vels);
    setFloodResult({
      level: stats.level,
      floodedCells: stats.floodedCells,
      floodedArea: stats.floodedArea,
      maxDepth: stats.maxDepth,
      meanDepth: stats.meanDepth,
    });
  };

  // ─── Play loop ─────────────────────────────────────────────────────────────
  const rafRef    = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || !grid || !depthsRef.current) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null; lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      const prev   = lastTsRef.current ?? ts;
      const dtWall = Math.min(0.1, (ts - prev) / 1000);
      lastTsRef.current = ts;

      const state  = useAppStore.getState();
      const depths = depthsRef.current!;
      const vels   = velocitiesRef.current!;
      const infil  = infiltrationRef.current!;
      const nMap   = manningNRef.current!;
      const tracker = trackerRef.current!;
      const balance = balanceRef.current!;
      const cellArea = grid.cellWidthM * grid.cellHeightM;
      // As requested: the exact specified duration is for the pouring/raining phase.
      // An additional fixed 5 seconds is given for the draining phase.
      const rainDur = Math.max(1, state.simDurationSec);
      const drainDur = 5;
      const animDur = rainDur + drainDur;
      
      const rainPhaseActive = wallElapsedRef.current < rainDur;

      // Advance timer exactly up to animDur
      wallElapsedRef.current = Math.min(animDur, wallElapsedRef.current + dtWall * state.simSpeed);
      
      // Calculate dynamic physical speed to ensure water drains completely within the requested duration.
      // Max distance water needs to travel is roughly the diagonal of the grid.
      const maxDistanceM = Math.max(grid.nCols * grid.cellWidthM, grid.nRows * grid.cellHeightM);
      // Assuming a conservative average water speed of 2 m/s, physical time required to cross terrain:
      const T_phys = maxDistanceM / 2;
      // The physical multiplier is the required physical time divided by the wall-clock animation duration.
      const dynamicPhysMult = Math.max(PHYS_MULT, T_phys / animDur);
      const EFFECTIVE_PHYS_MULT = dynamicPhysMult * (rainPhaseActive ? 1.0 : 1.5);

      const wallFrac = Math.min(1, wallElapsedRef.current / rainDur);

      // ── Add water based on wall-clock fraction (each frame) ──
      if (state.mode === "rainfall" && rainPhaseActive) {
        const ridgeCells = rainSourceCellsRef.current;
        const targetM = (state.targetRainfallMm / 1000) * state.runoffCoeff;
        const addMPerFrame = targetM * (dtWall * state.simSpeed / rainDur);

        if (addMPerFrame > 0 && ridgeCells && ridgeCells.length > 0) {
          const totalValidCells = grid.data.filter(v => v === v).length;
          const scaleUp = totalValidCells / ridgeCells.length;
          const addMScaled = addMPerFrame * scaleUp;

          for (let k = 0; k < ridgeCells.length; k++) {
            depths[ridgeCells[k]] += addMScaled;
          }
          balance.recordRainfall(addMPerFrame, totalValidCells);
        }
        const cumMm = wallFrac * state.targetRainfallMm;
        useAppStore.setState({ elapsedSec: wallElapsedRef.current, currentRainfallMm: Math.min(state.targetRainfallMm, cumMm) });
      } else if (state.mode === "rainfall" && !rainPhaseActive) {
        useAppStore.setState({ elapsedSec: wallElapsedRef.current });
      } else if (state.mode === "point" && state.pointSource) {
        if (rainPhaseActive) {
          const srcIdx = lngLatToCellIndex(grid, state.pointSource.lng, state.pointSource.lat);
          if (srcIdx >= 0) {
            const totalM3 = state.targetPointVolumeM3;
            // Point source: pour everything in the first 70% of time
            const addVolPerFrame = totalM3 * (dtWall * state.simSpeed / rainDur);
            if (addVolPerFrame > 0) {
              depths[srcIdx] += addVolPerFrame / cellArea;
              balance.recordPointSource(addVolPerFrame);
            }
          }
          const cumVol = wallFrac * state.targetPointVolumeM3;
          useAppStore.setState({ elapsedSec: wallElapsedRef.current, currentPointVolumeM3: Math.min(state.targetPointVolumeM3, cumVol) });
        } else {
          // Drain phase for point source: water stopped pouring, just physics
          useAppStore.setState({ elapsedSec: wallElapsedRef.current });
        }
      } else if (state.mode === "point" && !state.pointSource) {
        setIsPlaying(false); return;
      }

      // ── Physics: run EFFECTIVE_PHYS_MULT × dtWall seconds of SWE per frame ──
      const physDtTotal = dtWall * state.simSpeed * EFFECTIVE_PHYS_MULT;
      const config = { ...DEFAULT_CONFIG };

      // CFL-safe substep
      const safeDt    = advancedCFLTimestep(grid, depths, physDtTotal / 6, tracker);
      const nSubsteps = Math.max(6, Math.ceil(physDtTotal / safeDt));
      const substepDt = physDtTotal / nSubsteps;

      for (let sub = 0; sub < nSubsteps; sub++) {
        advancedShallowWaterStep(grid, depths, nMap, config, infil, substepDt, vels, tracker);
      }

      // Mass balance update
      balance.recordInfiltration(infil);
      floodEngineState.massBalance = balance.compute(depths);

      renderNow();

      const stats = computeAdvancedStats(grid, depths, vels);
      useAppStore.getState().pushLevelSample({
        t: wallElapsedRef.current,
        level: stats.level,
        depth: stats.maxDepth,
      });

      // ── Stop condition ──
      if (wallElapsedRef.current >= animDur) { 
        setIsPlaying(false); 
        return; 
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null; lastTsRef.current = null;
    };
  }, [isPlaying, grid, setIsPlaying]);

  useEffect(() => {
    renderNow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, mode, waterLevelOverride, waterOpacity, pointSource]);

  void targetRainfallMm; void runoffCoeff; void targetPointVolumeM3;

  return null;
}

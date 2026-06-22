/**
 * ENHANCED FLOOD LAYER COMPONENT
 * Uses the improved shallow-water equation solver with Manning's equation
 */

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { lngLatToCellIndex } from "@/lib/flood";
import {
  enhancedShallowWaterStep,
  createVelocityField,
  calculateCFLTimestep,
  DEFAULT_FLOOD_CONFIG,
  type EnhancedFloodConfig,
  type VelocityField,
  computeEnhancedStats,
  depthToColorEnhanced,
  advancedMultiBasinFlood,
} from "@/lib/improved-flood-simulation";

export function EnhancedFloodLayer() {
  const grid = useAppStore((s) => s.grid);
  const mode = useAppStore((s) => s.mode);

  const targetRainfallMm = useAppStore((s) => s.targetRainfallMm);
  const runoffCoeff = useAppStore((s) => s.runoffCoeff);
  const waterLevelOverride = useAppStore((s) => s.waterLevelOverride);
  const waterOpacity = useAppStore((s) => s.waterOpacity);

  const pointSource = useAppStore((s) => s.pointSource);
  const targetPointVolumeM3 = useAppStore((s) => s.targetPointVolumeM3);

  const isPlaying = useAppStore((s) => s.isPlaying);
  const setIsPlaying = useAppStore((s) => s.setIsPlaying);
  const setFloodResult = useAppStore((s) => s.setFloodResult);

  // Simulation state
  const depthsRef = useRef<Float32Array | null>(null);
  const velocitiesRef = useRef<VelocityField | null>(null);
  const infiltrationRef = useRef<Float32Array | null>(null);
  const gridIdRef = useRef<unknown>(null);

  // Configuration for Manning's equation and infiltration
  const configRef = useRef<EnhancedFloodConfig>(DEFAULT_FLOOD_CONFIG);

  // Reinitialize when grid changes
  if (grid && gridIdRef.current !== grid) {
    gridIdRef.current = grid;
    depthsRef.current = new Float32Array(grid.data.length);
    velocitiesRef.current = createVelocityField(grid);
    infiltrationRef.current = new Float32Array(grid.data.length);
  } else if (!grid) {
    depthsRef.current = null;
    velocitiesRef.current = null;
    infiltrationRef.current = null;
    gridIdRef.current = null;
  }

  // Reset simulation when playing from start
  useEffect(() => {
    if (isPlaying && useAppStore.getState().elapsedSec === 0) {
      depthsRef.current?.fill(0);
      infiltrationRef.current?.fill(0);
      if (velocitiesRef.current) {
        velocitiesRef.current.u.fill(0);
        velocitiesRef.current.v.fill(0);
        velocitiesRef.current.magnitude.fill(0);
      }
    }
  }, [isPlaying]);

  // Reset when point source changes
  useEffect(() => {
    depthsRef.current?.fill(0);
    infiltrationRef.current?.fill(0);
    if (velocitiesRef.current) {
      velocitiesRef.current.u.fill(0);
      velocitiesRef.current.v.fill(0);
      velocitiesRef.current.magnitude.fill(0);
    }
  }, [pointSource?.lng, pointSource?.lat, mode]);

  // Render helper
  const lastRenderRef = useRef(0);
  const renderNow = (force = false) => {
    const now = performance.now();
    if (!force && now - lastRenderRef.current < 90) return;
    lastRenderRef.current = now;

    const viewer = (window as any).__viewer;
    const Cesium = (window as any).Cesium;
    if (!viewer || !Cesium || !grid) return;

    const depths = depthsRef.current;
    const velocities = velocitiesRef.current;
    if (!depths || !velocities) return;

    const [w, s, e, n] = grid.bbox;

    // Build canvas from depths with velocity visualization
    const cnv = document.createElement("canvas");
    cnv.width = grid.nCols;
    cnv.height = grid.nRows;
    const ctx = cnv.getContext("2d")!;
    const img = ctx.createImageData(grid.nCols, grid.nRows);

    let hasWater = false;
    for (let r = 0; r < grid.nRows; r++) {
      const outRow = grid.nRows - 1 - r;
      for (let c = 0; c < grid.nCols; c++) {
        const idx = r * grid.nCols + c;
        const d = depths[idx];
        const pi = (outRow * grid.nCols + c) * 4;

        if (d <= 0) {
          img.data[pi + 3] = 0;
          continue;
        }

        hasWater = true;
        const mag = velocities.magnitude[idx];
        const [R, G, B, A] = depthToColorEnhanced(d, mag, waterOpacity);
        img.data[pi] = R;
        img.data[pi + 1] = G;
        img.data[pi + 2] = B;
        img.data[pi + 3] = A;
      }
    }

    // Update or clear water layer
    viewer.entities.values
      .filter((e: any) => e.name === "water" || e.name === "water-old")
      .forEach((e: any) => viewer.entities.remove(e));

    if (hasWater) {
      ctx.putImageData(img, 0, 0);
      viewer.entities.add({
        name: "water",
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(w, s, e, n),
          material: new Cesium.ImageMaterialProperty({ image: cnv, transparent: true }),
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      });

      // Update statistics
      if (velocities) {
        const stats = computeEnhancedStats(
          grid,
          depths,
          velocities,
          infiltrationRef.current || new Float32Array(grid.data.length),
        );
        setFloodResult({
          level: stats.level,
          floodedCells: stats.floodedCells,
          floodedArea: stats.floodedArea,
          maxDepth: stats.maxDepth,
          meanDepth: stats.meanDepth,
        });
      }
    } else {
      setFloodResult(null);
    }
  };

  // Main simulation loop
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || !grid || !depthsRef.current || !velocitiesRef.current) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = (ts: number) => {
      const prev = lastTsRef.current ?? ts;
      const dtWall = Math.min(0.1, (ts - prev) / 1000);
      lastTsRef.current = ts;

      const state = useAppStore.getState();
      const simDtTotal = dtWall * state.simSpeed;
      const depths = depthsRef.current!;
      const velocities = velocitiesRef.current!;
      const infiltration = infiltrationRef.current!;
      const cellArea = grid.cellWidthM * grid.cellHeightM;
      const dur = Math.max(0.001, state.simDurationSec);

      // Adaptive sub-stepping
      const maxChunk = 0.1;
      const nChunks = Math.max(1, Math.ceil(simDtTotal / maxChunk));
      const chunkDt = simDtTotal / nChunks;
      let elapsedNow = state.elapsedSec;

      const rainRateM = (state.targetRainfallMm / 1000) / dur;
      const flowRateM3 = state.targetPointVolumeM3 / dur;
      const srcIdx =
        state.mode === "point" && state.pointSource
          ? lngLatToCellIndex(grid, state.pointSource.lng, state.pointSource.lat)
          : -1;

      if (state.mode === "point" && !state.pointSource) {
        setIsPlaying(false);
        return;
      }

      for (let k = 0; k < nChunks; k++) {
        const before = elapsedNow;
        elapsedNow = before + chunkDt;
        const activeDt = Math.max(0, Math.min(elapsedNow, dur) - Math.min(before, dur));

        // Add water (rainfall or point source)
        if (activeDt > 0) {
          if (state.mode === "rainfall") {
            const addM = rainRateM * state.runoffCoeff * activeDt;
            if (addM > 0) {
              for (let i = 0; i < depths.length; i++) {
                if (grid.data[i] === grid.data[i]) {
                  depths[i] += addM;
                }
              }
            }
          } else if (state.mode === "point" && srcIdx >= 0) {
            const addVol = flowRateM3 * activeDt;
            if (addVol > 0) {
              depths[srcIdx] += addVol / cellArea;
            }
          }
        }

        // Physics sub-steps with adaptive timestep
        const config = {
          ...DEFAULT_FLOOD_CONFIG,
          manningN: 0.03, // Grass-like roughness
          infiltrationRate: 0.00001,
          subIterations: configRef.current.subIterations,
        };

        // CFL-stable timestep
        const safedt = calculateCFLTimestep(grid, depths, chunkDt / 4, 9.81);
        const nSubsteps = Math.ceil((chunkDt / safedt) * 1.1);

        for (let sub = 0; sub < nSubsteps; sub++) {
          const substepDt = chunkDt / nSubsteps;
          enhancedShallowWaterStep(grid, depths, config, infiltration, substepDt, velocities);
        }
      }

      // Update progress
      if (state.mode === "rainfall") {
        const cumMm = Math.min(
          state.targetRainfallMm,
          (Math.min(elapsedNow, dur) / dur) * state.targetRainfallMm,
        );
        useAppStore.setState({ elapsedSec: elapsedNow, currentRainfallMm: cumMm });
      } else {
        const cumVol = Math.min(
          state.targetPointVolumeM3,
          (Math.min(elapsedNow, dur) / dur) * state.targetPointVolumeM3,
        );
        useAppStore.setState({ elapsedSec: elapsedNow, currentPointVolumeM3: cumVol });
      }

      // Render
      renderNow();

      if (elapsedNow >= dur) {
        setIsPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [isPlaying, grid, setIsPlaying]);

  // One-shot render
  useEffect(() => {
    renderNow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, mode, waterLevelOverride, waterOpacity, pointSource]);

  return null;
}

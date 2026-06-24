/// <reference types="geojson" />
import * as turf from "@turf/turf";
import { type ElevationGrid } from "@/store/app-store";

export async function sampleElevationGrid(
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  resolution: number,
  onProgress: (p: number) => void,
): Promise<ElevationGrid> {
  const Cesium = window.Cesium;
  if (!Cesium) throw new Error("Cesium not loaded");

  const [west, south, east, north] = turf.bbox(geojson) as [number, number, number, number];

  // Approx meters per cell using haversine at the bbox center.
  const midLat = (south + north) / 2;
  const widthM = turf.distance([west, midLat], [east, midLat], { units: "meters" });
  const heightM = turf.distance([west, south], [west, north], { units: "meters" });
  const cellWidthM = widthM / resolution;
  const cellHeightM = heightM / resolution;

  const nRows = resolution;
  const nCols = resolution;
  const positions: any[] = [];
  const cellLngLat: [number, number][] = [];
  for (let r = 0; r < nRows; r++) {
    const lat = south + ((r + 0.5) / nRows) * (north - south);
    for (let c = 0; c < nCols; c++) {
      const lng = west + ((c + 0.5) / nCols) * (east - west);
      cellLngLat.push([lng, lat]);
      positions.push(Cesium.Cartographic.fromDegrees(lng, lat));
    }
  }

  // Batch terrain sampling to keep things responsive.
  const terrainProvider = (window as any).__viewer?.terrainProvider;
  if (!terrainProvider) throw new Error("Terrain provider not ready (set Cesium ion token)");

  const batchSize = 2000;
  for (let i = 0; i < positions.length; i += batchSize) {
    const slice = positions.slice(i, i + batchSize);
    await Cesium.sampleTerrainMostDetailed(terrainProvider, slice);
    onProgress(Math.min(1, (i + slice.length) / positions.length));
  }

  // Build data, mask cells outside polygon.
  const data = new Float32Array(nRows * nCols);
  let min = Infinity;
  let max = -Infinity;
  let validCount = 0;
  for (let i = 0; i < positions.length; i++) {
    const [lng, lat] = cellLngLat[i];
    const inside = turf.booleanPointInPolygon(turf.point([lng, lat]), geojson as any);
    if (!inside) {
      data[i] = NaN;
      continue;
    }
    const h = positions[i].height ?? 0;
    data[i] = h;
    validCount++;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  if (!isFinite(min)) {
    min = 0;
    max = 0;
  }

  return {
    data,
    baseData: new Float32Array(data),
    nRows,
    nCols,
    bbox: [west, south, east, north],
    cellWidthM,
    cellHeightM,
    minElevation: min,
    maxElevation: max,
    validArea: validCount * cellWidthM * cellHeightM,
  };
}

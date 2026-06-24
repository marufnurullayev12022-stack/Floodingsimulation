import * as turf from "@turf/turf";
import { type ElevationGrid, type Custom3DObject } from "@/store/app-store";

/**
 * Bu funksiya berilgan grid (DEM) ustiga foydalanuvchi chizgan
 * bino va devorlarning balandligini qo'shib chiqadi (rasterize qiladi).
 * Shunday qilib simulyatsiya jarayonida suv to'siqlardan o'tolmay qoladi.
 */
export function rasterizeCustomObjects(grid: ElevationGrid, objects: Custom3DObject[]) {
  // Avval gridni toza (binolarsiz) holatiga qaytaramiz
  grid.data.set(grid.baseData);

  if (!objects || objects.length === 0) return;

  const [west, south, east, north] = grid.bbox;
  const nRows = grid.nRows;
  const nCols = grid.nCols;

  // Turf geometriyalarini oldindan tayyorlab olamiz (tezkor ishlash uchun)
  const processed = objects.map(obj => {
    if (obj.type === "polygon" || obj.type === "box") {
      if (obj.positions && obj.positions.length >= 3) {
        const coords = obj.positions.map(p => [p.lng, p.lat]);
        // Poligon yopiq bo'lishi kerak
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push([...first]);
        }
        try {
          const poly = turf.polygon([coords]);
          return { obj, poly, bbox: turf.bbox(poly) };
        } catch (e) { return null; }
      }
    } else if (obj.type === "line") {
      if (obj.positions && obj.positions.length >= 2) {
        const coords = obj.positions.map(p => [p.lng, p.lat]);
        try {
          const line = turf.lineString(coords);
          const b = turf.bbox(line);
          // 0.005 gradus bu tahminan 500 metr, bbox uchun yetarli margin
          const buffer = 0.005; 
          return { obj, line, bbox: [b[0] - buffer, b[1] - buffer, b[2] + buffer, b[3] + buffer] };
        } catch (e) { return null; }
      }
    }
    return null;
  }).filter(Boolean);

  if (processed.length === 0) return;

  // Har bir pikselni aylanib chiqib, qaysi binoning ichidaligini tekshiramiz
  for (let r = 0; r < nRows; r++) {
    const lat = south + ((r + 0.5) / nRows) * (north - south);
    for (let c = 0; c < nCols; c++) {
      const lng = west + ((c + 0.5) / nCols) * (east - west);
      const idx = r * nCols + c;
      const h = grid.data[idx];
      
      if (Number.isNaN(h)) continue; // Obyekt tashqarisidagi maskalangan piksellar

      let maxAddedHeight = 0;

      for (const p of processed) {
        if (!p) continue;
        // 1. Bounding box (atrof) bo'yicha tezkor tekshirish
        if (lng < p.bbox[0] || lng > p.bbox[2] || lat < p.bbox[1] || lat > p.bbox[3]) {
          continue;
        }

        const pt = turf.point([lng, lat]);
        // 2. Aniq geometriya tekshiruvi
        if (p.poly) {
          if (turf.booleanPointInPolygon(pt, p.poly)) {
            maxAddedHeight = Math.max(maxAddedHeight, p.obj.height);
          }
        } else if (p.line) {
          const distMeters = turf.pointToLineDistance(pt, p.line, { units: 'meters' });
          const radiusMeters = (p.obj.wallWidth || 1) / 2;
          if (distMeters <= radiusMeters) {
            maxAddedHeight = Math.max(maxAddedHeight, p.obj.height);
          }
        }
      }

      // Agar piksel bino yoki devor ostida bo'lsa, uning balandligini oshiramiz
      if (maxAddedHeight > 0) {
        grid.data[idx] = h + maxAddedHeight;
        if (grid.data[idx] > grid.maxElevation) {
          grid.maxElevation = grid.data[idx];
        }
      }
    }
  }
}

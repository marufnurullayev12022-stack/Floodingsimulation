import type { ElevationGrid } from "@/store/app-store";

/**
 * Depth → RGBA color ramp. depth=0 is transparent. The ramp deliberately
 * starts at a saturated medium-deep blue (NOT pale cyan) so even 1 cm of
 * water reads as "water", and shallow pixels flashing on/off during the
 * time-stepped simulation never produce the pale/white flicker that was
 * visible before.
 */
export function depthColor(
  depth: number,
  opacity = 0.6,
  flowing = false,
): [number, number, number, number] {
  if (depth <= 0) return [0, 0, 0, 0];
  const t = Math.min(1, depth / 5); // saturate ramp at 5 m
  // Pooled water: medium blue → deep navy. No cyan/white component.
  // #1e6fc7 → #07194d
  let r = Math.round(0x1e * (1 - t) + 0x07 * t);
  let g = Math.round(0x6f * (1 - t) + 0x19 * t);
  let b = Math.round(0xc7 * (1 - t) + 0x4d * t);
  if (flowing) {
    // Flowing water is rendered slightly lighter and brighter so streams
    // running downhill stand out against the pooled (darker) water.
    r = Math.min(255, r + 50);
    g = Math.min(255, g + 70);
    b = Math.min(255, b + 40);
  }
  return [r, g, b, Math.round(opacity * 255)];
}

/** Σ (H - elev) * cellArea over in-polygon cells with elev<H. */
function volumeAt(grid: ElevationGrid, H: number): number {
  const cellArea = grid.cellWidthM * grid.cellHeightM;
  let v = 0;
  const d = grid.data;
  for (let i = 0; i < d.length; i++) {
    const e = d[i];
    if (e === e && e < H) v += (H - e) * cellArea;
  }
  return v;
}

/** Binary-search water level H so f(H) ≈ totalVolume (m³). */
export function solveWaterLevel(grid: ElevationGrid, totalVolume: number): number {
  if (totalVolume <= 0) return grid.minElevation;
  let lo = grid.minElevation;
  let hi = grid.maxElevation;
  if (volumeAt(grid, hi) <= totalVolume) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (volumeAt(grid, mid) < totalVolume) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface FloodStats {
  level: number;
  floodedCells: number;
  floodedArea: number;
  maxDepth: number;
  meanDepth: number;
}

export function computeFloodStats(grid: ElevationGrid, H: number, mask?: Uint8Array): FloodStats {
  const cellArea = grid.cellWidthM * grid.cellHeightM;
  let count = 0;
  let sum = 0;
  let max = 0;
  const d = grid.data;
  for (let i = 0; i < d.length; i++) {
    if (mask && !mask[i]) continue;
    const e = d[i];
    if (e === e && e < H) {
      const depth = H - e;
      count++;
      sum += depth;
      if (depth > max) max = depth;
    }
  }
  return {
    level: H,
    floodedCells: count,
    floodedArea: count * cellArea,
    maxDepth: max,
    meanDepth: count ? sum / count : 0,
  };
}

/** Convert lng/lat to grid cell index. Returns -1 if outside or NaN. */
export function lngLatToCellIndex(grid: ElevationGrid, lng: number, lat: number): number {
  const [w, s, e, n] = grid.bbox;
  if (lng < w || lng > e || lat < s || lat > n) return -1;
  const c = Math.min(grid.nCols - 1, Math.max(0, Math.floor(((lng - w) / (e - w)) * grid.nCols)));
  const r = Math.min(grid.nRows - 1, Math.max(0, Math.floor(((lat - s) / (n - s)) * grid.nRows)));
  const idx = r * grid.nCols + c;
  if (!(grid.data[idx] === grid.data[idx])) {
    // try nearest valid neighbor in a small spiral
    for (let rad = 1; rad <= 10; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= grid.nRows || cc < 0 || cc >= grid.nCols) continue;
          const ii = rr * grid.nCols + cc;
          if (grid.data[ii] === grid.data[ii]) return ii;
        }
      }
    }
    return -1;
  }
  return idx;
}

// --- Minimal binary min-heap keyed by elevation ---
class MinHeap {
  // pairs of (elev, index)
  private h: number[] = [];
  size() { return this.h.length / 2; }
  push(elev: number, idx: number) {
    this.h.push(elev, idx);
    this.bubbleUp(this.size() - 1);
  }
  pop(): [number, number] | null {
    const n = this.size();
    if (n === 0) return null;
    const top: [number, number] = [this.h[0], this.h[1]];
    if (n === 1) { this.h.length = 0; return top; }
    this.h[0] = this.h[(n - 1) * 2];
    this.h[1] = this.h[(n - 1) * 2 + 1];
    this.h.length -= 2;
    this.sinkDown(0);
    return top;
  }
  private bubbleUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[i * 2] < this.h[p * 2]) {
        this.swap(i, p);
        i = p;
      } else break;
    }
  }
  private sinkDown(i: number) {
    const n = this.size();
    for (;;) {
      const l = i * 2 + 1, r = i * 2 + 2;
      let s = i;
      if (l < n && this.h[l * 2] < this.h[s * 2]) s = l;
      if (r < n && this.h[r * 2] < this.h[s * 2]) s = r;
      if (s === i) break;
      this.swap(i, s);
      i = s;
    }
  }
  private swap(a: number, b: number) {
    const e1 = this.h[a * 2], i1 = this.h[a * 2 + 1];
    this.h[a * 2] = this.h[b * 2];
    this.h[a * 2 + 1] = this.h[b * 2 + 1];
    this.h[b * 2] = e1;
    this.h[b * 2 + 1] = i1;
  }
}

export interface PointFloodResult {
  level: number;
  mask: Uint8Array;     // 1 where cell is flooded by this point source
  floodedCells: number;
  floodedArea: number;
  maxDepth: number;
  meanDepth: number;
  filledVolume: number; // m³ actually contained
}

/**
 * Priority-flood from a source cell: pour `volume` m³ of water at source.
 * Water flows downhill, fills depressions, spreads until target volume is reached.
 *
 * Algorithm (per Barnes 2014 priority-flood + pour):
 *   - Start a min-heap with source cell.
 *   - Repeatedly pop the lowest-elevation cell; track running water level H = max popped elev.
 *   - Each step accumulates volume = Σ (H - elev_i) * cellArea over popped cells.
 *   - Push unvisited 4-neighbors into the heap.
 *   - Stop when accumulated volume >= target, then refine H by bisection on the
 *     "frontier" cells already popped.
 */
export function pointFlood(
  grid: ElevationGrid,
  sourceIdx: number,
  targetVolume: number,
): PointFloodResult {
  const { data, nRows, nCols, cellWidthM, cellHeightM } = grid;
  const cellArea = cellWidthM * cellHeightM;
  const visited = new Uint8Array(nRows * nCols);
  const popped: number[] = []; // indices in order
  const heap = new MinHeap();

  if (sourceIdx < 0 || !(data[sourceIdx] === data[sourceIdx])) {
    return {
      level: 0,
      mask: visited,
      floodedCells: 0,
      floodedArea: 0,
      maxDepth: 0,
      meanDepth: 0,
      filledVolume: 0,
    };
  }

  heap.push(data[sourceIdx], sourceIdx);
  visited[sourceIdx] = 1;

  let H = data[sourceIdx];
  let runningVolume = 0;
  const neighbors = [-1, 1, -nCols, nCols];

  while (heap.size() > 0) {
    const top = heap.pop()!;
    const [elev, idx] = top;
    if (elev > H) {
      // Raising water level from H to elev across already-popped cells
      const dH = elev - H;
      runningVolume += dH * popped.length * cellArea;
      H = elev;
    }
    if (runningVolume >= targetVolume) {
      // Refine: solve H so that Σ over popped of (H - elev_i) * cellArea = targetVolume,
      // bounded above by the elevation of the cell that pushed us over.
      const upperH = elev;
      // Volume just before adding this cell:
      let prevH = H; // current H equals elev now; back off
      // Need: target = Σ (H' - e_i) cellArea over popped (which already includes this idx via being pushed but not yet popped before raise).
      // Actually current `popped` does NOT yet include idx (we haven't pushed yet). Good.
      // Σ over popped (prevH+x - e_i) cellArea = runningVolume - (elev - (prevH)) * popped.length * cellArea + x*popped.length*cellArea
      // Simpler: rebuild — use bisection over [minPoppedElev, upperH] with popped set:
      let lo = data[popped[0]];
      for (const p of popped) if (data[p] < lo) lo = data[p];
      let hi = upperH;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        let v = 0;
        for (const p of popped) {
          const e = data[p];
          if (e < mid) v += (mid - e) * cellArea;
        }
        if (v < targetVolume) lo = mid;
        else hi = mid;
      }
      H = (lo + hi) / 2;
      break;
    }

    popped.push(idx);

    // Push 4-neighbors
    const r = Math.floor(idx / nCols);
    const c = idx - r * nCols;
    for (let k = 0; k < 4; k++) {
      const dr = k === 2 ? -1 : k === 3 ? 1 : 0;
      const dc = k === 0 ? -1 : k === 1 ? 1 : 0;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= nRows || cc < 0 || cc >= nCols) continue;
      const ni = rr * nCols + cc;
      if (visited[ni]) continue;
      const ne = data[ni];
      if (!(ne === ne)) continue; // NaN -> outside polygon
      visited[ni] = 1;
      heap.push(ne, ni);
    }
  }

  // Build mask of cells flooded (elev < H within popped set)
  const mask = new Uint8Array(nRows * nCols);
  let count = 0;
  let sum = 0;
  let maxDepth = 0;
  let filled = 0;
  for (const p of popped) {
    const e = data[p];
    if (e < H) {
      mask[p] = 1;
      const d = H - e;
      count++;
      sum += d;
      filled += d * cellArea;
      if (d > maxDepth) maxDepth = d;
    }
  }
  return {
    level: H,
    mask,
    floodedCells: count,
    floodedArea: count * cellArea,
    maxDepth,
    meanDepth: count ? sum / count : 0,
    filledVolume: filled,
  };
}

/** Build an N×N RGBA canvas: each pixel colored by depth (transparent if dry/outside or outside mask). */
export function buildDepthCanvas(
  grid: ElevationGrid,
  H: number,
  opacity = 0.6,
  mask?: Uint8Array,
): HTMLCanvasElement {
  const cnv = document.createElement("canvas");
  cnv.width = grid.nCols;
  cnv.height = grid.nRows;
  const ctx = cnv.getContext("2d")!;
  const img = ctx.createImageData(grid.nCols, grid.nRows);
  const d = grid.data;
  for (let r = 0; r < grid.nRows; r++) {
    const outRow = grid.nRows - 1 - r; // grid row 0 = south; canvas row 0 = north
    for (let c = 0; c < grid.nCols; c++) {
      const idx = r * grid.nCols + c;
      const e = d[idx];
      const pi = (outRow * grid.nCols + c) * 4;
      if (!(e === e) || e >= H || (mask && !mask[idx])) {
        img.data[pi + 3] = 0;
        continue;
      }
      const [R, G, B, A] = depthColor(H - e, opacity);
      img.data[pi] = R;
      img.data[pi + 1] = G;
      img.data[pi + 2] = B;
      img.data[pi + 3] = A;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

// ============================================================================
// Multi-basin rainfall: water pools in EVERY local depression independently,
// matching how real rainfall accumulates across a relief — not just one pond.
// ============================================================================

interface BasinTopology {
  spill: Float32Array;        // per-cell spill (outlet) elevation
  terminal: Int32Array;       // per-cell terminal pit idx, or -2 = leaks to boundary
  pitBasin: Map<number, number[]>;     // pit idx -> depression cells (CC of elev<spill)
  pitCatchment: Map<number, number[]>; // pit idx -> upstream cells draining to it
}

const topoCache = new WeakMap<ElevationGrid, BasinTopology>();

function computeTopology(grid: ElevationGrid): BasinTopology {
  const cached = topoCache.get(grid);
  if (cached) return cached;

  const { data, nRows, nCols } = grid;
  const N = nRows * nCols;
  const isValid = (i: number) => i >= 0 && i < N && data[i] === data[i];

  // --- D8 steepest descent on unfilled DEM ---
  const flowTo = new Int32Array(N);
  flowTo.fill(-1); // -1 = pit (no lower neighbor), -2 = leaks to boundary/NaN
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      const i = r * nCols + c;
      if (!isValid(i)) continue;
      let bestE = data[i];
      let bestNi = -1;
      let leaks = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= nRows || cc < 0 || cc >= nCols) {
            leaks = true;
            continue;
          }
          const ni = rr * nCols + cc;
          if (!isValid(ni)) {
            leaks = true;
            continue;
          }
          if (data[ni] < bestE) {
            bestE = data[ni];
            bestNi = ni;
          }
        }
      }
      flowTo[i] = bestNi >= 0 ? bestNi : leaks ? -2 : -1;
    }
  }

  // --- Resolve each cell's terminal sink (pit idx, or -2 for boundary leak) ---
  const terminal = new Int32Array(N);
  terminal.fill(-3);
  const path: number[] = [];
  for (let start = 0; start < N; start++) {
    if (!isValid(start) || terminal[start] !== -3) continue;
    path.length = 0;
    let cur = start;
    let resolved = -3;
    while (true) {
      if (!isValid(cur)) {
        resolved = -2;
        break;
      }
      if (terminal[cur] !== -3) {
        resolved = terminal[cur];
        break;
      }
      const next = flowTo[cur];
      if (next === -1) {
        terminal[cur] = cur;
        resolved = cur;
        break;
      }
      if (next === -2) {
        terminal[cur] = -2;
        resolved = -2;
        break;
      }
      path.push(cur);
      cur = next;
    }
    for (const p of path) terminal[p] = resolved;
  }

  // --- Priority-flood from boundary to get spill elevation per cell ---
  const spill = new Float32Array(N);
  const inHeap = new Uint8Array(N);
  const heap = new MinHeap();
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      const i = r * nCols + c;
      if (!isValid(i)) continue;
      let seed = r === 0 || r === nRows - 1 || c === 0 || c === nCols - 1;
      if (!seed) {
        const ns = [i - 1, i + 1, i - nCols, i + nCols];
        for (const ni of ns) {
          if (!isValid(ni)) {
            seed = true;
            break;
          }
        }
      }
      if (seed) {
        spill[i] = data[i];
        inHeap[i] = 1;
        heap.push(data[i], i);
      }
    }
  }
  while (heap.size() > 0) {
    const [, idx] = heap.pop()!;
    const r = Math.floor(idx / nCols);
    const c = idx - r * nCols;
    const ns = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [rr, cc] of ns) {
      if (rr < 0 || rr >= nRows || cc < 0 || cc >= nCols) continue;
      const ni = rr * nCols + cc;
      if (!isValid(ni) || inHeap[ni]) continue;
      inHeap[ni] = 1;
      spill[ni] = Math.max(spill[idx], data[ni]);
      heap.push(spill[ni], ni);
    }
  }

  // --- Group catchment cells by terminal pit ---
  const pitCatchment = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    if (!isValid(i)) continue;
    const t = terminal[i];
    if (t < 0) continue;
    let arr = pitCatchment.get(t);
    if (!arr) {
      arr = [];
      pitCatchment.set(t, arr);
    }
    arr.push(i);
  }

  // --- Expand each pit into its depression CC (cells where elev < spill) ---
  const pitBasin = new Map<number, number[]>();
  const visited = new Uint8Array(N);
  for (const pit of pitCatchment.keys()) {
    if (visited[pit]) continue;
    const cells: number[] = [];
    const stack = [pit];
    visited[pit] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      if (!(data[i] < spill[i])) continue;
      cells.push(i);
      const r = Math.floor(i / nCols);
      const c = i - r * nCols;
      const ns = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];
      for (const [rr, cc] of ns) {
        if (rr < 0 || rr >= nRows || cc < 0 || cc >= nCols) continue;
        const ni = rr * nCols + cc;
        if (visited[ni] || !isValid(ni)) continue;
        if (!(data[ni] < spill[ni])) continue;
        visited[ni] = 1;
        stack.push(ni);
      }
    }
    pitBasin.set(pit, cells);
  }

  const topo: BasinTopology = { spill, terminal, pitBasin, pitCatchment };
  topoCache.set(grid, topo);
  return topo;
}

export interface MultiBasinResult {
  depths: Float32Array;   // per-cell water depth (m)
  surfaceLevel: number;   // representative water surface elevation (max wet surface)
  floodedCells: number;
  floodedArea: number;
  maxDepth: number;
  meanDepth: number;
}

/**
 * Multi-basin rainfall flood: distribute rain across catchments and fill each
 * depression independently up to its spill elevation. Produces several local
 * ponds where the terrain has multiple low spots — not one merged pool.
 */
export function multiBasinFlood(
  grid: ElevationGrid,
  rainfallM: number,
  runoff: number,
): MultiBasinResult {
  const { data, nRows, nCols, cellWidthM, cellHeightM } = grid;
  const N = nRows * nCols;
  const area = cellWidthM * cellHeightM;
  const depths = new Float32Array(N);

  if (rainfallM <= 0 || runoff <= 0) {
    return {
      depths,
      surfaceLevel: grid.minElevation,
      floodedCells: 0,
      floodedArea: 0,
      maxDepth: 0,
      meanDepth: 0,
    };
  }

  const { spill, pitBasin, pitCatchment } = computeTopology(grid);

  for (const [pit, catchment] of pitCatchment) {
    const basin = pitBasin.get(pit);
    if (!basin || basin.length === 0) continue;
    // Volume of rain arriving at this depression = catchment-area × rainfall
    const volume = catchment.length * rainfallM * runoff * area;
    const targetDepthSum = volume / area; // Σ depths to achieve

    let totalCap = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of basin) {
      const e = data[c];
      const s = spill[c];
      totalCap += s - e;
      if (e < lo) lo = e;
      if (s > hi) hi = s;
    }

    if (targetDepthSum >= totalCap) {
      // Depression overflows — fill to spill, excess water leaves the basin.
      for (const c of basin) depths[c] = spill[c] - data[c];
      continue;
    }

    // Bisection on water level H within the basin.
    for (let it = 0; it < 36; it++) {
      const mid = (lo + hi) / 2;
      let v = 0;
      for (const c of basin) {
        const e = data[c];
        const s = spill[c];
        if (mid > e) v += Math.min(mid, s) - e;
      }
      if (v < targetDepthSum) lo = mid;
      else hi = mid;
    }
    const H = (lo + hi) / 2;
    for (const c of basin) {
      const e = data[c];
      const s = spill[c];
      if (H > e) depths[c] = Math.min(H, s) - e;
    }
  }

  let count = 0;
  let sum = 0;
  let maxD = 0;
  let surface = grid.minElevation;
  for (let i = 0; i < N; i++) {
    const d = depths[i];
    if (d > 0) {
      count++;
      sum += d;
      if (d > maxD) maxD = d;
      const s = data[i] + d;
      if (s > surface) surface = s;
    }
  }
  return {
    depths,
    surfaceLevel: surface,
    floodedCells: count,
    floodedArea: count * area,
    maxDepth: maxD,
    meanDepth: count ? sum / count : 0,
  };
}

/** Render a per-cell depth array (used by multi-basin rainfall). */
export function buildDepthCanvasFromDepths(
  grid: ElevationGrid,
  depths: Float32Array,
  opacity = 0.6,
  flow?: Float32Array,
): HTMLCanvasElement {
  const cnv = document.createElement("canvas");
  cnv.width = grid.nCols;
  cnv.height = grid.nRows;
  const ctx = cnv.getContext("2d")!;
  const img = ctx.createImageData(grid.nCols, grid.nRows);
  for (let r = 0; r < grid.nRows; r++) {
    const outRow = grid.nRows - 1 - r;
    for (let c = 0; c < grid.nCols; c++) {
      const idx = r * grid.nCols + c;
      const d = depths[idx];
      const pi = (outRow * grid.nCols + c) * 4;
      if (!d || d <= 0) {
        img.data[pi + 3] = 0;
        continue;
      }
      // A cell is "flowing" when its recent per-step inflow is a notable
      // fraction of its standing depth — i.e. water is actively moving
      // through it, not just sitting pooled.
      const f = flow ? flow[idx] : 0;
      const flowing = f > 0 && f / Math.max(d, 0.01) > 0.04;
      const [R, G, B, A] = depthColor(d, opacity, flowing);
      img.data[pi] = R;
      img.data[pi + 1] = G;
      img.data[pi + 2] = B;
      img.data[pi + 3] = A;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

// ============================================================================
// Time-stepped shallow-water cellular automaton.
// Each cell holds a water depth. On every step we route water from cells with
// higher water surface (elev + depth) to lower 4-neighbors, in proportion to
// the head difference. Cells outside the polygon act as drains (water exits).
// This reproduces the channelized, multi-pond pattern of real rainfall.
// ============================================================================

/**
 * One diffusion substep of the shallow-water CA.
 * @param alpha   per-step fraction of head difference to equalize (0..0.25)
 *                — keep ≤ 0.25 for stability with 4 neighbors.
 * @param leakage fraction applied to depth at boundary cells (water leaves
 *                the area of interest when it reaches the edge).
 */
export function shallowWaterStep(
  grid: ElevationGrid,
  depths: Float32Array,
  alpha = 0.2,
  leakage = 0.5,
  inflowOut?: Float32Array,
): void {
  const { data, nRows, nCols } = grid;
  const N = depths.length;
  const delta = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const d = depths[i];
    if (d <= 1e-6) continue;
    const e = data[i];
    if (!(e === e)) continue;
    const h = e + d;
    const r = (i / nCols) | 0;
    const c = i - r * nCols;

    const ns: [number, number][] = [
      [r > 0 ? i - nCols : -1, 0],
      [r < nRows - 1 ? i + nCols : -1, 0],
      [c > 0 ? i - 1 : -1, 0],
      [c < nCols - 1 ? i + 1 : -1, 0],
    ];

    let sumDiff = 0;
    let leakDiff = 0;
    for (let k = 0; k < 4; k++) {
      const ni = ns[k][0];
      if (ni < 0) {
        // grid edge — treat as drain at this cell's terrain elevation
        const dh = d * leakage;
        ns[k][1] = dh;
        leakDiff += dh;
        sumDiff += dh;
        continue;
      }
      const ne = data[ni];
      if (!(ne === ne)) {
        // outside polygon — drain
        const dh = d * leakage;
        ns[k][1] = dh;
        leakDiff += dh;
        sumDiff += dh;
        continue;
      }
      const nh = ne + depths[ni];
      const dh = h - nh;
      if (dh > 0) {
        ns[k][1] = dh;
        sumDiff += dh;
      }
    }
    if (sumDiff <= 0) continue;

    // CFL-like cap: never send more than half of this cell's water in one step.
    const totalOut = Math.min(d * 0.5, alpha * sumDiff);
    if (totalOut <= 0) continue;

    for (let k = 0; k < 4; k++) {
      const portion = ns[k][1];
      if (portion <= 0) continue;
      const give = totalOut * (portion / sumDiff);
      delta[i] -= give;
      const ni = ns[k][0];
      if (ni >= 0 && data[ni] === data[ni]) {
        delta[ni] += give;
        if (inflowOut) inflowOut[ni] += give;
      }
      // else: water leaves the AOI (boundary leak)
    }
    void leakDiff;
  }

  for (let i = 0; i < N; i++) {
    const v = depths[i] + delta[i];
    depths[i] = v > 0 ? v : 0;
  }
}

/** Convenience aggregate over a per-cell depth field. */
export function depthStats(grid: ElevationGrid, depths: Float32Array) {
  const area = grid.cellWidthM * grid.cellHeightM;
  let count = 0;
  let sum = 0;
  let maxD = 0;
  let surface = grid.minElevation;
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i];
    if (d > 1e-4) {
      count++;
      sum += d;
      if (d > maxD) maxD = d;
      const s = grid.data[i] + d;
      if (s > surface) surface = s;
    }
  }
  return {
    level: surface,
    floodedCells: count,
    floodedArea: count * area,
    maxDepth: maxD,
    meanDepth: count ? sum / count : 0,
  };
}

export {
  enhancedShallowWaterStep,
  createVelocityField,
  calculateCFLTimestep,
  DEFAULT_FLOOD_CONFIG,
  type EnhancedFloodConfig,
  type VelocityField,
  computeEnhancedStats,
  depthToColorEnhanced,
  advancedMultiBasinFlood,
} from './improved-flood-simulation';

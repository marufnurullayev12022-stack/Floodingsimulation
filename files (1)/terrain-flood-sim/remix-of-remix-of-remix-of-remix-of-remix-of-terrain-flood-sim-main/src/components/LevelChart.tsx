import { useAppStore } from "@/store/app-store";

/** Compact SVG sparkline showing water level over simulated time. */
export function LevelChart() {
  const history = useAppStore((s) => s.levelHistory);
  const elapsed = useAppStore((s) => s.elapsedSec);

  if (history.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-border bg-background/40 text-[11px] text-muted-foreground">
        Start the simulation to see the water-level curve
      </div>
    );
  }

  const W = 340;
  const H = 96;
  const padX = 28;
  const padY = 10;

  const ts = history.map((h) => h.t);
  const ls = history.map((h) => h.level);
  const ds = history.map((h) => h.depth);

  const tMin = ts[0];
  const tMax = Math.max(ts[ts.length - 1], tMin + 0.001);
  const lMin = Math.min(...ls);
  const lMax = Math.max(...ls, lMin + 0.001);
  const dMax = Math.max(...ds, 0.001);

  const xOf = (t: number) => padX + ((t - tMin) / (tMax - tMin)) * (W - padX - 6);
  const yOfLevel = (v: number) =>
    H - padY - ((v - lMin) / (lMax - lMin)) * (H - padY * 2);
  const yOfDepth = (v: number) => H - padY - (v / dMax) * (H - padY * 2);

  const levelPath = history.map((h, i) => `${i === 0 ? "M" : "L"}${xOf(h.t).toFixed(1)},${yOfLevel(h.level).toFixed(1)}`).join(" ");
  const depthPath = history.map((h, i) => `${i === 0 ? "M" : "L"}${xOf(h.t).toFixed(1)},${yOfDepth(h.depth).toFixed(1)}`).join(" ");

  const last = history[history.length - 1];

  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>t = {elapsed.toFixed(1)}s</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded bg-sky-400" /> level {last.level.toFixed(2)}m
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded bg-amber-400" /> depth {last.depth.toFixed(2)}m
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-24 w-full">
        <line x1={padX} y1={H - padY} x2={W - 6} y2={H - padY} stroke="hsl(var(--border))" strokeWidth={1} />
        <line x1={padX} y1={padY} x2={padX} y2={H - padY} stroke="hsl(var(--border))" strokeWidth={1} />
        <path d={depthPath} fill="none" stroke="rgb(251 191 36)" strokeWidth={1.5} opacity={0.9} />
        <path d={levelPath} fill="none" stroke="rgb(56 189 248)" strokeWidth={1.8} />
        <text x={4} y={padY + 4} fontSize={9} fill="rgb(148 163 184)">
          {lMax.toFixed(1)}
        </text>
        <text x={4} y={H - padY} fontSize={9} fill="rgb(148 163 184)">
          {lMin.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

import { useMemo } from "react";
import { useAppStore } from "@/store/app-store";

/** Full-viewport CSS-animated rain overlay, shown while rainfall sim is playing. */
export function RainOverlay() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const mode = useAppStore((s) => s.mode);
  const target = useAppStore((s) => s.targetRainfallMm);
  const speed = useAppStore((s) => s.simSpeed);
  const elapsedSec = useAppStore((s) => s.elapsedSec);
  const simDurationSec = useAppStore((s) => s.simDurationSec);

  // Rain phase is exactly the specified simDurationSec. After that, it's the 5s drain phase.
  const isRainingPhase = elapsedSec < simDurationSec;
  const active = isPlaying && mode === "rainfall" && isRainingPhase;

  // Intensity: more raindrops when target rainfall is larger
  const dropCount = useMemo(() => {
    // Kiritilgan yomg'ir hajmiga qarab tomchilar sonini keskin oshiramiz
    // 50mm -> 100 tomchi, 500mm -> 1000 tomchi (Maksimal 1200)
    return Math.min(1200, Math.max(40, Math.round(target * 2)));
  }, [target]);

  const drops = useMemo(() => {
    // Qancha ko'p yomg'ir bo'lsa, shuncha tez va uzun/qalin tomchilar tushadi
    const speedFactor = Math.min(4, Math.max(1, target / 100)); // 1x dan 4x gacha tezroq
    const sizeFactor = Math.min(2.5, Math.max(1, target / 150)); // 1x dan 2.5x gacha uzunroq

    return Array.from({ length: dropCount }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * -2,
      duration: (0.5 + Math.random() * 0.6) / speedFactor,
      height: (12 + Math.random() * 18) * sizeFactor,
      width: target > 200 ? 1.5 + Math.random() * 1.5 : 1.5,
      opacity: (0.25 + Math.random() * 0.45) * Math.min(1.5, Math.max(1, target / 100)),
      key: i,
    }));
  }, [dropCount, target]);

  if (!active) return null;

  // Jala yoqqanda (target > 300) yomg'ir qalinroq va yorqinroq ko'rinadi
  const isHeavyRain = target > 300;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      style={{ animationPlayState: "running" }}
    >
      <style>{`
        @keyframes rainfall-fall {
          0%   { transform: translate3d(0,-15vh,0); }
          100% { transform: translate3d(-6vw,115vh,0); }
        }
      `}</style>
      {drops.map((d) => (
        <span
          key={d.key}
          style={{
            position: "absolute",
            top: 0,
            left: `${d.left}%`,
            width: d.width,
            height: d.height,
            background: isHeavyRain
              ? "linear-gradient(to bottom, rgba(200,230,255,0) 0%, rgba(220,240,255,0.95) 100%)"
              : "linear-gradient(to bottom, rgba(180,220,255,0) 0%, rgba(200,230,255,0.9) 100%)",
            opacity: Math.min(1, d.opacity),
            animation: `rainfall-fall ${d.duration / Math.max(0.25, speed)}s linear ${d.delay}s infinite`,
            transform: "translate3d(0,-15vh,0)",
            filter: isHeavyRain ? "blur(0.5px)" : "blur(0.3px)",
          }}
        />
      ))}
    </div>
  );
}

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

type StatsInstance = {
  dom: HTMLElement;
  update: () => void;
};

export function ViewportStats() {
  const { gl } = useThree();
  const statsRef = useRef<StatsInstance | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const canvas = gl.domElement;
    const parent = canvas.parentElement;
    if (!parent) return;

    let cancelled = false;

    void import("stats-gl").then((mod) => {
      if (cancelled) return;

      const StatsGL = (mod as unknown as { default: new (opts: object) => StatsInstance }).default;

      const stats = new StatsGL({
        trackGPU: true,
        trackHz: false,
        trackCPT: false,
        minimal: false,
      });

      stats.dom.style.position = "absolute";
      stats.dom.style.top = "8px";
      stats.dom.style.left = "8px";
      stats.dom.style.zIndex = "50";
      stats.dom.style.scale = "0.82";
      stats.dom.style.transformOrigin = "top left";
      stats.dom.style.pointerEvents = "none";

      parent.style.position = "relative";
      parent.appendChild(stats.dom);
      statsRef.current = stats;
    });

    return () => {
      cancelled = true;
      if (statsRef.current) {
        statsRef.current.dom.remove();
        statsRef.current = null;
      }
      mountedRef.current = false;
    };
  }, [gl]);

  useFrame(() => {
    statsRef.current?.update();
  });

  return null;
}

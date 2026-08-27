/**
 * useRendererGlConfig
 *
 * Returns the `gl` prop value for the R3F <Canvas> component based on the
 * active renderer backend (WebGL or WebGPU).
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const glConfig = useRendererGlConfig();
 *   <Canvas gl={glConfig} ...>
 *
 * ─── Behavior ────────────────────────────────────────────────────────────────
 *
 * WebGL backend  → returns undefined (R3F creates a WebGLRenderer as usual).
 * WebGPU backend → returns a factory function that creates THREE.WebGPURenderer.
 *
 * If ENABLE_WEBGPU is false (default) this hook ALWAYS returns undefined.
 * The editor is completely unaffected.
 *
 * If the adapter returns undefined (capabilities unavailable or fallback),
 * the hook also returns undefined. R3F falls back to WebGL automatically.
 *
 * ─── Why a hook? ──────────────────────────────────────────────────────────────
 * The adapter result is synchronously available after bootstrapEngine() runs
 * (before React mounts). This hook is just a stable accessor that makes the
 * pattern clear and keeps ViewportCanvas clean.
 */

import { useMemo } from "react";
import { getRendererAdapter, getRendererCapabilities } from "@blud/renderer-backend";
import { getEngineFlags } from "@blud/engine-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GlConfig = any;

export function useRendererGlConfig(): GlConfig {
  return useMemo<GlConfig>(() => {
    const flags = getEngineFlags();
    if (!flags.ENABLE_WEBGPU) return undefined;

    let adapter;
    try {
      adapter = getRendererAdapter();
    } catch {
      return undefined;
    }

    const caps = getRendererCapabilities();
    if (!caps) return undefined;

    return adapter.getR3FGlConfig(caps);
  }, []);
}

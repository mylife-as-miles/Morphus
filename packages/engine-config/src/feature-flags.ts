/**
 * @blud/engine-config — Feature Flags
 *
 * All advanced features default to OFF. WebGL + Rapier remains the stable baseline.
 * Override via environment variables (Vite: import.meta.env) or runtime mutation
 * (e.g., from localStorage, URL params, or a remote config).
 *
 * NEVER change defaults here without a sign-off — this file is the safety net.
 */

export interface EngineFeatureFlags {
  // ─── Renderer ────────────────────────────────────────────────────────────
  /** Enable experimental WebGPU renderer path. Falls back to WebGL if unsupported. */
  ENABLE_WEBGPU: boolean;
  /** Phase 2: WebGPU material pipeline, advanced shaders, improved fog/env. */
  WEBGPU_PHASE2_MATERIALS: boolean;
  /** Phase 3: GPU-accelerated picking (ID buffer / compute), culling helpers. */
  WEBGPU_PHASE3_PICKING: boolean;
  /** Phase 4: Particle systems, visual simulation, compute-driven effects. */
  WEBGPU_PHASE4_SIMULATION: boolean;

  // ─── Physics ─────────────────────────────────────────────────────────────
  /** Enable Jolt as an optional runtime physics backend (NOT the editor default). */
  ENABLE_JOLT_BACKEND: boolean;
  /** Jolt sandbox/benchmark mode for comparing engines. Does NOT share a live world with Rapier. */
  ENABLE_JOLT_SANDBOX_MODE: boolean;
  /** Experimental advanced simulation viewport (particles, fluids, debris — visual only). */
  ENABLE_ADVANCED_SIMULATION_VIEWPORT: boolean;
}

/**
 * Conservative production defaults. All non-baseline features are off.
 */
export const DEFAULT_ENGINE_FLAGS: Readonly<EngineFeatureFlags> = Object.freeze({
  ENABLE_WEBGPU: false,
  WEBGPU_PHASE2_MATERIALS: false,
  WEBGPU_PHASE3_PICKING: false,
  WEBGPU_PHASE4_SIMULATION: false,

  ENABLE_JOLT_BACKEND: false,
  ENABLE_JOLT_SANDBOX_MODE: false,
  ENABLE_ADVANCED_SIMULATION_VIEWPORT: false,
});

/**
 * Reads flag overrides from Vite environment variables at build time.
 * Unrecognized values are silently ignored — the default wins.
 */
function readViteEnvFlags(): Partial<EngineFeatureFlags> {
  const env =
    typeof import.meta !== "undefined" && (import.meta as unknown as Record<string, unknown>).env
      ? (import.meta as { env: Record<string, string> }).env
      : {};

  const bool = (key: string) => {
    const v = env[key];
    if (v === "true") return true;
    if (v === "false") return false;
    return undefined;
  };

  return Object.fromEntries(
    Object.entries({
      ENABLE_WEBGPU: bool("VITE_ENABLE_WEBGPU"),
      WEBGPU_PHASE2_MATERIALS: bool("VITE_WEBGPU_PHASE2_MATERIALS"),
      WEBGPU_PHASE3_PICKING: bool("VITE_WEBGPU_PHASE3_PICKING"),
      WEBGPU_PHASE4_SIMULATION: bool("VITE_WEBGPU_PHASE4_SIMULATION"),
      ENABLE_JOLT_BACKEND: bool("VITE_ENABLE_JOLT_BACKEND"),
      ENABLE_JOLT_SANDBOX_MODE: bool("VITE_ENABLE_JOLT_SANDBOX_MODE"),
      ENABLE_ADVANCED_SIMULATION_VIEWPORT: bool("VITE_ENABLE_ADVANCED_SIMULATION_VIEWPORT"),
    }).filter(([, v]) => v !== undefined)
  ) as Partial<EngineFeatureFlags>;
}

let _flags: EngineFeatureFlags = {
  ...DEFAULT_ENGINE_FLAGS,
  ...readViteEnvFlags(),
};

/** Read the current active feature flags. */
export function getEngineFlags(): Readonly<EngineFeatureFlags> {
  return _flags;
}

/**
 * Override one or more flags at runtime (e.g., from localStorage, DevTools, or URL params).
 * Call this ONCE during app bootstrap, before any renderer or physics init.
 */
export function setEngineFlags(overrides: Partial<EngineFeatureFlags>): void {
  _flags = { ..._flags, ...overrides };
}

/** Convenience: check a single flag. */
export function flag(key: keyof EngineFeatureFlags): boolean {
  return _flags[key];
}

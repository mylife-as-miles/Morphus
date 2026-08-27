/**
 * Engine Bootstrap — called once in main.tsx before React mounts.
 *
 * 1. Reads feature flag overrides from localStorage / URL params (dev only).
 * 2. Runs WebGPU capability detection.
 * 3. Sets up the renderer backend ready for ViewportCanvas to consume.
 *
 * This file is the ONLY place where feature flags are mutated at runtime.
 * All other code calls getEngineFlags() read-only.
 *
 * ─── Non-Breaking Contract ───────────────────────────────────────────────────
 * If this bootstrap fails for any reason, the editor falls back to WebGL +
 * Rapier silently. No UI is blocked.
 */

import { setEngineFlags, getEngineFlags, type EngineFeatureFlags } from "@blud/engine-config";
import { initRendererBackend } from "@blud/renderer-backend";

/** Call once at app startup, before rendering the React tree. */
export async function bootstrapEngine(): Promise<void> {
  applyDevOverrides();
  await safeInitRenderer();
}

// ─── Dev overrides from URL params and localStorage ───────────────────────────

function applyDevOverrides(): void {
  if (typeof window === "undefined") return;

  const overrides: Partial<EngineFeatureFlags> = {};
  type EngineFlagKey = Extract<keyof EngineFeatureFlags, string>;

  // URL param override: ?flag_ENABLE_WEBGPU=true
  const params = new URLSearchParams(window.location.search);
  const keys: EngineFlagKey[] = [
    "ENABLE_WEBGPU",
    "WEBGPU_PHASE2_MATERIALS",
    "WEBGPU_PHASE3_PICKING",
    "WEBGPU_PHASE4_SIMULATION",
    "ENABLE_JOLT_BACKEND",
    "ENABLE_JOLT_SANDBOX_MODE",
    "ENABLE_ADVANCED_SIMULATION_VIEWPORT",
  ];

  for (const key of keys) {
    const urlVal = params.get(`flag_${key}`);
    if (urlVal === "true") overrides[key] = true;
    if (urlVal === "false") overrides[key] = false;

    // localStorage override (persisted across reloads — useful for QA)
    const lsVal = window.localStorage.getItem(`blud_flag_${key}`);
    if (lsVal === "true") overrides[key] = true;
    if (lsVal === "false") overrides[key] = false;
  }

  if (Object.keys(overrides).length > 0) {
    setEngineFlags(overrides);
    console.info("[EngineBootstrap] Feature flag overrides applied:", overrides);
  }

  const flags = getEngineFlags();
  console.info("[EngineBootstrap] Active flags:", flags);
}

// ─── Renderer init ─────────────────────────────────────────────────────────────

async function safeInitRenderer(): Promise<void> {
  try {
    const { adapter, capabilities } = await initRendererBackend();
    console.info(
      `[EngineBootstrap] Renderer: ${capabilities.backend.toUpperCase()} | WebGPU available: ${capabilities.webgpuAvailable}`,
      adapter.getCapabilities()
    );
  } catch (err) {
    console.error("[EngineBootstrap] Renderer init failed — WebGL fallback will be used:", err);
  }
}

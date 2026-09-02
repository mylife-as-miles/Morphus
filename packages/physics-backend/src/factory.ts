import { getEngineFlags } from "@blud/engine-config";
import { RapierPhysicsBackend } from "./rapier-adapter.js";
import { JoltPhysicsBackend } from "./jolt-adapter.js";
import type { PhysicsBackend, PhysicsBackendType } from "./types.js";

/**
 * PhysicsFactory — creates the correct backend based on feature flags.
 *
 * Decision order:
 *   1. ENABLE_JOLT_BACKEND is off (default) → Rapier always.
 *   2. ENABLE_JOLT_BACKEND is on + ENABLE_JOLT_SANDBOX_MODE → Jolt for sandbox.
 *   3. ENABLE_JOLT_BACKEND is on but sandbox mode is off → still Rapier
 *      (Jolt must be explicitly scoped; it never silently replaces Rapier).
 *
 * ─── CRITICAL CONTRACT ───────────────────────────────────────────────────────
 * createPhysicsBackend() creates an ISOLATED backend instance.
 * Two instances from different calls are INDEPENDENT worlds — they do NOT
 * share bodies, colliders, or joints. Rapier and Jolt NEVER simulate the
 * same live objects concurrently.
 *
 * The editor authoring physics (ScenePreview / @react-three/rapier) is a
 * separate React-component-level Rapier world that does NOT go through this
 * factory. It remains unchanged.
 */

export interface PhysicsFactoryOptions {
  /** Override the type regardless of feature flags. For testing / sandbox mode. */
  forceBackend?: PhysicsBackendType;
  /** Gravity vector. Defaults to -9.81 on Y. */
  gravity?: { x: number; y: number; z: number };
}

/**
 * Create and initialise a physics backend instance.
 * Returns a ready-to-use backend (init() has been called).
 */
export async function createPhysicsBackend(
  options: PhysicsFactoryOptions = {}
): Promise<PhysicsBackend> {
  const flags = getEngineFlags();
  const type = options.forceBackend ?? resolveBackendType(flags.ENABLE_JOLT_BACKEND, flags.ENABLE_JOLT_SANDBOX_MODE);
  const gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };

  const backend = instantiate(type);

  try {
    await backend.init(gravity);
    console.info(`[PhysicsFactory] ${type} backend ready.`);
    return backend;
  } catch (err) {
    if (type === "jolt") {
      console.error(
        "[PhysicsFactory] Jolt init failed — falling back to Rapier. Error:",
        err
      );
      const fallback = new RapierPhysicsBackend();
      await fallback.init(gravity);
      return fallback;
    }
    throw err;
  }
}

function resolveBackendType(joltEnabled: boolean, sandboxMode: boolean): PhysicsBackendType {
  if (joltEnabled && sandboxMode) {
    return "jolt";
  }
  return "rapier";
}

function instantiate(type: PhysicsBackendType): PhysicsBackend {
  switch (type) {
    case "rapier": return new RapierPhysicsBackend();
    case "jolt": return new JoltPhysicsBackend();
  }
}

import { getEngineFlags } from "@blud/engine-config";
import { WebGLRendererAdapter } from "./webgl-adapter.js";
import { WebGPURendererAdapter } from "./webgpu-adapter.js";
import type { RendererAdapter, RendererBackendType, RendererCapabilities } from "./types.js";

/**
 * RendererFactory — selects and initialises the correct renderer adapter.
 *
 * Decision order:
 *   1. If ENABLE_WEBGPU flag is off → WebGL (always safe).
 *   2. If ENABLE_WEBGPU flag is on AND WebGPU is detected  → WebGPU.
 *   3. If ENABLE_WEBGPU flag is on BUT WebGPU is unavailable → WebGL fallback.
 *
 * The factory is a thin singleton wrapper so the rest of the app only calls
 * `getRendererAdapter()` to get the live instance.
 */

let _adapter: RendererAdapter | null = null;
let _capabilities: RendererCapabilities | null = null;

/**
 * Call once during app bootstrap, before the R3F <Canvas> mounts.
 * Safe to call multiple times — returns the cached result after first call.
 */
export async function initRendererBackend(): Promise<{
  adapter: RendererAdapter;
  capabilities: RendererCapabilities;
}> {
  if (_adapter && _capabilities) {
    return { adapter: _adapter, capabilities: _capabilities };
  }

  const flags = getEngineFlags();

  if (flags.ENABLE_WEBGPU) {
    const webgpuAdapter = new WebGPURendererAdapter();
    const caps = await webgpuAdapter.detectCapabilities();

    if (caps.webgpuAvailable) {
      console.info("[RendererFactory] WebGPU backend selected.");
      _adapter = webgpuAdapter;
      _capabilities = caps;
      return { adapter: _adapter, capabilities: _capabilities };
    }

    console.warn(
      "[RendererFactory] ENABLE_WEBGPU is on but WebGPU is unavailable — falling back to WebGL."
    );
    webgpuAdapter.dispose();
  }

  const webglAdapter = new WebGLRendererAdapter();
  const caps = await webglAdapter.detectCapabilities();

  console.info("[RendererFactory] WebGL backend selected.");
  _adapter = webglAdapter;
  _capabilities = caps;
  return { adapter: _adapter, capabilities: _capabilities };
}

/** Get the currently active adapter. Throws if initRendererBackend was not called yet. */
export function getRendererAdapter(): RendererAdapter {
  if (!_adapter) {
    throw new Error(
      "[RendererFactory] getRendererAdapter() called before initRendererBackend()."
    );
  }
  return _adapter;
}

/** Get the current backend type without throwing. Returns null before init. */
export function getActiveBackend(): RendererBackendType | null {
  return _adapter?.backend ?? null;
}

/** Full capabilities object. Returns null before init. */
export function getRendererCapabilities(): RendererCapabilities | null {
  return _capabilities;
}

/** Reset the factory (test / hot-reload scenarios only). */
export function _resetRendererFactory(): void {
  _adapter?.dispose();
  _adapter = null;
  _capabilities = null;
}

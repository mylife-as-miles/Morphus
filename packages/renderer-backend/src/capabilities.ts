import type { RendererCapabilities } from "./types.js";

/**
 * Detect whether the current browser + GPU supports WebGPU.
 *
 * This check is SAFE to call at any time — it never creates a rendering
 * context, never throws, and always returns a concrete answer.
 *
 * Follows the W3C WebGPU spec §3.2 adapter request flow.
 */
export async function detectWebGPUSupport(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (!("gpu" in navigator)) return false;

  try {
    const gpu = (navigator as unknown as { gpu: GPUType }).gpu;
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

type GPUType = {
  requestAdapter(options?: unknown): Promise<unknown | null>;
};

/**
 * Build a RendererCapabilities snapshot for the WebGL path.
 * Called synchronously once the R3F canvas has been created.
 */
export function buildWebGLCapabilities(
  gl: WebGL2RenderingContext | WebGLRenderingContext
): Omit<RendererCapabilities, "webgpuAvailable"> {
  const isWebGL2 = "drawArraysInstanced" in gl;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const floatTextures =
    isWebGL2 ||
    gl.getExtension("OES_texture_float") !== null;

  return {
    backend: "webgl",
    maxTextureSize: maxTex,
    floatTextures,
    instancedRendering: isWebGL2,
    computeShaders: false,
    storageBuffers: false,
    indirectDraw: false,
    maxBindGroups: 0,
  };
}

/**
 * Build a RendererCapabilities snapshot for the WebGPU path.
 * adapter.limits is used for real values; safe defaults otherwise.
 */
export async function buildWebGPUCapabilities(): Promise<
  Omit<RendererCapabilities, "webgpuAvailable"> | null
> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return null;

  try {
    const gpu = (navigator as unknown as { gpu: GPUType }).gpu;
    const adapter = (await gpu.requestAdapter()) as {
      limits: Record<string, number>;
      features: { has(f: string): boolean };
    } | null;

    if (!adapter) return null;

    return {
      backend: "webgpu",
      maxTextureSize: adapter.limits["maxTextureDimension2D"] ?? 8192,
      floatTextures: true,
      instancedRendering: true,
      computeShaders: true,
      storageBuffers: true,
      indirectDraw: adapter.features.has("indirect-first-instance"),
      maxBindGroups: adapter.limits["maxBindGroups"] ?? 4,
    };
  } catch {
    return null;
  }
}

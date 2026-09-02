import type * as THREE from "three";
import {
  detectWebGPUSupport,
  buildWebGPUCapabilities,
} from "./capabilities.js";
import type {
  RendererAdapter,
  RendererCapabilities,
  R3FGlProps,
  PostFXPipeline,
  PostFXPipelineDescriptor,
  PickingPass,
  PickingPassDescriptor,
  PickingHit,
  MaterialPipelineCapabilities,
} from "./types.js";

/**
 * WebGPURendererAdapter — Phase 1/2/3/4 progressive enhancement.
 *
 * Phase 1 (NOW):
 *   - Capability detection.
 *   - getR3FGlConfig() returns a factory that provides THREE.WebGPURenderer.
 *   - All other methods fall back to null / no-op — the scene renders identically.
 *
 * Phase 2 (LATER):
 *   - createPostFXPipeline() implemented with WebGPU-native post-processing.
 *   - createMaterialPipeline() returns WebGPU node material support.
 *
 * Phase 3 (LATER):
 *   - createPickingPass() implemented as a GPU ID-buffer compute pass.
 *
 * Phase 4 (LATER):
 *   - Particle / fluid simulation hooks wired through compute shaders.
 *
 * SAFETY: If WebGPU is unavailable the factory throws, and RendererFactory
 * catches it and falls back to the WebGL adapter. The editor is never blocked.
 */
export class WebGPURendererAdapter implements RendererAdapter {
  readonly backend = "webgpu" as const;

  private _capabilities: RendererCapabilities | null = null;

  async detectCapabilities(): Promise<RendererCapabilities> {
    const webgpuAvailable = await detectWebGPUSupport();

    if (webgpuAvailable) {
      const gpuCaps = await buildWebGPUCapabilities();
      const webgpuModule = await loadThreeWebGPU();

      if (gpuCaps && webgpuModule) {
        this._capabilities = { ...gpuCaps, webgpuAvailable: true };
        return this._capabilities;
      }
    }

    this._capabilities = {
      backend: "webgpu",
      webgpuAvailable: false,
      maxTextureSize: 8192,
      floatTextures: true,
      instancedRendering: true,
      computeShaders: false,
      storageBuffers: false,
      indirectDraw: false,
      maxBindGroups: 0,
    };

    return this._capabilities;
  }

  /**
   * Returns a gl factory for R3F's <Canvas gl={...}> prop.
   *
   * Three.js r152+ exposes THREE.WebGPURenderer under `three/webgpu`.
   * It is a drop-in for WebGLRenderer from R3F's perspective.
   *
   * IMPORTANT: This import is dynamic to avoid pulling WebGPU code into
   * the WebGL bundle. The chunk is only loaded when WebGPU is enabled.
   */
  getR3FGlConfig(
    capabilities: RendererCapabilities
  ): ((props: R3FGlProps) => Promise<THREE.WebGLRenderer>) | undefined {
    if (!capabilities.webgpuAvailable) return undefined;

    return async (props: R3FGlProps) => {
      const canvas =
        props instanceof HTMLCanvasElement
          ? props
          : (props as { canvas?: HTMLCanvasElement }).canvas;
      if (!canvas) {
        throw new Error("[WebGPURendererAdapter] No canvas element in R3F gl props.");
      }
      // R3F v9 can re-enter an async gl factory before the first call settles.
      // Handing back the in-flight renderer keeps two WebGPU contexts from
      // racing to own the same canvas.
      let pending = inFlightRenderers.get(canvas);
      if (!pending) {
        pending = createWebGPURenderer(canvas);
        inFlightRenderers.set(canvas, pending);
      }
      return pending;
    };
  }

  createPostFXPipeline(
    _renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    _camera: THREE.Camera,
    _desc: PostFXPipelineDescriptor
  ): PostFXPipeline | null {
    return null;
  }

  createPickingPass(_renderer: THREE.WebGLRenderer): PickingPass | null {
    return null;
  }

  createMaterialPipeline(): MaterialPipelineCapabilities | null {
    if (!this._capabilities?.computeShaders) return null;
    return {
      supportsNodeMaterials: true,
      supportsCustomWGSL: true,
      supportsCustomGLSL: false,
    };
  }

  getCapabilities(): RendererCapabilities | null {
    return this._capabilities;
  }

  supportsFeature(feature: string): boolean {
    const supported: string[] = [
      "compute-shaders",
      "storage-buffers",
      "wgsl",
      "node-materials",
      "instanced-rendering",
    ];
    return supported.includes(feature);
  }

  dispose(): void {
    this._capabilities = null;
  }
}

/**
 * Synchronously construct a THREE.WebGPURenderer.
 *
 * This is a thin wrapper. THREE.WebGPURenderer (from `three/webgpu`) is a
 * drop-in for WebGLRenderer: same .render(), .setSize(), .dispose() API.
 *
 * When THREE.WebGPURenderer is not available (older Three.js versions or
 * tree-shaken bundles), this throws and RendererFactory falls back to WebGL.
 *
 * ─── Migration Note ──────────────────────────────────────────────────────────
 * Three.js r181 ships WebGPURenderer as experimental under `three/webgpu`.
 * The import is intentionally dynamic (via Function constructor) so bundlers
 * won't statically include it in the WebGL-only chunk.
 * When Three.js promotes WebGPURenderer to stable, the dynamic import can be
 * replaced with a static one.
 */
/**
 * Limits raised past the guaranteed floor, clamped to what this adapter has.
 *
 * WebGPU guarantees only sixteen sampled textures per shader stage, and the
 * mesh-terrain material sits close to it: it samples its own surface, detail,
 * relief and paint maps, and then the painted forest floor on top. Crossing the
 * line does not degrade gracefully -- the render pipeline fails to create, the
 * material draws nothing, and the only evidence is a validation message in the
 * console.
 *
 * Requested through `min` against the adapter's own report rather than asked
 * for outright, because `requestDevice` *fails* when a required limit cannot be
 * met. Asking a weak adapter for more than it has would turn a material that
 * renders slightly wrong into an editor that does not start.
 */
async function headroomLimits(): Promise<Record<string, number>> {
  if (typeof navigator === "undefined" || !navigator.gpu) return {};

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return {};

  const wanted: Record<string, number> = {
    maxSampledTexturesPerShaderStage: 32,
    // The foliage mask writes one storage texture per weight row, plus the
    // surfaces and the sward summary. The guaranteed floor for those is four.
    maxStorageTexturesPerShaderStage: 8
  };

  const available = adapter.limits as unknown as Record<string, number>;
  const limits: Record<string, number> = {};
  for (const [name, value] of Object.entries(wanted)) {
    const supported = available[name];
    if (typeof supported === "number") limits[name] = Math.min(value, supported);
  }
  return limits;
}

function sizeRendererToCanvas(
  renderer: { setPixelRatio: (dpr: number) => void; setSize: (w: number, h: number, updateStyle: boolean) => void },
  canvas: HTMLCanvasElement,
  dpr: number
): void {
  const bounds = canvas.getBoundingClientRect();
  renderer.setPixelRatio(dpr);
  renderer.setSize(
    Math.max(1, Math.round(bounds.width)),
    Math.max(1, Math.round(bounds.height)),
    false
  );
}

async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<THREE.WebGLRenderer> {
  const THREE_WEBGPU = getThreeWebGPU();
  if (!THREE_WEBGPU) {
    throw new Error(
      "[WebGPURendererAdapter] THREE.WebGPURenderer is not available in this build."
    );
  }

  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const renderer = new THREE_WEBGPU.WebGPURenderer({
    canvas,
    requiredLimits: await headroomLimits(),
    antialias: true,
    // Stated explicitly: alpha-to-coverage only smooths anything when there are
    // samples to dither across. Foliage cutouts fall back to hard binary edges
    // the moment the sample count drops to one.
    samples: 4,
    alpha: false,
    powerPreference: "high-performance"
  }) as unknown as THREE.WebGLRenderer & { init?: () => Promise<void> };

  renderer.toneMapping = THREE_WEBGPU.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;

  // Sized before init so the first pass allocates attachments at the real size,
  // and again after, because CSS layout can settle while requestDevice is
  // pending.
  sizeRendererToCanvas(renderer, canvas, dpr);
  await renderer.init?.();
  sizeRendererToCanvas(renderer, canvas, dpr);

  return renderer;
}

const inFlightRenderers = new WeakMap<HTMLCanvasElement, Promise<THREE.WebGLRenderer>>();

type ThreeWebGPUModule = {
  WebGPURenderer: new (opts: unknown) => unknown;
  ACESFilmicToneMapping: THREE.ToneMapping;
};

let _cachedWebGPUModule: ThreeWebGPUModule | null | undefined = undefined;
let _loadingWebGPUModule: Promise<ThreeWebGPUModule | null> | null = null;

async function loadThreeWebGPU(): Promise<ThreeWebGPUModule | null> {
  if (_cachedWebGPUModule !== undefined) return _cachedWebGPUModule;
  if (_loadingWebGPUModule) return _loadingWebGPUModule;

  _loadingWebGPUModule = import("three/build/three.webgpu.js")
    .then((mod) => {
      _cachedWebGPUModule = mod as unknown as ThreeWebGPUModule;
      return _cachedWebGPUModule;
    })
    .catch(() => {
      _cachedWebGPUModule = null;
      return null;
    })
    .finally(() => {
      _loadingWebGPUModule = null;
    });

  return _loadingWebGPUModule;
}

function getThreeWebGPU(): ThreeWebGPUModule | null {
  return _cachedWebGPUModule ?? null;
}

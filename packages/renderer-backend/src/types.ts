import type * as THREE from "three";

// ─── R3F gl factory props ──────────────────────────────────────────────────────

/**
 * The object R3F passes to a `gl` factory function on the <Canvas> prop.
 * R3F calls `await glConfig(defaultProps)` where defaultProps contains:
 *   { canvas, powerPreference, antialias, alpha }
 */
export type R3FGlProps = HTMLCanvasElement | {
  canvas: HTMLCanvasElement;
  powerPreference?: string;
  antialias?: boolean;
  alpha?: boolean;
};

// ─── Backend Enum ──────────────────────────────────────────────────────────────

export type RendererBackendType = "webgl" | "webgpu";

// ─── Capabilities ─────────────────────────────────────────────────────────────

export interface RendererCapabilities {
  backend: RendererBackendType;
  /** True if the GPU+browser support WebGPU (does not mean it is enabled). */
  webgpuAvailable: boolean;
  maxTextureSize: number;
  floatTextures: boolean;
  instancedRendering: boolean;
  computeShaders: boolean;
  storageBuffers: boolean;
  indirectDraw: boolean;
  maxBindGroups: number;
}

// ─── Post-FX Pipeline ─────────────────────────────────────────────────────────

export interface PostFXPipelineDescriptor {
  bloom?: { threshold: number; strength: number; radius: number };
  ssao?: { radius: number; intensity: number };
  smaa?: boolean;
  toneMappingExposure?: number;
}

// ─── Picking Pass ─────────────────────────────────────────────────────────────

export interface PickingHit {
  /** Node/object identifier baked into the object's ID buffer. */
  objectId: number;
  point: THREE.Vector3;
  distance: number;
  face: THREE.Face | null;
}

export interface PickingPassDescriptor {
  camera: THREE.Camera;
  scene: THREE.Scene;
  /** Normalised device coords [-1, 1]. */
  ndcX: number;
  ndcY: number;
}

// ─── Material Pipeline ────────────────────────────────────────────────────────

export interface MaterialPipelineCapabilities {
  supportsNodeMaterials: boolean;
  supportsCustomWGSL: boolean;
  supportsCustomGLSL: boolean;
}

// ─── Core Adapter Interface ───────────────────────────────────────────────────

/**
 * RendererAdapter — the single seam between the editor and the underlying GPU API.
 *
 * Implementations: WebGLRendererAdapter, WebGPURendererAdapter.
 *
 * The adapter intentionally does NOT replace React Three Fiber. R3F manages
 * the Three.js render loop. This adapter:
 *   1. Detects capabilities before R3F boots.
 *   2. Provides the correct `gl` factory for the R3F <Canvas> `gl` prop.
 *   3. Exposes optional Phase 2/3/4 GPU passes that live outside R3F's loop.
 *
 * Current editor code that calls useThree(), useFrame(), etc. is NOT affected.
 */
export interface RendererAdapter {
  readonly backend: RendererBackendType;

  /** Called once to detect capabilities. Does NOT create a GL/GPU context. */
  detectCapabilities(): Promise<RendererCapabilities>;

  /**
   * Returns the value to pass to the R3F <Canvas gl={...}> prop.
   * For WebGL: undefined (let R3F use its default).
   * For WebGPU: an async factory that R3F awaits — receives R3F's defaultProps
   * object (which contains `canvas`, `antialias`, `alpha`, `powerPreference`),
   * initialises the WebGPURenderer via `renderer.init()`, and returns it.
   * R3F calls `await glConfig(defaultProps)`, so the async factory is safe.
   */
  getR3FGlConfig(
    capabilities: RendererCapabilities
  ): ((props: R3FGlProps) => Promise<THREE.WebGLRenderer>) | undefined;

  /**
   * Phase 2 — optional post-FX pipeline (SMAA, bloom, SSAO, tone mapping).
   * Returns null if unsupported or not yet implemented for this backend.
   */
  createPostFXPipeline(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    desc: PostFXPipelineDescriptor
  ): PostFXPipeline | null;

  /**
   * Phase 3 — GPU-accelerated picking pass.
   * Returns null if unsupported — caller falls back to CPU BVH raycast.
   */
  createPickingPass(renderer: THREE.WebGLRenderer): PickingPass | null;

  /**
   * Phase 2 — advanced material pipeline (node-based / WGSL shaders).
   * Returns null if unsupported — caller falls back to MeshStandardMaterial.
   */
  createMaterialPipeline(): MaterialPipelineCapabilities | null;

  /** Live capabilities (set after detectCapabilities). */
  getCapabilities(): RendererCapabilities | null;

  /** True if a specific string feature key is supported. */
  supportsFeature(feature: string): boolean;

  /** Clean up any GPU resources created by this adapter. */
  dispose(): void;
}

// ─── Post-FX Pipeline Handle ──────────────────────────────────────────────────

export interface PostFXPipeline {
  render(delta: number): void;
  resize(width: number, height: number): void;
  update(desc: PostFXPipelineDescriptor): void;
  dispose(): void;
}

// ─── Picking Pass Handle ──────────────────────────────────────────────────────

export interface PickingPass {
  /** Returns the closest hit or null. Falls back to CPU if GPU pass fails. */
  pick(desc: PickingPassDescriptor): Promise<PickingHit | null>;
  resize(width: number, height: number): void;
  dispose(): void;
}

import type * as THREE from "three";
import { detectWebGPUSupport, buildWebGLCapabilities } from "./capabilities.js";
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
 * WebGLRendererAdapter
 *
 * The stable, default adapter. Wraps the existing R3F / Three.js WebGL path.
 *
 * This adapter does NOT change any existing behavior. It is purely additive:
 * - getR3FGlConfig() returns undefined → R3F uses its default WebGLRenderer.
 * - createPickingPass() returns a CPU BVH-based pass stub (Phase 3 placeholder).
 * - createPostFXPipeline() returns null (Phase 2 placeholder).
 *
 * The editor continues to work exactly as before.
 */
export class WebGLRendererAdapter implements RendererAdapter {
  readonly backend = "webgl" as const;

  private _capabilities: RendererCapabilities | null = null;

  async detectCapabilities(): Promise<RendererCapabilities> {
    const webgpuAvailable = await detectWebGPUSupport();

    this._capabilities = {
      backend: "webgl",
      webgpuAvailable,
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

  getR3FGlConfig(
    _capabilities: RendererCapabilities
  ): ((props: R3FGlProps) => Promise<THREE.WebGLRenderer>) | undefined {
    return undefined;
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
    return new CpuBvhPickingPass();
  }

  createMaterialPipeline(): MaterialPipelineCapabilities | null {
    return {
      supportsNodeMaterials: false,
      supportsCustomWGSL: false,
      supportsCustomGLSL: true,
    };
  }

  getCapabilities(): RendererCapabilities | null {
    return this._capabilities;
  }

  supportsFeature(feature: string): boolean {
    const supported: string[] = ["glsl", "shadow-maps", "instanced-rendering"];
    return supported.includes(feature);
  }

  dispose(): void {
    this._capabilities = null;
  }
}

/**
 * Phase 3 placeholder: CPU BVH-based picking.
 * This is what the editor already uses internally (DerivedRenderScene BVH).
 * When Phase 3 ships, this will be replaced by a GPU ID-buffer pass.
 */
class CpuBvhPickingPass implements PickingPass {
  async pick(_desc: PickingPassDescriptor): Promise<PickingHit | null> {
    return null;
  }

  resize(_width: number, _height: number): void {}

  dispose(): void {}
}

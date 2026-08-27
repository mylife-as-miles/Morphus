declare module "three/build/three.webgpu.js" {
  import type { MeshStandardMaterialParameters, Side } from "three";

  export class WebGPURenderer {
    constructor(options?: unknown);
    /** Required before the first frame; resolves when the GPU device is ready. */
    init(): Promise<void>;
  }

  /** Node-based PBR material for WebGPURenderer (TSL lighting path). */
  export class MeshStandardNodeMaterial {
    constructor(parameters?: MeshStandardMaterialParameters);
    dispose(): void;
    needsUpdate: boolean;
    envMapIntensity: number;
    roughness: number;
    side: Side;
  }
}

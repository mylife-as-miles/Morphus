import { getEngineFlags } from "@blud/engine-config";
import { getActiveBackend } from "@blud/renderer-backend";

/**
 * Lit preview meshes can use MeshStandardNodeMaterial when the viewport runs on
 * WebGPU and WEBGPU_PHASE2_MATERIALS is enabled (requires reload after toggling).
 */
export function shouldUsePreviewNodeMaterials(): boolean {
  try {
    const flags = getEngineFlags();
    if (!flags.ENABLE_WEBGPU || !flags.WEBGPU_PHASE2_MATERIALS) {
      return false;
    }
    return getActiveBackend() === "webgpu";
  } catch {
    return false;
  }
}

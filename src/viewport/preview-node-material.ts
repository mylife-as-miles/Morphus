import { createBlockoutTextureDataUri } from "@blud/shared";
import type { MaterialRenderSide } from "@blud/shared";
import type { DerivedRenderMesh } from "@blud/render-pipeline";
import { Color, FrontSide, BackSide, DoubleSide, type Side } from "three";
import { MeshStandardNodeMaterial } from "three/build/three.webgpu.js";
import { loadPreviewTexture, WHITE_PREVIEW_TEXTURE_DATA_URI } from "@/viewport/preview-textures";

function resolvePreviewMaterialSide(side?: MaterialRenderSide): Side {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

/**
 * WebGPU node-material counterpart to lit MeshStandard preview materials.
 * Blend-layer surfaces stay on the classic onBeforeCompile path.
 */
export function createPreviewNodeMaterial(
  spec: DerivedRenderMesh["material"],
  selected: boolean,
  hovered: boolean
) {
  const blendLayerTextures = (spec.blendLayers ?? [])
    .slice(0, 4)
    .map((layer) => (layer.colorTexture ? loadPreviewTexture(layer.colorTexture, true) : undefined));
  const colorTexture = spec.colorTexture
    ? loadPreviewTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? loadPreviewTexture(createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018), true)
      : blendLayerTextures.some(Boolean)
        ? loadPreviewTexture(WHITE_PREVIEW_TEXTURE_DATA_URI, true)
        : undefined;
  const normalTexture = spec.normalTexture ? loadPreviewTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadPreviewTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadPreviewTexture(spec.roughnessTexture, false) : undefined;
  const transparent = spec.transparent ?? false;
  const opacity = transparent ? spec.opacity ?? 1 : 1;

  return new MeshStandardNodeMaterial({
    color: colorTexture ? "#ffffff" : selected ? "#ffb35a" : hovered ? "#d8f4f0" : spec.color,
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : spec.emissiveColor ?? "#000000",
    emissiveIntensity: selected ? 0.38 : hovered ? 0.14 : spec.emissiveIntensity ?? 0,
    envMapIntensity: spec.wireframe ? 0 : 1.15,
    flatShading: spec.flatShaded,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    opacity,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    side: resolvePreviewMaterialSide(spec.side),
    transparent,
    vertexColors: true,
    wireframe: spec.wireframe,
    ...(colorTexture ? { map: colorTexture } : {}),
    ...(metalnessTexture ? { metalnessMap: metalnessTexture } : {}),
    ...(normalTexture ? { normalMap: normalTexture } : {}),
    ...(roughnessTexture ? { roughnessMap: roughnessTexture } : {})
  });
}

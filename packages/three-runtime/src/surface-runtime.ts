import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  NormalBlending,
  PlaneGeometry,
  Texture,
  Vector3
} from "three";
import type { WebHammerExportMaterial, WebHammerExportPrimitive, WebHammerProjectedDecal } from "./types";

export const WHITE_TEXTURE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=";

export function applyRuntimeSurfaceAttributes(geometry: BufferGeometry, primitive: WebHammerExportPrimitive) {
  if (primitive.colors?.length) {
    geometry.setAttribute("color", new Float32BufferAttribute(primitive.colors, 4));
  }

  if (primitive.blendWeights?.length) {
    geometry.setAttribute("surfaceBlend", new Float32BufferAttribute(primitive.blendWeights, 4));
  }
}

export function installRuntimeSurfaceBlendShader(
  material: MeshStandardMaterial,
  materialSpec: WebHammerExportMaterial,
  blendLayerTextures: Array<Texture | undefined>
) {
  const layers = (materialSpec.blendLayers ?? []).slice(0, 4);

  if (layers.length === 0) {
    return;
  }

  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    layers.forEach((layer, index) => {
      shader.uniforms[`surfaceBlendColor${index}`] = { value: new Color(layer.color ?? materialSpec.color) };
      shader.uniforms[`surfaceBlendMap${index}`] = { value: blendLayerTextures[index] ?? null };
      shader.uniforms[`surfaceBlendUseMap${index}`] = { value: Boolean(blendLayerTextures[index]) };
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 surfaceBlend;
varying vec4 vSurfaceBlend;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vSurfaceBlend = surfaceBlend;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vSurfaceBlend;
uniform vec3 surfaceBlendColor0;
uniform vec3 surfaceBlendColor1;
uniform vec3 surfaceBlendColor2;
uniform vec3 surfaceBlendColor3;
uniform sampler2D surfaceBlendMap0;
uniform sampler2D surfaceBlendMap1;
uniform sampler2D surfaceBlendMap2;
uniform sampler2D surfaceBlendMap3;
uniform bool surfaceBlendUseMap0;
uniform bool surfaceBlendUseMap1;
uniform bool surfaceBlendUseMap2;
uniform bool surfaceBlendUseMap3;

vec4 readSurfaceBlendLayer(vec3 layerColor, sampler2D layerMap, bool useMap) {
  vec4 layer = vec4(layerColor, 1.0);
#ifdef USE_MAP
  if (useMap) {
    layer *= texture2D(layerMap, vMapUv);
  }
#endif
  return layer;
}`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec4 surfaceMixedColor = diffuseColor;
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor0, surfaceBlendMap0, surfaceBlendUseMap0), clamp(vSurfaceBlend.x, 0.0, 1.0));
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor1, surfaceBlendMap1, surfaceBlendUseMap1), clamp(vSurfaceBlend.y, 0.0, 1.0));
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor2, surfaceBlendMap2, surfaceBlendUseMap2), clamp(vSurfaceBlend.z, 0.0, 1.0));
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor3, surfaceBlendMap3, surfaceBlendUseMap3), clamp(vSurfaceBlend.w, 0.0, 1.0));
diffuseColor = surfaceMixedColor;`
      );
  };
  material.customProgramCacheKey = () => `surface-blend:${layers.map((layer) => `${layer.id}:${layer.colorTexture ?? layer.color ?? ""}`).join("|")}`;
}

export async function createRuntimeProjectedDecalMesh(
  decal: WebHammerProjectedDecal,
  loadTexture: (path: string) => Promise<Texture>
) {
  const texture = decal.texture ? await loadTexture(decal.texture) : undefined;
  const material = new MeshBasicMaterial({
    blending: decal.blendMode === "add" ? AdditiveBlending : decal.blendMode === "multiply" ? MultiplyBlending : NormalBlending,
    color: decal.color ?? "#ffffff",
    depthWrite: false,
    map: texture,
    opacity: decal.opacity ?? 1,
    side: DoubleSide,
    toneMapped: false,
    transparent: true
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  const position = new Vector3(decal.position.x, decal.position.y, decal.position.z);
  const normal = new Vector3(decal.normal.x, decal.normal.y, decal.normal.z).normalize();

  mesh.name = `${decal.name}:projected-decal`;
  mesh.position.copy(position);
  mesh.scale.set(decal.size.x, decal.size.y, 1);
  mesh.up.set(decal.up?.x ?? 0, decal.up?.y ?? 1, decal.up?.z ?? 0).normalize();
  mesh.lookAt(position.clone().add(normal));
  mesh.renderOrder = 8;
  mesh.userData.webHammer = {
    decalId: decal.id,
    materialId: decal.materialId
  };

  return mesh;
}

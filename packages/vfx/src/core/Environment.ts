import type { IUniform, Material } from "three";

/**
 * The subset of three's shader object an `onBeforeCompile` patch may touch.
 *
 * Narrower than three's own signature on purpose: these patches only ever splice
 * chunks into the shader source and merge uniforms, and saying so keeps a patch
 * from quietly depending on renderer internals.
 */
export type ShaderPatchTarget = {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
};

export type ShaderPatch = (shader: ShaderPatchTarget) => void;

/**
 * What the VFX materials need from whatever is hosting them.
 *
 * Upstream this was the sandbox's own environment object. It is an interface
 * here because the editor viewport and a game runtime build their shadow and
 * IBL setup differently, and the materials only ever ask for one thing: that a
 * material be registered as a shadow caster with a shader patch applied, so a
 * custom-shaded mesh still casts a shadow that matches its displaced silhouette.
 */
export type VfxEnvironment = {
  registerShadowCasterWithPatch(material: Material, patch: ShaderPatch): Material;
};

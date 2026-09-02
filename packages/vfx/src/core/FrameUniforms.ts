import { Vector2, Vector3, type Texture } from "three";

/** three.js stores shader uniforms as `{ value }` boxes. */
export type UniformBox<T> = { value: T };

/**
 * Uniform objects shared by *every* custom material, by identity.
 *
 * Because three.js stores uniforms as `{ value }` boxes, handing the same box to
 * many materials means one write per frame updates all of them. That keeps the
 * per-frame CPU work for dozens of VFX materials down to a handful of
 * assignments instead of a traversal.
 *
 * This is the WebGL/GLSL side. The WebGPU path mirrors these into TSL uniform
 * nodes once per frame rather than keeping a second source of truth, so a value
 * is only ever written here.
 */
export const frame = {
  uTime: { value: 0 } as UniformBox<number>,
  uDelta: { value: 0 } as UniformBox<number>,
  uResolution: { value: new Vector2(1, 1) } as UniformBox<Vector2>,
  /** Packed-RGBA depth of the opaque scene -- drives soft particles. */
  uSceneDepth: { value: null } as UniformBox<Texture | null>,
  uCameraNear: { value: 0.1 } as UniformBox<number>,
  uCameraFar: { value: 400 } as UniformBox<number>,
  /** Equirectangular HDR used for cheap reflections in custom shaders. */
  uEnvMap: { value: null } as UniformBox<Texture | null>,
  /**
   * World-space direction *toward* the sun, mirrored from the environment.
   * Custom shaders that fake a normal -- ground snow, rubble -- need the same
   * key direction the lit meshes are using or the fake reads as a sticker.
   */
  uLightDir: { value: new Vector3(0.45, 0.78, 0.44).normalize() } as UniformBox<Vector3>,
  /** Global multipliers mirrored from settings so shaders can read them. */
  uShaderIntensity: { value: 1 } as UniformBox<number>,
  uGlobalGlow: { value: 1 } as UniformBox<number>
};

export type FrameUniforms = typeof frame;

/** The uniform block every VFX material wants, plus whatever it adds itself. */
export function sharedUniforms<T extends Record<string, UniformBox<unknown>>>(
  extra: T = {} as T
): FrameUniforms & T {
  return {
    uTime: frame.uTime,
    uDelta: frame.uDelta,
    uResolution: frame.uResolution,
    uSceneDepth: frame.uSceneDepth,
    uCameraNear: frame.uCameraNear,
    uCameraFar: frame.uCameraFar,
    uEnvMap: frame.uEnvMap,
    uLightDir: frame.uLightDir,
    uShaderIntensity: frame.uShaderIntensity,
    uGlobalGlow: frame.uGlobalGlow,
    ...extra
  } as FrameUniforms & T;
}

/** Advance the per-frame clock. Call once per rendered frame, before drawing. */
export function updateFrameUniforms(deltaSeconds: number): void {
  frame.uDelta.value = deltaSeconds;
  frame.uTime.value += deltaSeconds;
}

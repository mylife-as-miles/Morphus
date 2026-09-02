import { PointLight, type Color, type Object3D, type Vector3 } from "three";
import { settings } from "../config/settings";
import { damp } from "../utils/math";

const POOL_SIZE = 6;

/** An acquired light. Opaque to callers -- pass it back to `set` and `release`. */
export type LightHandle = {
  light: PointLight;
  inUse: boolean;
  target: number;
};

/**
 * A fixed set of dynamic point lights shared by every ability.
 *
 * The lights are created once and stay in the scene forever -- adding or
 * removing a light changes the lighting program's cache key and forces three to
 * recompile *every* material, which is the classic cause of a hitch when a VFX
 * spawns. Unused lights simply sit at zero intensity.
 */
export class LightPool {
  readonly lights: LightHandle[] = [];

  constructor(scene: Object3D) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const light = new PointLight(0xffffff, 0, 10, 2);
      light.castShadow = false;
      light.intensity = 0;
      light.visible = true;
      scene.add(light);
      this.lights.push({ light, inUse: false, target: 0 });
    }
  }

  /** A handle, or null when the pool is exhausted. */
  acquire(): LightHandle | null {
    for (const entry of this.lights) {
      if (!entry.inUse) {
        entry.inUse = true;
        entry.target = 0;
        entry.light.intensity = 0;
        return entry;
      }
    }
    return null;
  }

  /**
   * Drive an acquired light. Intensity and distance are eased toward the target
   * so editor changes and ability fades never pop.
   */
  set(
    entry: LightHandle | null,
    position: Vector3,
    color: Color,
    intensity: number,
    distance: number,
    dt: number
  ): void {
    if (!entry) return;
    entry.light.position.copy(position);
    entry.light.color.copy(color);
    entry.target = intensity * settings.global.lightIntensity;
    entry.light.intensity = damp(entry.light.intensity, entry.target, 0.0005, dt);
    entry.light.distance = distance * settings.global.lightRadius;
  }

  release(entry: LightHandle | null): void {
    if (!entry) return;
    entry.inUse = false;
    entry.target = 0;
  }

  /** Fade released lights out instead of cutting them. */
  update(dt: number): void {
    for (const entry of this.lights) {
      if (!entry.inUse && entry.light.intensity > 0.001) {
        entry.light.intensity = damp(entry.light.intensity, 0, 0.0001, dt);
      }
    }
  }

  reset(): void {
    for (const entry of this.lights) {
      entry.inUse = false;
      entry.target = 0;
      entry.light.intensity = 0;
    }
  }

  dispose(): void {
    for (const entry of this.lights) entry.light.parent?.remove(entry.light);
    this.lights.length = 0;
  }
}

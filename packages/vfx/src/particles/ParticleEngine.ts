import type { Object3D } from "three";
import { ParticleSystem, type ParticleSystemOptions } from "./ParticleSystem";
import { settings } from "../config/settings";

/**
 * Owns every particle system in the app.
 *
 * Systems are created lazily by name and *shared* between every instance of an
 * ability, which is what makes the pools meaningful: casting fire twenty times
 * recycles the same ember buffer instead of building a new one.
 */
export class ParticleEngine {
  private readonly scene: Object3D;
  private readonly systems = new Map<string, ParticleSystem>();

  constructor(scene: Object3D) {
    this.scene = scene;
  }

  /** Fetch, or lazily create, a shared system. */
  get(name: string, options: Omit<ParticleSystemOptions, "name"> = {}): ParticleSystem {
    let system = this.systems.get(name);
    if (!system) {
      system = new ParticleSystem({ name, ...options });
      this.systems.set(name, system);
      this.scene.add(system.object3D);
    }
    return system;
  }

  /** Upload the frame's spawn data. Called once, after all abilities update. */
  flush(): void {
    for (const system of this.systems.values()) system.flush();
  }

  /**
   * Number of particles currently alive, for the HUD.
   * Walks the pools, so call it on the stats interval -- not every frame.
   */
  countLive(time: number): number {
    let total = 0;
    for (const system of this.systems.values()) total += system.countLive(time);
    return total;
  }

  reset(): void {
    for (const system of this.systems.values()) system.reset();
  }

  dispose(): void {
    for (const system of this.systems.values()) {
      this.scene.remove(system.object3D);
      system.dispose();
    }
    this.systems.clear();
  }
}

/**
 * Fractional-rate emitter.
 *
 * Emitting `rate * dt` particles per frame would truncate to zero at high frame
 * rates and burst at low ones; accumulating the remainder makes emission
 * genuinely frame-rate independent.
 */
export class RateEmitter {
  rate: number;

  private accumulator = 0;

  constructor(rate = 30) {
    this.rate = rate;
  }

  /** Whole particles to spawn this frame. */
  tick(dt: number, rate: number = this.rate): number {
    this.accumulator += rate * settings.global.emissionRate * dt;
    const count = Math.floor(this.accumulator);
    this.accumulator -= count;
    // Never let a stall dump thousands of particles in a single frame.
    return Math.min(count, 240);
  }

  reset(): void {
    this.accumulator = 0;
  }
}

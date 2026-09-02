import type { Object3D } from "three";
import type { LightPool } from "../effects/LightPool";
import type { ParticleEngine } from "../particles/ParticleEngine";
import type { DecalSystem } from "../effects/GroundDecals";
import type { BurstSystem } from "../effects/BurstSphere";
import type { CameraShake } from "../effects/CameraShake";
import type { ScreenFlash } from "../effects/ScreenFlash";
import type { VfxEnvironment } from "../core/Environment";

/**
 * The shared services every ability draws on.
 *
 * Abilities never construct any of these: they are created once by the host and
 * handed in, which is what lets twenty casts of the same element share one ember
 * buffer and one set of dynamic lights instead of each building their own.
 */
export type AbilityContext = {
  /** Where ability groups and particle meshes are added. */
  scene: Object3D;
  lights: LightPool;
  particles: ParticleEngine;
  decals: DecalSystem;
  bursts: BurstSystem;
  shake: CameraShake;
  flash: ScreenFlash;
  environment: VfxEnvironment;
};

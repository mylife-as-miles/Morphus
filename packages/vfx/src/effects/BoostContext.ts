import type { Object3D } from "three";
import type { Vector4 } from "three";
import type { AbilityContext } from "../abilities/AbilityContext";

/**
 * What a self-buff needs on top of the shared ability services.
 *
 * The buffs are presented like abilities but registered nowhere near one: none
 * of them is aimed or cast, so they never reach the aim controller or the
 * ability pool. What they do need that an ability does not is the thing they
 * are attached to, since a buff is worn rather than thrown.
 */
/**
 * The rig a buff is worn by.
 *
 * More than an Object3D: a buff shaped around a body needs its standing height
 * and facing to place itself, and the flame and arc effects walk its bones.
 */
export type BoostTarget = Object3D & {
  /** Standing height in metres. */
  height: number;
  /** Heading in radians. */
  facing: number;
  /** Fills `a`/`b` with the head and tail of each limb segment, w carrying radius. */
  writeBoneSegments(a: Vector4[], b: Vector4[]): number;
};

export type BoostContext = AbilityContext & {
  /** The rig the effect is anchored to. */
  character: BoostTarget;
};

import type { Object3D } from "three";

/**
 * Render layers.
 *
 * WORLD       -- opaque environment + character. Written to the depth prepass,
 *                receives shadows, is what soft particles fade against.
 * VFX         -- every transparent ability mesh and particle system.
 * DISTORTION  -- invisible-to-the-main-pass proxies that write screen-space UV
 *                offsets for heat shimmer / water refraction.
 * CONTACT     -- additional layer flag on the character only, so the contact
 *                shadow pass captures it without also capturing grass or VFX.
 */
export const LAYER = Object.freeze({
  WORLD: 0,
  VFX: 1,
  DISTORTION: 2,
  CONTACT: 3
});

export type LayerId = (typeof LAYER)[keyof typeof LAYER];

/** Put an object and all of its descendants on a single layer. */
export function setLayerRecursive<T extends Object3D>(object: T, layer: number): T {
  object.traverse((node) => node.layers.set(layer));
  return object;
}

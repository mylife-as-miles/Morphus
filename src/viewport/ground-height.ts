/**
 * The one answer to "how high is the ground here".
 *
 * This exists because getting it wrong is expensive and silent. The viewport
 * draws two different terrains -- the scene graph's terrain node on WebGL, the
 * Mesh Terrain Lab's own world on WebGPU -- and they are not the same surface.
 * Measured on a default world they differ by 26 to 30 metres, so a system that
 * samples the wrong one puts its output that far underground, renders nothing
 * visible, and reports complete success. A forest was lost that way.
 *
 * Anything placed on the ground -- forests, streets, buildings, props -- must
 * resolve its height through here, so that they can only ever be wrong
 * together, and so a fix lands for all of them at once.
 */

import { evaluateHeight } from "@blud/terrain";
import type { GeometryNode } from "@blud/shared";
import { isMeshTerrainNode } from "@blud/shared";
import { getRendererAdapter } from "@blud/renderer-backend";
import { meshTerrainWorld } from "@/state/mesh-terrain-lab";

export type GroundHeightFn = (x: number, z: number) => number;

/** A level plane, for a scene with no terrain at all. */
const FLAT: GroundHeightFn = () => 0;

/**
 * True when the Mesh Terrain Lab is the thing actually drawing the ground.
 *
 * The lab's materials are TSL node graphs with no WebGL path, so
 * `MeshTerrainLabLayer` draws on WebGPU and renders nothing otherwise. Asked of
 * the renderer backend rather than by duck-typing three's renderer object,
 * which is how that layer decides too.
 */
export function labIsDrawingGround(): boolean {
  try {
    return getRendererAdapter().backend === "webgpu";
  } catch {
    return false;
  }
}

/**
 * Resolves the height function for whichever terrain is on screen.
 *
 * Never throws and never returns undefined: a caller that cannot place things
 * is worse than one that places them on a flat plane and corrects itself when
 * terrain appears.
 */
export function resolveGroundHeight(terrainNode: GeometryNode | undefined): GroundHeightFn {
  if (labIsDrawingGround()) {
    try {
      const world = meshTerrainWorld();
      return (x, z) => world.sampleHeight(x, z);
    } catch {
      // The lab world is constructed lazily and can throw before its config
      // exists. Falling through to the scene node is better than not placing.
    }
  }

  const meshTerrain =
    terrainNode && isMeshTerrainNode(terrainNode) ? terrainNode.data.meshTerrain : undefined;

  if (meshTerrain) {
    return (x, z) =>
      evaluateHeight(x, z, meshTerrain.seed, meshTerrain.profile, meshTerrain.modifiers);
  }

  return FLAT;
}

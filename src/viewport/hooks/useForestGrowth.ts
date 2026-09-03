/**
 * Drives forest bakes from the viewport.
 *
 * Growing a stand is the expensive operation in the whole forest system: a
 * coverage raster, a rejection-sampled layout over up to six hundred thousand
 * candidates, and a ground query per accepted stem. So it is explicit and one
 * field per tick -- never on a drag, and never more than one stand per frame,
 * which is what keeps the editor responsive while a large field settles.
 *
 * The store decides *whether* to grow (`nextDirtyField` already refuses while a
 * control point is being dragged, and honours the auto-grow switch). This hook
 * only supplies the ground: the mesh terrain when the scene has one, a flat
 * plane at y=0 when it does not, so a forest can still be authored before any
 * terrain exists.
 */

import { useEffect } from "react";
import { evaluateHeight } from "@blud/terrain";
import { createGroundSampler, type GroundSampler } from "@blud/forest";
import type { GeometryNode } from "@blud/shared";
import { isMeshTerrainNode } from "@blud/shared";
import { getRendererAdapter } from "@blud/renderer-backend";
import { forestStore } from "@/state/forest-store";
import { meshTerrainWorld, subscribeMeshTerrain } from "@/state/mesh-terrain-lab";

/**
 * True when the Mesh Terrain Lab is the thing actually drawing the ground.
 *
 * The lab's materials are TSL node graphs with no WebGL path, so
 * `MeshTerrainLabLayer` draws on WebGPU and renders nothing otherwise. The
 * ground a forest is planted on has to be the ground the viewer can see, so
 * this asks the same question that layer asks, the same way -- of the renderer
 * backend rather than by duck-typing three's renderer object.
 */
function labIsDrawingGround(): boolean {
  try {
    return getRendererAdapter().backend === "webgpu";
  } catch {
    return false;
  }
}

/** How often to look for a field that wants growing. */
const POLL_MS = 180;

export function useForestGrowth(terrainNode: GeometryNode | undefined, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const meshTerrain =
      terrainNode && isMeshTerrainNode(terrainNode) ? terrainNode.data.meshTerrain : undefined;

    // Which ground to plant on.
    //
    // There are two terrains in this viewport and they are not the same
    // surface. The scene graph's terrain node is evaluated by `evaluateHeight`
    // and drawn by `MeshTerrainObject` on WebGL; the lab keeps its own world,
    // with its own seed and modifier stack, and draws it on WebGPU. Sampling
    // the wrong one is not a small error -- measured on a default world, the
    // lab's surface sits about 26 to 30 metres above the scene node's, so a
    // stand grown against the node was planted that far underground and the
    // forest simply could not be seen.
    let heightAt: ((x: number, z: number) => number) | undefined;

    if (labIsDrawingGround()) {
      try {
        const world = meshTerrainWorld();
        heightAt = (x, z) => world.sampleHeight(x, z);
      } catch {
        // The lab world is constructed lazily and can throw before its config
        // exists. Falling through to the scene node is better than not growing.
        heightAt = undefined;
      }
    }

    if (!heightAt && meshTerrain) {
      heightAt = (x, z) =>
        evaluateHeight(x, z, meshTerrain.seed, meshTerrain.profile, meshTerrain.modifiers);
    }

    const sampler: GroundSampler = heightAt
      ? createGroundSampler(heightAt)
      : // No terrain either way: a level plane, so the stand still lays out
        // sensibly and regrows against real relief the moment terrain appears.
        () => ({ height: 0, slope: 0, normal: [0, 1, 0] as const });

    let cancelled = false;

    // The ground under every existing stand just changed -- a different terrain
    // node, a rebuilt lab world, or a switch between the two. A bake holds the
    // heights it was grown against, so without this a stand keeps whatever
    // surface it was first planted on and only new fields look right.
    forestStore.markAllDirty();

    const tick = () => {
      if (cancelled) return;
      const field = forestStore.nextDirtyField();
      if (field) forestStore.bakeField(field, sampler);
    };

    const timer = window.setInterval(tick, POLL_MS);
    tick();

    // A rebuilt lab world is a different landform under the same fields, so the
    // stands have to be regrown against it. Subscribed here rather than read
    // through `useSyncExternalStore`: this hook is called from `ViewportCanvas`
    // among a long list of others, and adding a hook to it shifts every
    // subsequent hook's index -- which React reports as a changed hook order
    // and which takes the whole viewport subtree down with it.
    const unsubscribe = subscribeMeshTerrain(() => {
      if (!cancelled) forestStore.markAllDirty();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
    // Re-created when the terrain's authoring stack changes, so a stand grown
    // before a tunnel was carved regrows against the surface that exists now.
  }, [enabled, terrainNode]);
}

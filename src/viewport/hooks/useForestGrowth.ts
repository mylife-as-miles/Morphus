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
import { forestStore } from "@/state/forest-store";

/** How often to look for a field that wants growing. */
const POLL_MS = 180;

export function useForestGrowth(terrainNode: GeometryNode | undefined, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const meshTerrain =
      terrainNode && isMeshTerrainNode(terrainNode) ? terrainNode.data.meshTerrain : undefined;

    const sampler: GroundSampler = meshTerrain
      ? createGroundSampler((x, z) =>
          evaluateHeight(x, z, meshTerrain.seed, meshTerrain.profile, meshTerrain.modifiers)
        )
      : // No terrain yet: a level plane, so the stand still lays out sensibly and
        // regrows against real relief the moment terrain appears.
        () => ({ height: 0, slope: 0, normal: [0, 1, 0] as const });

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const field = forestStore.nextDirtyField();
      if (field) forestStore.bakeField(field, sampler);
    };

    const timer = window.setInterval(tick, POLL_MS);
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // Re-created when the terrain's authoring stack changes, so a stand grown
    // before a tunnel was carved regrows against the surface that exists now.
  }, [enabled, terrainNode]);
}

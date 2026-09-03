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
import { createGroundSampler, type GroundSampler } from "@blud/forest";
import type { GeometryNode } from "@blud/shared";
import { forestStore } from "@/state/forest-store";
import { subscribeMeshTerrain } from "@/state/mesh-terrain-lab";
import { resolveGroundHeight } from "@/viewport/ground-height";

/** How often to look for a field that wants growing. */
const POLL_MS = 180;

export function useForestGrowth(terrainNode: GeometryNode | undefined, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    // Whichever terrain is actually on screen -- see `ground-height.ts` for why
    // that question has a wrong answer worth 30 metres. Streets and buildings
    // resolve through the same function, so they cannot disagree with a forest
    // about where the ground is.
    const sampler: GroundSampler = createGroundSampler(resolveGroundHeight(terrainNode));

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

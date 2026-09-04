/**
 * The vendored Mesh Terrain Lab's scene, drawn inside Morphus's viewport.
 *
 * This is the whole point of route 2: keep Morphus's chrome -- its menubar,
 * tools panel, inspector, gizmos -- and put upstream's renderer under it, rather
 * than running upstream's editor beside ours at `?editor=terrain`.
 *
 * `TerrainScene` is mounted verbatim. It brings its own environment, post stack
 * and streaming scheduler, which is exactly what makes it look the way it does;
 * trying to reassemble those from Morphus's pipeline is how the earlier
 * geometry-only port ended up drawing a flat green mass.
 *
 * Two consequences worth knowing:
 *
 *  - It only draws on WebGPU. Every material in it is a TSL node graph and
 *    upstream ships no WebGL path, so on the WebGL backend this renders
 *    nothing rather than falling back.
 *  - It owns tone mapping and the environment for the frame it is in, so
 *    Morphus's own sky and lighting are not additive with it.
 */

import { Component, Suspense, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { getRendererAdapter } from "@blud/renderer-backend";
import { TerrainScene } from "@/super-terrain/terrain/react/TerrainScene";
import {
  meshTerrainGeneration,
  meshTerrainWorld,
  subscribeMeshTerrain,
  terrainEditorStore,
  terrainFoliageStore,
  terrainForestStore,
  terrainTreeStore
} from "@/state/mesh-terrain-lab";


/**
 * Keeps a failure inside the vendored scene from blanking the whole viewport.
 *
 * The scene is upstream's code running against our renderer, so the failure
 * modes are the seams between them -- a material the backend cannot compile, a
 * missing GPU limit. React's default is to unmount the entire tree above, which
 * takes Morphus's editor down with it; this keeps the rest of the viewport
 * alive and puts the reason somewhere findable.
 */
class MeshTerrainLabBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[MeshTerrainLab] scene failed to render:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export type MeshTerrainLabLayerProps = {
  /** False leaves the scene unmounted, so nothing streams or compiles. */
  enabled?: boolean;
};

export function MeshTerrainLabLayer({ enabled = true }: MeshTerrainLabLayerProps) {
  // Remounted on a world rebuild: seed and landform are fixed at construction,
  // so a new world is a new scene rather than a mutated one.
  const generation = useSyncExternalStore(
    subscribeMeshTerrain,
    meshTerrainGeneration,
    meshTerrainGeneration
  );

  // The terrain materials are WGSL node graphs with no WebGL fallback. Mounting
  // them on a WebGL canvas produces a wall of shader-compilation failures and
  // still draws nothing, so the check is a guard rather than a preference.
  //
  // Asked of the renderer *backend* rather than of three's renderer object: the
  // adapter hands R3F a WebGPURenderer cast to WebGLRenderer, so duck-typing the
  // instance is unreliable, and getting it wrong silently unmounts the terrain.
  const isWebGpu = useMemo(() => {
    try {
      return getRendererAdapter().backend === "webgpu";
    } catch {
      return false;
    }
  }, []);

  // Upstream drives this from its own App: the runtime does not stream until it
  // is initialized, and `TerrainScene` only attaches a renderer to a world that
  // is already running. Without it the environment draws and the ground never
  // does -- every section counter sits at zero.
  useEffect(() => {
    if (!enabled || !isWebGpu) return;

    let active = true;
    const world = meshTerrainWorld();

    void world.initialize({ discardSavedWorld: false }).then(() => {
      if (!active) return;
      terrainEditorStore.patch({
        activeSculptLayerId: world.getSculptLayers()[0]?.id,
        status: "Stream scheduler online"
      });
    });

    return () => {
      active = false;
    };
    // Keyed on the generation so a rebuilt world is initialized in its turn.
  }, [enabled, generation, isWebGpu]);

  if (import.meta.env.DEV) {
    (globalThis as Record<string, unknown>).__meshTerrainLab = {
      world: meshTerrainWorld(),
      editor: terrainEditorStore,
      forest: terrainForestStore,
      enabled,
      isWebGpu
    };
  }

  if (!enabled || !isWebGpu) return null;

  return (
    <MeshTerrainLabBoundary>
      <Suspense fallback={null}>
        <TerrainScene
          editor={terrainEditorStore}
          foliage={terrainFoliageStore}
          forest={terrainForestStore}
          key={generation}
          terrain={meshTerrainWorld()}
          trees={terrainTreeStore}
        />
      </Suspense>
    </MeshTerrainLabBoundary>
  );
}

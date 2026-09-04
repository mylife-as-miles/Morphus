/**
 * The vendored Mesh Terrain Lab's own stores, held for Morphus's UI.
 *
 * The lab is a complete editor: a `WorldTerrain` runtime plus four stores that
 * between them own render mode, sculpt tool state, forest fields, tree
 * prototypes and ground cover. Its React scene reads them directly, and its
 * panels write them.
 *
 * Route 2 keeps the runtime and throws the panels away -- Morphus's own UI
 * writes these instead. So the stores live here as module singletons rather
 * than inside the canvas component: a tool panel in the editor shell has to
 * reach them, and it is nowhere near the React tree the scene lives in.
 *
 * The world is rebuilt rather than mutated when its recipe changes. Seed,
 * landform model and authored content are all fixed at construction, and
 * pretending otherwise leaves half the streaming pipeline holding the previous
 * world's sections.
 */

import { EditorStore } from "@/super-terrain/terrain/editor/EditorStore";
import { FoliageEditorStore } from "@/super-terrain/foliage/FoliageEditorStore";
import { ForestFieldStore } from "@/super-terrain/forest/ForestFieldStore";
import { TreeEditorStore } from "@/super-terrain/tree/TreeEditorStore";
import { WorldTerrain } from "@/super-terrain/terrain/WorldTerrain";
import {
  loadWorldRecipe,
  terrainConfigFor,
  type WorldRecipe
} from "@/super-terrain/terrain/world/worldRecipe";

export const terrainEditorStore = new EditorStore();
export const terrainForestStore = new ForestFieldStore();
export const terrainTreeStore = new TreeEditorStore();
export const terrainFoliageStore = new FoliageEditorStore();

let recipe: WorldRecipe = loadWorldRecipe();
let world: WorldTerrain | null = null;
let generation = 0;

const listeners = new Set<() => void>();

/** The live terrain runtime, built on first use. */
export function meshTerrainWorld(): WorldTerrain {
  world ??= new WorldTerrain(terrainConfigFor(recipe));
  return world;
}

/** Bumped whenever the world is replaced, so the scene can remount against it. */
export function meshTerrainGeneration(): number {
  return generation;
}

export function currentWorldRecipe(): WorldRecipe {
  return recipe;
}

/**
 * Throws the current world away and builds the next one.
 *
 * Every forest field is marked for regrowing: a spline is drawn in world
 * coordinates and a new world is the same coordinate space, so the shapes
 * survive -- but the ground under them does not.
 */
export function rebuildMeshTerrainWorld(next: WorldRecipe): void {
  recipe = next;
  world?.dispose?.();
  world = new WorldTerrain(terrainConfigFor(next));
  generation += 1;
  terrainForestStore.markAllDirty();
  for (const listener of listeners) listener();
}

export function subscribeMeshTerrain(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

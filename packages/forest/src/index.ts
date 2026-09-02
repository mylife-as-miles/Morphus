/**
 * Procedural forests.
 *
 * Ported from vibe-stack/super-terrain. Three layers, and they are deliberately
 * independent of any renderer:
 *
 *  - `field`     a forest described as a spline on the ground, not a list of
 *                trees. Moving a control point rewrites four numbers; nothing
 *                regenerates until the field is explicitly grown again.
 *  - `presets`   species mixes and forest-floor recipes per stand type.
 *  - `generator` the tree itself: a semantic graph grown from a species
 *                definition, then compiled to geometry. No WebGPU, no TSL, no
 *                three.js scene -- it returns buffers, so the editor viewport
 *                and a headless worker can both drive it.
 */

export * from "./core/ExternalStore";
export * from "./field/forestField";
export * from "./field/ForestFieldStore";
export * from "./presets/forestPresets";
export * from "./presets/forestFloors";
export * from "./presets/foliageFloor";
export * from "./store/TreeEditorStore";
export * from "./generator/types";
export * from "./generator/speciesCatalog";
export * from "./generator/semanticGraph";
export * from "./generator/compileTree";
export * from "./materials/barkTiling";

/**
 * Authoring-only entry point for mesh terrain.
 *
 * The package barrel re-exports the CSG evaluator, which pulls `three-bvh-csg`
 * and the meshing backends in with it. Code that only records what the user
 * drew -- brush strokes, paint dabs, tunnel portals, density stamps -- needs
 * none of that, and a viewport hook has no business dragging a solid-modelling
 * kernel into the bundle to sample a stroke.
 *
 * So: import from `@blud/terrain` to *evaluate* a terrain, and from
 * `@blud/terrain/authoring` to *describe an edit to* one.
 *
 * Cutter geometry is deliberately included. It builds operand shapes with plain
 * three.js primitives and never touches the CSG evaluator, so the tunnel and
 * dig tools can measure and preview a volume without paying for the backend.
 */

export * from "./mesh-terrain/core/types";
export * from "./mesh-terrain/core/bounds";
export * from "./mesh-terrain/core/WorldCoordinates";

export * from "./mesh-terrain/modifiers/types";
export * from "./mesh-terrain/modifiers/brushKernel";
export * from "./mesh-terrain/modifiers/strokeSampling";
export * from "./mesh-terrain/modifiers/factories";
export * from "./mesh-terrain/modifiers/transform";
export * from "./mesh-terrain/modifiers/tunnel";
export * from "./mesh-terrain/modifiers/ModifierStack";

export * from "./mesh-terrain/modifiers/boolean/CutterVolume";
export * from "./mesh-terrain/modifiers/boolean/cutterDisplacement";

export * from "./mesh-terrain/materialSettings";
export * from "./mesh-terrain/config";

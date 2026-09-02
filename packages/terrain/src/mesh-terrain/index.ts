/**
 * Mesh terrain authoring core.
 *
 * Ported from the Mesh Terrain Lab prototype (vibe-stack/super-terrain). Unlike
 * the heightmap terrain in this package's other modules -- a 2D grid where every
 * column has exactly one elevation -- this is a true mesh: strokes may follow the
 * picked surface normal, so terrain can carry lateral deformation, overhangs, and
 * genuine holes cut by CSG rather than masked out of a grid.
 *
 * The two are complementary. Heightmap terrain stays cheaper to store and sample;
 * mesh terrain is what deep holes, mounts, tunnels and caves need.
 */

// Geometry and coordinates
export * from "./core/types";
export * from "./core/bounds";
export * from "./core/WorldCoordinates";
export * from "./core/ArrayBufferPool";

// The editable terrain mesh itself
export * from "./mesh/TerrainMesh";
export * from "./mesh/MeshSpatialIndex";
export * from "./mesh/MeshValidation";
export * from "./partition/boundary";

// Non-destructive authoring stack
export * from "./modifiers/types";
export * from "./modifiers/brushKernel";
export * from "./modifiers/strokeSampling";
export * from "./modifiers/ModifierStack";
export * from "./modifiers/factories";
export * from "./modifiers/transform";
export * from "./modifiers/tunnel";

// Live CSG (add / subtract closed volumes, swept tunnels, camera-drilled caves)
export * from "./modifiers/boolean/CutterVolume";
export * from "./modifiers/boolean/MeshBooleanBackend";
export * from "./modifiers/boolean/cutterDisplacement";

// Base field, field stack, and single-shot evaluation into render buffers
export * from "./baseField";
export * from "./terrainField";
export * from "./evaluate";

// Material channels and level of detail
export * from "./materialSettings";
export * from "./lod/LodSelector";
export * from "./config";

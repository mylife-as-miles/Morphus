/**
 * Bridge to the mesh-terrain authoring core in `packages/terrain`.
 *
 * This re-exports the authoring subpath rather than the package barrel on
 * purpose: the barrel also pulls in the meshing and CSG backends, and
 * `three-bvh-csg` with them. Recording what the user drew needs none of that,
 * and a viewport hook should not drag a solid-modelling kernel into the bundle
 * to sample a brush stroke.
 *
 * Keeping the specifier in one file also means the sculpt hook never names a
 * cross-package path itself.
 */

export {
  appendBrushPoint,
  boundsFromSphere,
  createBooleanVolumeModifier,
  createBrushStroke,
  createRemeshModifier,
  createTessellateModifier,
  createTunnelModifier,
  createWeightPaintStroke,
  distanceToCutterVolume,
  modifierWorldBounds,
  sampleStrokeSegment,
  transformedBooleanVolume,
  tunnelPortalDistance,
  unionBounds,
  updateTunnelPortal
} from "@blud/terrain/authoring";

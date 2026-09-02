import type { BufferGeometry } from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

/**
 * three-mesh-bvh augments BufferGeometry's typings globally, declaring
 * `computeBoundsTree` and `disposeBoundsTree` on every geometry whether or not
 * the helpers have actually been grafted on. So the compiler already believes
 * these members exist; what it will not accept is assigning the plain function
 * to them, because the declared type is an intersection of the library's
 * overloads. The cast is confined to the two assignments that graft them.
 */
type GraftableGeometry = { computeBoundsTree: unknown; disposeBoundsTree: unknown };

export function enableBvhRaycast(mesh: { raycast: unknown }, geometry: BufferGeometry) {
  const graftable = geometry as unknown as GraftableGeometry;
  graftable.computeBoundsTree = computeBoundsTree;
  graftable.disposeBoundsTree = disposeBoundsTree;
  (geometry as BufferGeometry & { computeBoundsTree: () => void }).computeBoundsTree();
  mesh.raycast = acceleratedRaycast;
}

export function disableBvhRaycast(geometry: BufferGeometry) {
  const grafted = geometry as BufferGeometry & { disposeBoundsTree?: () => void };
  grafted.disposeBoundsTree?.();
}

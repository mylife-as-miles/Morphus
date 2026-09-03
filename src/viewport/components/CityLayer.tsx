/**
 * Draws the street network in the viewport.
 *
 * The whole network is one mesh. A downtown grid is hundreds of segments and
 * hundreds of draw calls for flat grey ground is the wrong place to spend a
 * frame, so carriageway, footway and junction are distinguished by a vertex
 * colour attribute rather than by separate materials.
 *
 * Streets are conformed to the same ground the forest is planted on. That is
 * not a detail: the viewport draws two different terrains depending on the
 * renderer backend, and a road sampling the wrong one sits tens of metres under
 * the hill it is supposed to cross.
 */

import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type Mesh } from "three";
import { buildRoadMesh, type GroundHeight, type RoadNetwork } from "@blud/city";

export type CityLayerProps = {
  network: RoadNetwork;
  /** Samples terrain height; a flat plane at zero when the scene has none. */
  groundHeight?: GroundHeight;
  visible?: boolean;
  /** Called after a rebuild, so the store can clear its dirty flag. */
  onRebuilt?: () => void;
};

export function CityLayer({ groundHeight, network, onRebuilt, visible = true }: CityLayerProps) {
  const meshRef = useRef<Mesh | null>(null);

  const geometry = useMemo(() => {
    const data = buildRoadMesh({ groundHeight, network });
    if (data.vertexCount === 0) return null;

    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(data.positions, 3));
    next.setAttribute("normal", new BufferAttribute(data.normals, 3));
    next.setAttribute("uv", new BufferAttribute(data.uvs, 2));
    next.setAttribute("color", new BufferAttribute(data.colors, 3));
    next.setIndex(new BufferAttribute(data.indices, 1));
    next.computeBoundingSphere();
    return next;
    // `groundHeight` is a new closure on most renders; keying on it would
    // rebuild the whole network every frame. The network is what changes shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Freeing the previous geometry is not optional here: a rebuilt downtown grid
  // is a few megabytes of buffers, and regenerating a city a dozen times while
  // tuning block size would otherwise leak all of them.
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    if (geometry) onRebuilt?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  if (!visible || !geometry) return null;

  return (
    <mesh geometry={geometry} name="CityStreets" receiveShadow ref={meshRef}>
      {/* Vertex colours carry the surface distinction, so one material covers
          carriageway, kerb and footway. Rough and unlit-looking on purpose:
          asphalt has no interesting specular at city scale. */}
      <meshStandardMaterial metalness={0} roughness={0.95} vertexColors />
    </mesh>
  );
}

/**
 * Draws grown forest stands in the viewport.
 *
 * Upstream renders forests through its own WebGPU stack -- a TSL bark material,
 * a leaf atlas, impostor bands. None of that is ported, and this editor runs
 * WebGL by default, so this draws the same *geometry* through our ordinary
 * pipeline instead: the wood mesh is an indexed mesh with vertex colours, and
 * the canopy is the generator's own foliage cards rendered as flat sprays.
 *
 * The result reads as a stand -- correct species silhouettes, correct
 * placement, correct scale -- without the bark and leaf shading upstream gets.
 * That is the honest boundary of what a renderer-independent port can draw.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  DoubleSide,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3
} from "three";
import type { ForestFieldBake, TreePlacement } from "@blud/forest";
import {
  useTreePrototypes,
  type TreeLodChoice,
  type TreePrototypeGeometry
} from "@/viewport/hooks/useTreePrototypes";

export type ForestLayerProps = {
  bakes: readonly ForestFieldBake[];
  /** Hidden while a control point is being dragged, so the drag stays cheap. */
  visible?: boolean;
  lod?: TreeLodChoice;
};

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();
const _tilt = new Quaternion();
const _tiltAxis = new Vector3(1, 0, 0);

/** One instanced draw per prototype: trunk and branches. */
function StemInstances({
  prototype,
  placements
}: {
  prototype: TreePrototypeGeometry;
  placements: readonly TreePlacement[];
}) {
  const meshRef = useRef<InstancedMesh | null>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < placements.length; i += 1) {
      const placement = placements[i];
      _position.set(placement.position[0], placement.position[1], placement.position[2]);
      _quaternion.setFromAxisAngle(new Vector3(0, 1, 0), placement.rotation);

      // A non-zero tilt is deadfall: a stem that came down, not one that grew
      // crooked, so it leans about its base rather than being sheared.
      if (placement.tilt) {
        _tilt.setFromAxisAngle(_tiltAxis, placement.tilt);
        _quaternion.multiply(_tilt);
      }

      _scale.setScalar(placement.scale);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  return (
    <instancedMesh
      args={[prototype.wood, undefined, Math.max(1, placements.length)]}
      castShadow
      count={placements.length}
      frustumCulled={false}
      receiveShadow
      ref={meshRef}
    >
      <meshStandardMaterial roughness={0.92} metalness={0} vertexColors />
    </instancedMesh>
  );
}

/**
 * The canopy.
 *
 * Every card of every tree in one instanced draw: the generator hands back a
 * per-tree matrix list in tree-local space, and each is premultiplied by its
 * placement transform here. Without the leaf atlas the cards carry only their
 * baked colour, so this is canopy mass and silhouette rather than foliage.
 */
function CanopyInstances({
  prototype,
  placements
}: {
  prototype: TreePrototypeGeometry;
  placements: readonly TreePlacement[];
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const cardGeometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useEffect(() => () => cardGeometry.dispose(), [cardGeometry]);

  const total = prototype.foliageCount * placements.length;

  const colours = useMemo(() => {
    const array = new Float32Array(Math.max(1, total) * 3);
    for (let tree = 0; tree < placements.length; tree += 1) {
      for (let card = 0; card < prototype.foliageCount; card += 1) {
        const out = (tree * prototype.foliageCount + card) * 3;
        array[out] = prototype.foliageColors[card * 3] ?? 0.3;
        array[out + 1] = prototype.foliageColors[card * 3 + 1] ?? 0.5;
        array[out + 2] = prototype.foliageColors[card * 3 + 2] ?? 0.25;
      }
    }
    return array;
  }, [placements.length, prototype.foliageColors, prototype.foliageCount, total]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || total === 0) return;

    const local = new Matrix4();
    const world = new Matrix4();

    for (let tree = 0; tree < placements.length; tree += 1) {
      const placement = placements[tree];
      _position.set(placement.position[0], placement.position[1], placement.position[2]);
      _quaternion.setFromAxisAngle(new Vector3(0, 1, 0), placement.rotation);
      if (placement.tilt) {
        _tilt.setFromAxisAngle(_tiltAxis, placement.tilt);
        _quaternion.multiply(_tilt);
      }
      _scale.setScalar(placement.scale);
      world.compose(_position, _quaternion, _scale);

      for (let card = 0; card < prototype.foliageCount; card += 1) {
        local.fromArray(prototype.foliageMatrices, card * 16);
        _matrix.multiplyMatrices(world, local);
        mesh.setMatrixAt(tree * prototype.foliageCount + card, _matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements, prototype.foliageCount, prototype.foliageMatrices, total]);

  if (total === 0) return null;

  return (
    <instancedMesh
      args={[cardGeometry, undefined, total]}
      castShadow
      count={total}
      frustumCulled={false}
      ref={meshRef}
    >
      <instancedBufferAttribute attach="geometry-attributes-color" args={[colours, 3]} />
      <meshStandardMaterial
        alphaTest={0.35}
        roughness={0.86}
        side={DoubleSide}
        transparent
        vertexColors
      />
    </instancedMesh>
  );
}

export function ForestLayer({ bakes, visible = true, lod = 0 }: ForestLayerProps) {
  // Every prototype across every visible stand, so one worker queue serves all.
  const prototypeIds = useMemo(
    () => Array.from(new Set(bakes.flatMap((bake) => bake.prototypeIds))),
    [bakes]
  );

  const { geometries } = useTreePrototypes(prototypeIds, lod);

  // Placements regrouped by prototype: instancing is per prototype, but a
  // placement only knows which one it wants.
  const byPrototype = useMemo(() => {
    const grouped = new Map<string, TreePlacement[]>();
    for (const bake of bakes) {
      for (const placement of bake.placements) {
        const list = grouped.get(placement.prototypeId);
        if (list) list.push(placement);
        else grouped.set(placement.prototypeId, [placement]);
      }
    }
    return grouped;
  }, [bakes]);

  if (!visible) return null;

  return (
    <group name="ForestStands">
      {Array.from(byPrototype.entries()).map(([prototypeId, placements]) => {
        const prototype = geometries.get(prototypeId);
        // Still compiling: draw nothing for this species rather than a stand-in,
        // so a half-built forest never reads as finished.
        if (!prototype || placements.length === 0) return null;

        return (
          <group key={prototypeId}>
            <StemInstances placements={placements} prototype={prototype} />
            <CanopyInstances placements={placements} prototype={prototype} />
          </group>
        );
      })}
    </group>
  );
}

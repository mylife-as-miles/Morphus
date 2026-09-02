/**
 * Compiles and caches the tree prototypes a forest field references.
 *
 * A field does not hold trees, it holds placements that name a prototype, and
 * many placements share one. So the expensive part -- growing and meshing the
 * tree -- happens once per prototype and the stand is drawn by instancing it.
 *
 * Compilation is queued one at a time rather than fired in parallel. A dozen
 * workers each holding a hero tree's three LODs is a lot of memory for no gain
 * on a single-core-bound job, and serialising them means the first prototype
 * appears in a second or so instead of everything appearing at once at the end.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Sphere,
  Vector3,
  type TypedArray
} from "three";
import { parseTreePrototypeId, type ProceduralTreeAsset } from "@blud/forest";
import type { TreeCompileRequest, TreeCompileResponse } from "@/workers/tree-compiler.worker";

/** Which of the three compiled LODs the viewport draws. */
export type TreeLodChoice = 0 | 1 | 2;

export type TreePrototypeGeometry = {
  prototypeId: string;
  /** Trunk and branches, an ordinary indexed mesh with vertex colours. */
  wood: BufferGeometry;
  /** Per-card transforms, ready for an InstancedMesh. */
  foliageMatrices: Float32Array;
  foliageColors: Float32Array;
  foliageCount: number;
  /** Metres, for framing and for a sensible instance bounding sphere. */
  height: number;
  compileMs: number;
};

export type TreePrototypeCache = {
  geometries: ReadonlyMap<string, TreePrototypeGeometry>;
  pending: number;
  failed: ReadonlyMap<string, string>;
};

function buildWoodGeometry(asset: ProceduralTreeAsset, lod: TreeLodChoice): BufferGeometry {
  const source = asset.lods[lod].wood;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(source.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(source.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(source.colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(source.uvs, 2));
  geometry.setIndex(new BufferAttribute(source.indices, 1));

  // The generator already knows the extents, so computing them again by walking
  // a hundred thousand vertices would be pure waste.
  const { min, max } = source.bounds;
  const centre = new Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const radius = centre.distanceTo(new Vector3(max.x, max.y, max.z));
  geometry.boundingSphere = new Sphere(centre, radius);

  return geometry;
}

/**
 * @param prototypeIds Every prototype the visible fields reference.
 * @param lod Which compiled level to upload.
 */
export function useTreePrototypes(
  prototypeIds: readonly string[],
  lod: TreeLodChoice = 0
): TreePrototypeCache {
  const [geometries, setGeometries] = useState<Map<string, TreePrototypeGeometry>>(new Map());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  // Requested-or-done, so a re-render never re-queues work already in flight.
  const claimedRef = useRef(new Set<string>());

  const wanted = useMemo(() => Array.from(new Set(prototypeIds)), [prototypeIds]);

  useEffect(() => {
    const worker = new Worker(new URL("../../workers/tree-compiler.worker.ts", import.meta.url), {
      type: "module"
    });
    workerRef.current = worker;

    const pump = () => {
      const next = queueRef.current.shift();
      if (!next) {
        busyRef.current = false;
        return;
      }
      const parsed = parseTreePrototypeId(next);
      if (!parsed) {
        setFailed((current) => new Map(current).set(next, "Unreadable prototype id."));
        setPending((count) => Math.max(0, count - 1));
        pump();
        return;
      }
      busyRef.current = true;
      worker.postMessage({
        prototypeId: next,
        species: parsed.species,
        variation: parsed.variation
      } satisfies TreeCompileRequest);
    };

    worker.onmessage = (event: MessageEvent<TreeCompileResponse>) => {
      const message = event.data;
      setPending((count) => Math.max(0, count - 1));

      if (message.kind === "failed") {
        setFailed((current) => new Map(current).set(message.prototypeId, message.message));
      } else {
        const asset = message.asset;
        const bounds = asset.lods[lod].wood.bounds;
        const entry: TreePrototypeGeometry = {
          prototypeId: message.prototypeId,
          wood: buildWoodGeometry(asset, lod),
          foliageMatrices: asset.lods[lod].foliage.matrices,
          foliageColors: asset.lods[lod].foliage.colors,
          foliageCount: asset.lods[lod].foliage.count,
          height: bounds.max.y - bounds.min.y,
          compileMs: message.ms
        };
        setGeometries((current) => new Map(current).set(message.prototypeId, entry));
      }
      pump();
    };

    // A queue may already have been filled by the effect below on first render.
    if (!busyRef.current) pump();

    return () => {
      worker.terminate();
      workerRef.current = null;
      busyRef.current = false;
      queueRef.current = [];
    };
    // `lod` is baked into the uploaded geometry, so changing it rebuilds the
    // worker and the cache rather than mixing levels in one map.
  }, [lod]);

  useEffect(() => {
    const fresh = wanted.filter((id) => !claimedRef.current.has(id));
    if (fresh.length === 0) return;

    for (const id of fresh) claimedRef.current.add(id);
    queueRef.current.push(...fresh);
    setPending((count) => count + fresh.length);

    if (!busyRef.current && workerRef.current) {
      const next = queueRef.current.shift();
      if (next) {
        const parsed = parseTreePrototypeId(next);
        if (parsed) {
          busyRef.current = true;
          workerRef.current.postMessage({
            prototypeId: next,
            species: parsed.species,
            variation: parsed.variation
          } satisfies TreeCompileRequest);
        }
      }
    }
  }, [wanted]);

  useEffect(() => {
    return () => {
      for (const entry of geometries.values()) entry.wood.dispose();
    };
    // Disposal is deliberately tied to unmount only: re-running it whenever the
    // map changes would free a geometry that is still on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { geometries, pending, failed };
}

export type { TypedArray };

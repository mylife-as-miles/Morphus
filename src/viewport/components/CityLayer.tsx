/**
 * Draws the street network in the viewport.
 *
 * three-roads owns the deck, kerb returns and road paint. Its replaceable road
 * chunks are merged into one surface buffer and one markings buffer here, with
 * index groups retaining the upstream material classes.
 *
 * Streets are conformed to the same ground the forest is planted on. That is
 * not a detail: the viewport draws two different terrains depending on the
 * renderer backend, and a road sampling the wrong one sits tens of metres under
 * the hill it is supposed to cross.
 */

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import {
  buildMassingMesh,
  buildRoadSurfaceMeshes,
  type BuildingInstance,
  type GroundHeight,
  type MassingVolume,
  type RoadCrosswalk,
  type RoadNetwork,
  type RoadRenderMeshData
} from "@blud/city";

import { CityBuildings } from "@/viewport/components/CityBuildings";

export type CityLayerProps = {
  network: RoadNetwork;
  crosswalks?: readonly RoadCrosswalk[];
  /** Building volumes; empty until massing has been run. */
  massing?: readonly MassingVolume[];
  /** Generated landmarks; empty until the facade pass has run. */
  buildings?: readonly BuildingInstance[];
  /** Lots that carry a real building, so their massing box is skipped. */
  builtLotIds?: ReadonlySet<string>;
  /** Samples terrain height; a flat plane at zero when the scene has none. */
  groundHeight?: GroundHeight;
  /**
   * Stable identity for the terrain revision sampled by `groundHeight`.
   *
   * Every editor pane creates its own sampling closure, so the function itself
   * cannot identify equivalent terrain across canvases. The key lets those
   * panes share the expensive renderer-neutral three-roads buffers while each
   * canvas still owns and disposes its own BufferGeometry.
   */
  groundHeightCacheKey?: object;
  visible?: boolean;
  /** Called after a rebuild, so the store can clear its dirty flag. */
  onRebuilt?: () => void;
};

export function CityLayer({
  buildings,
  builtLotIds,
  crosswalks,
  groundHeight,
  groundHeightCacheKey,
  massing,
  network,
  onRebuilt,
  visible = true
}: CityLayerProps) {
  const roadMeshes = useMemo(() => {
    try {
      return getCachedRoadMeshes({
        crosswalks,
        groundHeight,
        groundHeightCacheKey,
        network
      });
    } catch (error) {
      // A malformed authoring graph must not take the rest of the viewport
      // down. Leaving the dirty flag set makes the failed rebuild truthful.
      console.error("[CityLayer] three-roads compilation failed", error);
      return null;
    }
  }, [crosswalks, groundHeight, groundHeightCacheKey, network]);

  const surfaceGeometry = useMemo(
    () => roadMeshes ? createGeometry(roadMeshes.surface) : null,
    [roadMeshes]
  );
  const markingGeometry = useMemo(
    () => roadMeshes ? createGeometry(roadMeshes.markings) : null,
    [roadMeshes]
  );

  // Freeing the previous geometry is not optional here: a rebuilt downtown grid
  // is a few megabytes of buffers, and regenerating a city a dozen times while
  // tuning block size would otherwise leak all of them.
  useEffect(() => {
    return () => {
      surfaceGeometry?.dispose();
      markingGeometry?.dispose();
    };
  }, [markingGeometry, surfaceGeometry]);

  useEffect(() => {
    if (roadMeshes) onRebuilt?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadMeshes]);

  const massingGeometry = useMemo(() => {
    if (!massing || massing.length === 0) return null;

    // A lot with a real building on it must not also carry its massing box, or
    // the box sits inside the facade and z-fights through every window.
    const remaining = builtLotIds?.size
      ? massing.filter((volume) => !builtLotIds.has(volume.lotId))
      : massing;
    if (remaining.length === 0) return null;

    const data = buildMassingMesh(remaining, groundHeight);
    if (data.vertexCount === 0) return null;

    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(data.positions, 3));
    next.setAttribute("normal", new BufferAttribute(data.normals, 3));
    next.setAttribute("color", new BufferAttribute(data.colors, 3));
    next.setIndex(new BufferAttribute(data.indices, 1));
    next.computeBoundingSphere();
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [massing, builtLotIds]);

  useEffect(() => {
    return () => {
      massingGeometry?.dispose();
    };
  }, [massingGeometry]);

  if (!visible) return null;

  return (
    <group name="City">
      {surfaceGeometry && roadMeshes ? (
        <mesh geometry={surfaceGeometry} name="CityStreets" receiveShadow>
          {roadMeshes.surface.groups.map(({ materialClass }, index) => (
            <meshStandardMaterial
              attach={`material-${index}`}
              color={surfaceColour(materialClass)}
              key={materialClass}
              metalness={0}
              roughness={materialClass === "road" ? 0.96 : 0.88}
            />
          ))}
        </mesh>
      ) : null}

      {markingGeometry && roadMeshes ? (
        <mesh geometry={markingGeometry} name="CityRoadMarkings" receiveShadow renderOrder={2}>
          {roadMeshes.markings.groups.map(({ materialClass }, index) => (
            <meshStandardMaterial
              attach={`material-${index}`}
              color={markingColour(materialClass)}
              key={materialClass}
              metalness={0}
              roughness={0.82}
            />
          ))}
        </mesh>
      ) : null}

      {buildings && buildings.length > 0 ? <CityBuildings buildings={buildings} /> : null}

      {massingGeometry ? (
        <mesh castShadow geometry={massingGeometry} name="CityMassing" receiveShadow>
          {/* Flat-shaded and unapologetically saturated. Massing is a diagram:
              its job is to make one volume readable against the one behind it,
              and anything approaching concrete merges them into a grey mass
              exactly when the silhouette is what you are judging. */}
          <meshStandardMaterial flatShading metalness={0} roughness={0.85} vertexColors />
        </mesh>
      ) : null}
    </group>
  );
}

const NO_CROSSWALKS: readonly RoadCrosswalk[] = [];
const FLAT_GROUND_CACHE_KEY = {};
type RoadMeshes = ReturnType<typeof buildRoadSurfaceMeshes>;

/**
 * Network and authoring arrays are immutable store snapshots, which makes
 * their identities reliable revision keys. Weak maps release old downtowns as
 * soon as the store and its canvases stop referring to them.
 */
const roadMeshCache = new WeakMap<
  RoadNetwork,
  WeakMap<object, WeakMap<object, RoadMeshes>>
>();

function getCachedRoadMeshes({
  crosswalks,
  groundHeight,
  groundHeightCacheKey,
  network
}: Pick<CityLayerProps, "crosswalks" | "groundHeight" | "groundHeightCacheKey" | "network">): RoadMeshes {
  const crosswalkKey = crosswalks ?? NO_CROSSWALKS;
  const groundKey = groundHeightCacheKey ?? groundHeight ?? FLAT_GROUND_CACHE_KEY;

  let byCrosswalks = roadMeshCache.get(network);
  if (!byCrosswalks) {
    byCrosswalks = new WeakMap();
    roadMeshCache.set(network, byCrosswalks);
  }

  let byGround = byCrosswalks.get(crosswalkKey);
  if (!byGround) {
    byGround = new WeakMap();
    byCrosswalks.set(crosswalkKey, byGround);
  }

  const cached = byGround.get(groundKey);
  if (cached) return cached;

  const built = buildRoadSurfaceMeshes({ crosswalks, groundHeight, network });
  byGround.set(groundKey, built);
  return built;
}

function createGeometry(data: RoadRenderMeshData): BufferGeometry | null {
  if (data.vertexCount === 0 || data.indices.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(data.uvs, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  for (let index = 0; index < data.groups.length; index += 1) {
    const group = data.groups[index]!;
    geometry.addGroup(group.indexStart, group.indexCount, index);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function surfaceColour(materialClass: string): string {
  if (materialClass === "road") return "#35363a";
  if (materialClass === "sidewalk" || materialClass.includes("paver")) return "#96928a";
  if (materialClass === "shoulder") return "#716e68";
  if (materialClass === "cycleway") return "#8b4a40";
  if (materialClass === "median" || materialClass === "grass") return "#526345";
  return "#77736d";
}

function markingColour(materialClass: string): string {
  if (materialClass.endsWith("yellow")) return "#e7bb3d";
  if (materialClass.endsWith("blue")) return "#4a91d8";
  if (materialClass.endsWith("red")) return "#cb554a";
  return "#f2efe4";
}

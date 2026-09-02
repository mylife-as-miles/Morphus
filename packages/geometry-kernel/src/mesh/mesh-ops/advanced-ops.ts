import type { EditableMesh, FaceID, Vec3, VertexID } from "@blud/shared";
import {
  averageVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  vec3
} from "@blud/shared";
import { triangulatePolygon3D } from "../../polygon/polygon-utils";
import type { EditableMeshPolygon } from "../editable-mesh";
import { buildEditableMeshVertexNormals } from "./deform-ops";
import { mergeEditableMeshFaces } from "./basic-ops";
import { compactPolygonLoop, createEditableMeshFromPolygons, getMeshPolygons, makeUndirectedEdgeKey } from "./shared";
import type { MeshPolygonData } from "./types";

export function insetEditableMeshFaces(
  mesh: EditableMesh,
  faceIds: FaceID[],
  amount: number,
  epsilon = 0.0001
): EditableMesh | undefined {
  if (faceIds.length === 0 || Math.abs(amount) <= epsilon) {
    return undefined;
  }

  const selectedFaceIds = new Set(faceIds);
  const nextPolygons = getMeshPolygons(mesh).flatMap((polygon) => {
    if (!selectedFaceIds.has(polygon.id)) {
      return [cloneMeshPolygon(polygon)];
    }

    const insetDistance = Math.min(
      Math.abs(amount),
      Math.max(computeMinimumEdgeLength(polygon) * 0.45, epsilon)
    );
    const directionSign = amount >= 0 ? 1 : -1;
    const innerPositions = polygon.positions.map((position) => {
      const towardCenter = subVec3(polygon.center, position);
      const planarDirection = subVec3(
        towardCenter,
        scaleVec3(polygon.normal, dotVec3(towardCenter, polygon.normal))
      );

      if (lengthVec3(planarDirection) <= epsilon) {
        return vec3(position.x, position.y, position.z);
      }

      const normalizedDirection = normalizeVec3(planarDirection);

      return vec3(
        position.x + normalizedDirection.x * insetDistance * directionSign,
        position.y + normalizedDirection.y * insetDistance * directionSign,
        position.z + normalizedDirection.z * insetDistance * directionSign
      );
    });
    const innerVertexIds = polygon.vertexIds.map((_, index) => `${polygon.id}:inset:${index}`);
    const innerFace = createPolygonLoop(
      polygon.id,
      innerPositions,
      innerVertexIds,
      polygon.materialId,
      polygon.uvScale
    );

    if (!innerFace) {
      return [cloneMeshPolygon(polygon)];
    }

    const sideFaces = polygon.vertexIds.flatMap((vertexId, index) => {
      const nextIndex = (index + 1) % polygon.vertexIds.length;
      const sideFace = createPolygonLoop(
        `${polygon.id}:inset:ring:${index}`,
        [
          polygon.positions[index],
          polygon.positions[nextIndex],
          innerPositions[nextIndex],
          innerPositions[index]
        ],
        [vertexId, polygon.vertexIds[nextIndex], innerVertexIds[nextIndex], innerVertexIds[index]],
        polygon.materialId,
        polygon.uvScale
      );

      return sideFace ? [sideFace] : [];
    });

    return [innerFace, ...sideFaces];
  });

  return nextPolygons.length > 0 ? createEditableMeshFromPolygons(nextPolygons) : undefined;
}

export function bridgeEditableMeshEdges(
  mesh: EditableMesh,
  edges: Array<[VertexID, VertexID]>
): EditableMesh | undefined {
  if (edges.length !== 2) {
    return undefined;
  }

  const first = resolveBoundaryEdgeOrientation(mesh, edges[0]);
  const second = resolveBoundaryEdgeOrientation(mesh, edges[1]);

  if (!first || !second) {
    return undefined;
  }

  if (new Set([first.startId, first.endId, second.startId, second.endId]).size < 4) {
    return undefined;
  }

  const vertexById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex] as const));
  const firstStart = vertexById.get(first.startId);
  const firstEnd = vertexById.get(first.endId);
  const secondStart = vertexById.get(second.startId);
  const secondEnd = vertexById.get(second.endId);

  if (!firstStart || !firstEnd || !secondStart || !secondEnd) {
    return undefined;
  }

  const polygonsById = new Map(getMeshPolygons(mesh).map((polygon) => [polygon.id, polygon] as const));
  const materialId = polygonsById.get(first.faceId)?.materialId ?? polygonsById.get(second.faceId)?.materialId;
  const uvScale = polygonsById.get(first.faceId)?.uvScale ?? polygonsById.get(second.faceId)?.uvScale;
  const bridgeFace = createPolygonLoop(
    `${first.faceId}:bridge:${second.faceId}`,
    [firstEnd.position, firstStart.position, secondEnd.position, secondStart.position],
    [first.endId, first.startId, second.endId, second.startId],
    materialId,
    uvScale
  );

  if (!bridgeFace) {
    return undefined;
  }

  return createEditableMeshFromPolygons([
    ...getMeshPolygons(mesh).map(cloneMeshPolygon),
    bridgeFace
  ]);
}

export function pokeEditableMeshFaces(mesh: EditableMesh, faceIds: FaceID[]): EditableMesh | undefined {
  if (faceIds.length === 0) {
    return undefined;
  }

  const selectedFaceIds = new Set(faceIds);
  const nextPolygons = getMeshPolygons(mesh).flatMap((polygon) => {
    if (!selectedFaceIds.has(polygon.id)) {
      return [cloneMeshPolygon(polygon)];
    }

    return polygon.vertexIds.flatMap((vertexId, index) => {
      const nextIndex = (index + 1) % polygon.vertexIds.length;
      const face = createPolygonLoop(
        `${polygon.id}:poke:${index}`,
        [polygon.positions[index], polygon.positions[nextIndex], polygon.center],
        [vertexId, polygon.vertexIds[nextIndex], `${polygon.id}:poke:center`],
        polygon.materialId,
        polygon.uvScale
      );

      return face ? [face] : [];
    });
  });

  return nextPolygons.length > 0 ? createEditableMeshFromPolygons(nextPolygons) : undefined;
}

export function triangulateEditableMeshFaces(
  mesh: EditableMesh,
  faceIds?: FaceID[]
): EditableMesh | undefined {
  const selectedFaceIds = faceIds ? new Set(faceIds) : undefined;
  let changed = false;
  const nextPolygons = getMeshPolygons(mesh).flatMap((polygon) => {
    if ((selectedFaceIds && !selectedFaceIds.has(polygon.id)) || polygon.positions.length <= 3) {
      return [cloneMeshPolygon(polygon)];
    }

    const indices = triangulatePolygon3D(polygon.positions, polygon.normal);

    if (indices.length < 3) {
      return [cloneMeshPolygon(polygon)];
    }

    changed = true;
    const triangles: EditableMeshPolygon[] = [];

    for (let index = 0; index < indices.length; index += 3) {
      const firstIndex = indices[index];
      const secondIndex = indices[index + 1];
      const thirdIndex = indices[index + 2];
      const triangle = createPolygonLoop(
        `${polygon.id}:tri:${index / 3}`,
        [polygon.positions[firstIndex], polygon.positions[secondIndex], polygon.positions[thirdIndex]],
        [polygon.vertexIds[firstIndex], polygon.vertexIds[secondIndex], polygon.vertexIds[thirdIndex]],
        polygon.materialId,
        polygon.uvScale
      );

      if (triangle) {
        triangles.push(triangle);
      }
    }

    return triangles.length > 0 ? triangles : [cloneMeshPolygon(polygon)];
  });

  return changed ? createEditableMeshFromPolygons(nextPolygons) : undefined;
}

export function quadrangulateEditableMeshFaces(
  mesh: EditableMesh,
  faceIds: FaceID[],
  epsilon = 0.0001
): EditableMesh | undefined {
  if (faceIds.length < 2) {
    return undefined;
  }

  let currentMesh = mesh;
  const activeFaceIds = new Set(faceIds);
  let changed = false;

  while (true) {
    const candidatePair = findQuadrangulatePair(
      getMeshPolygons(currentMesh).filter(
        (polygon) => activeFaceIds.has(polygon.id) && polygon.positions.length === 3
      ),
      epsilon
    );

    if (!candidatePair) {
      break;
    }

    const nextMesh = mergeEditableMeshFaces(currentMesh, candidatePair, epsilon);

    if (!nextMesh) {
      break;
    }

    changed = true;
    activeFaceIds.delete(candidatePair[1]);
    activeFaceIds.add(candidatePair[0]);
    currentMesh = nextMesh;
  }

  return changed ? currentMesh : undefined;
}

export function solidifyEditableMesh(
  mesh: EditableMesh,
  thickness: number,
  epsilon = 0.0001
): EditableMesh | undefined {
  if (mesh.faces.length === 0 || Math.abs(thickness) <= epsilon) {
    return undefined;
  }

  const vertexNormals = buildEditableMeshVertexNormals(mesh);
  const polygons = getMeshPolygons(mesh);
  const edgeUsage = collectUndirectedEdgeUsage(polygons);
  const outerFaces = polygons.map(cloneMeshPolygon);
  const innerFaces = polygons.flatMap((polygon) => {
    const innerVertexIds = polygon.vertexIds.map((vertexId) => `${vertexId}:solidify:inner`);
    const innerPositions = polygon.positions.map((position, index) => {
      const direction = normalizeVec3(vertexNormals.get(polygon.vertexIds[index]) ?? polygon.normal);
      return vec3(
        position.x - direction.x * thickness,
        position.y - direction.y * thickness,
        position.z - direction.z * thickness
      );
    });
    const face = createPolygonLoop(
      `${polygon.id}:solidify:inner`,
      innerPositions.slice().reverse(),
      innerVertexIds.slice().reverse(),
      polygon.materialId,
      polygon.uvScale
    );

    return face ? [face] : [];
  });
  const sideFaces = polygons.flatMap((polygon) =>
    polygon.vertexIds.flatMap((vertexId, index) => {
      const nextIndex = (index + 1) % polygon.vertexIds.length;
      const edgeKey = makeUndirectedEdgeKey(vertexId, polygon.vertexIds[nextIndex]);

      if ((edgeUsage.get(edgeKey) ?? 0) !== 1) {
        return [];
      }

      const face = createPolygonLoop(
        `${polygon.id}:solidify:side:${index}`,
        [
          polygon.positions[index],
          polygon.positions[nextIndex],
          innerFaces.length > 0
            ? vec3(
                polygon.positions[nextIndex].x -
                  normalizeVec3(vertexNormals.get(polygon.vertexIds[nextIndex]) ?? polygon.normal).x * thickness,
                polygon.positions[nextIndex].y -
                  normalizeVec3(vertexNormals.get(polygon.vertexIds[nextIndex]) ?? polygon.normal).y * thickness,
                polygon.positions[nextIndex].z -
                  normalizeVec3(vertexNormals.get(polygon.vertexIds[nextIndex]) ?? polygon.normal).z * thickness
              )
            : polygon.positions[nextIndex],
          innerFaces.length > 0
            ? vec3(
                polygon.positions[index].x -
                  normalizeVec3(vertexNormals.get(vertexId) ?? polygon.normal).x * thickness,
                polygon.positions[index].y -
                  normalizeVec3(vertexNormals.get(vertexId) ?? polygon.normal).y * thickness,
                polygon.positions[index].z -
                  normalizeVec3(vertexNormals.get(vertexId) ?? polygon.normal).z * thickness
              )
            : polygon.positions[index]
        ],
        [
          vertexId,
          polygon.vertexIds[nextIndex],
          `${polygon.vertexIds[nextIndex]}:solidify:inner`,
          `${vertexId}:solidify:inner`
        ],
        polygon.materialId,
        polygon.uvScale
      );

      return face ? [face] : [];
    })
  );

  return createEditableMeshFromPolygons([...outerFaces, ...innerFaces, ...sideFaces]);
}

export function mirrorEditableMesh(
  mesh: EditableMesh,
  axis: "x" | "y" | "z",
  epsilon = 0.0001
): EditableMesh | undefined {
  if (mesh.faces.length === 0) {
    return undefined;
  }

  const originalFaces = getMeshPolygons(mesh).map(cloneMeshPolygon);
  const mirroredFaces = getMeshPolygons(mesh).flatMap((polygon) => {
    if (polygon.positions.every((position) => Math.abs(readAxis(position, axis)) <= epsilon)) {
      return [];
    }

    const face = createPolygonLoop(
      `${polygon.id}:mirror:${axis}`,
      polygon.positions
        .map((position) => mirrorPoint(position, axis))
        .slice()
        .reverse(),
      polygon.vertexIds
        .map((vertexId, index) =>
          Math.abs(readAxis(polygon.positions[index], axis)) <= epsilon
            ? vertexId
            : `${vertexId}:mirror:${axis}`
        )
        .slice()
        .reverse(),
      polygon.materialId,
      polygon.uvScale
    );

    return face ? [face] : [];
  });

  return mirroredFaces.length > 0
    ? createEditableMeshFromPolygons([...originalFaces, ...mirroredFaces])
    : undefined;
}

export function weldEditableMeshVerticesByDistance(
  mesh: EditableMesh,
  distance: number,
  vertexIds?: VertexID[],
  epsilon = 0.0001
): EditableMesh | undefined {
  if (distance <= epsilon) {
    return undefined;
  }

  const selectedVertexIds = vertexIds ? new Set(vertexIds) : undefined;
  const candidates = mesh.vertices.filter((vertex) => !selectedVertexIds || selectedVertexIds.has(vertex.id));

  if (candidates.length < 2) {
    return undefined;
  }

  const parent = new Map(candidates.map((vertex) => [vertex.id, vertex.id] as const));
  const threshold = Math.max(distance, epsilon);

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      if (lengthVec3(subVec3(candidates[leftIndex].position, candidates[rightIndex].position)) <= threshold) {
        unionVertexSets(parent, candidates[leftIndex].id, candidates[rightIndex].id);
      }
    }
  }

  const groups = new Map<VertexID, VertexID[]>();

  candidates.forEach((vertex) => {
    const root = findVertexSet(parent, vertex.id);
    const ids = groups.get(root) ?? [];

    ids.push(vertex.id);
    groups.set(root, ids);
  });

  const vertexById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex] as const));
  const replacements = new Map<VertexID, { id: VertexID; position: Vec3 }>();

  groups.forEach((groupVertexIds) => {
    if (groupVertexIds.length < 2) {
      return;
    }

    const groupVertices = groupVertexIds
      .map((vertexId) => vertexById.get(vertexId))
      .filter((vertex): vertex is NonNullable<typeof vertex> => Boolean(vertex));

    if (groupVertices.length < 2) {
      return;
    }

    const mergedPosition = averageVec3(groupVertices.map((vertex) => vertex.position));
    const mergedVertexId = groupVertexIds[0];

    groupVertexIds.forEach((vertexId) => {
      replacements.set(vertexId, {
        id: mergedVertexId,
        position: mergedPosition
      });
    });
  });

  return replacements.size > 0 ? rebuildMeshWithVertexReplacements(mesh, replacements) : undefined;
}

export function weldEditableMeshVerticesToTarget(
  mesh: EditableMesh,
  targetVertexId: VertexID,
  sourceVertexIds: VertexID[]
): EditableMesh | undefined {
  if (sourceVertexIds.length === 0) {
    return undefined;
  }

  const vertexById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex] as const));
  const target = vertexById.get(targetVertexId);

  if (!target) {
    return undefined;
  }

  const replacements = new Map<VertexID, { id: VertexID; position: Vec3 }>();

  sourceVertexIds.forEach((vertexId) => {
    if (vertexId === targetVertexId || !vertexById.has(vertexId)) {
      return;
    }

    replacements.set(vertexId, {
      id: targetVertexId,
      position: vec3(target.position.x, target.position.y, target.position.z)
    });
  });

  return replacements.size > 0 ? rebuildMeshWithVertexReplacements(mesh, replacements) : undefined;
}

function cloneMeshPolygon(polygon: MeshPolygonData): EditableMeshPolygon {
  return {
    id: polygon.id,
    materialId: polygon.materialId,
    positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
    uvScale: polygon.uvScale,
    vertexIds: [...polygon.vertexIds]
  };
}

function createPolygonLoop(
  id: FaceID,
  positions: Vec3[],
  vertexIds: VertexID[],
  materialId?: MeshPolygonData["materialId"],
  uvScale?: MeshPolygonData["uvScale"]
): EditableMeshPolygon | undefined {
  const compacted = compactPolygonLoop(positions, vertexIds);

  if (!compacted?.vertexIds) {
    return undefined;
  }

  return {
    id,
    materialId,
    positions: compacted.positions,
    uvScale,
    vertexIds: compacted.vertexIds
  };
}

function computeMinimumEdgeLength(polygon: MeshPolygonData) {
  return polygon.positions.reduce((minimum, position, index) => {
    const nextPosition = polygon.positions[(index + 1) % polygon.positions.length];
    return Math.min(minimum, lengthVec3(subVec3(nextPosition, position)));
  }, Number.POSITIVE_INFINITY);
}

function findQuadrangulatePair(polygons: MeshPolygonData[], epsilon: number): [FaceID, FaceID] | undefined {
  const edgeOwner = new Map<string, FaceID>();

  for (const polygon of polygons) {
    for (let index = 0; index < polygon.vertexIds.length; index += 1) {
      const edgeKey = makeUndirectedEdgeKey(
        polygon.vertexIds[index],
        polygon.vertexIds[(index + 1) % polygon.vertexIds.length]
      );
      const owner = edgeOwner.get(edgeKey);

      if (!owner) {
        edgeOwner.set(edgeKey, polygon.id);
        continue;
      }

      const ownerPolygon = polygons.find((candidate) => candidate.id === owner);

      if (!ownerPolygon) {
        continue;
      }

      if (Math.abs(Math.abs(dotVec3(normalizeVec3(ownerPolygon.normal), normalizeVec3(polygon.normal))) - 1) <= epsilon * 10) {
        return [ownerPolygon.id, polygon.id];
      }
    }
  }

  return undefined;
}

function resolveBoundaryEdgeOrientation(mesh: EditableMesh, edge: [VertexID, VertexID]) {
  const edgeKey = makeUndirectedEdgeKey(edge[0], edge[1]);
  const halfEdgesById = new Map(mesh.halfEdges.map((halfEdge) => [halfEdge.id, halfEdge] as const));

  for (const halfEdge of mesh.halfEdges) {
    if (halfEdge.twin || !halfEdge.next || !halfEdge.face) {
      continue;
    }

    const nextHalfEdge = halfEdgesById.get(halfEdge.next);

    if (!nextHalfEdge) {
      continue;
    }

    if (makeUndirectedEdgeKey(halfEdge.vertex, nextHalfEdge.vertex) === edgeKey) {
      return {
        endId: nextHalfEdge.vertex,
        faceId: halfEdge.face,
        startId: halfEdge.vertex
      };
    }
  }

  return undefined;
}

function collectUndirectedEdgeUsage(polygons: MeshPolygonData[]) {
  const counts = new Map<string, number>();

  polygons.forEach((polygon) => {
    polygon.vertexIds.forEach((vertexId, index) => {
      const nextVertexId = polygon.vertexIds[(index + 1) % polygon.vertexIds.length];
      const key = makeUndirectedEdgeKey(vertexId, nextVertexId);

      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return counts;
}

function rebuildMeshWithVertexReplacements(
  mesh: EditableMesh,
  replacements: Map<VertexID, { id: VertexID; position: Vec3 }>
): EditableMesh | undefined {
  const nextPolygons = getMeshPolygons(mesh).flatMap((polygon) => {
    const positions = polygon.positions.map((position, index) => {
      const replacement = replacements.get(polygon.vertexIds[index]);

      return replacement
        ? vec3(replacement.position.x, replacement.position.y, replacement.position.z)
        : vec3(position.x, position.y, position.z);
    });
    const vertexIds = polygon.vertexIds.map((vertexId) => replacements.get(vertexId)?.id ?? vertexId);
    const compacted = compactPolygonLoop(positions, vertexIds);

    if (!compacted?.vertexIds) {
      return [];
    }

    return [{
      id: polygon.id,
      materialId: polygon.materialId,
      positions: compacted.positions,
      uvScale: polygon.uvScale,
      vertexIds: compacted.vertexIds
    }];
  });

  return nextPolygons.length > 0 ? createEditableMeshFromPolygons(nextPolygons) : undefined;
}

function findVertexSet(parent: Map<VertexID, VertexID>, vertexId: VertexID): VertexID {
  const currentParent = parent.get(vertexId);

  if (!currentParent || currentParent === vertexId) {
    return vertexId;
  }

  const root = findVertexSet(parent, currentParent);
  parent.set(vertexId, root);
  return root;
}

function unionVertexSets(parent: Map<VertexID, VertexID>, left: VertexID, right: VertexID) {
  const leftRoot = findVertexSet(parent, left);
  const rightRoot = findVertexSet(parent, right);

  if (leftRoot !== rightRoot) {
    parent.set(rightRoot, leftRoot);
  }
}

function readAxis(point: Vec3, axis: "x" | "y" | "z") {
  return point[axis];
}

function mirrorPoint(point: Vec3, axis: "x" | "y" | "z") {
  return axis === "x"
    ? vec3(-point.x, point.y, point.z)
    : axis === "y"
      ? vec3(point.x, -point.y, point.z)
      : vec3(point.x, point.y, -point.z);
}

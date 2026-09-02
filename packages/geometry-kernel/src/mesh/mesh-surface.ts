import {
  addVec3,
  crossVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  vec2,
  vec3
} from "@blud/shared";
import type {
  ColorRGBA,
  EditableMesh,
  EditableMeshFace,
  FaceID,
  MaterialID,
  MeshMaterialSlot,
  MeshProjectedDecal,
  MeshTextureBlendLayer,
  MeshUvProjectionMode,
  Vec2,
  Vec3,
  VertexID
} from "@blud/shared";
import { getFaceVertexIds, getFaceVertices, triangulateMeshFace } from "./editable-mesh";

export type MeshUvProjectionOptions = {
  axis?: "x" | "y" | "z";
  faceIds?: FaceID[];
  margin?: number;
  mode: MeshUvProjectionMode;
  offset?: Vec2;
  scale?: Vec2;
};

export type MeshSmartUnwrapOptions = {
  angleThresholdDegrees?: number;
  faceIds?: FaceID[];
  margin?: number;
};

export type MeshTexelDensityOptions = {
  faceIds?: FaceID[];
  pixelsPerMeter?: number;
  textureResolution?: number;
};

export function projectEditableMeshUvs(mesh: EditableMesh, options: MeshUvProjectionOptions): EditableMesh {
  const next = cloneMesh(mesh);
  const faceIds = resolveFaceIds(next, options.faceIds);
  const bounds = computeMeshBounds(next);
  const scale = options.scale ?? vec2(1, 1);
  const offset = options.offset ?? vec2(0, 0);

  next.faces = next.faces.map((face) => {
    if (!faceIds.has(face.id)) {
      return face;
    }

    const vertices = getFaceVertices(next, face.id).map((vertex) => vertex.position);
    const normal = triangulateMeshFace(next, face.id)?.normal ?? vec3(0, 1, 0);
    const uvs =
      options.mode === "box"
        ? projectBoxUvs(vertices, normal, scale, offset)
        : options.mode === "cylindrical"
          ? projectCylindricalUvs(vertices, bounds, options.axis ?? "y", scale, offset)
          : projectPlanarUvs(vertices, normal, options.axis, scale, offset);

    return {
      ...face,
      uvScale: scale,
      uvs
    };
  });

  return next;
}

export function smartUnwrapEditableMesh(mesh: EditableMesh, options: MeshSmartUnwrapOptions = {}): EditableMesh {
  const thresholdRadians = ((options.angleThresholdDegrees ?? 66) * Math.PI) / 180;
  const faceIds = resolveFaceIds(mesh, options.faceIds);
  const normalsByFaceId = new Map<FaceID, Vec3>();

  mesh.faces.forEach((face) => {
    if (faceIds.has(face.id)) {
      normalsByFaceId.set(face.id, triangulateMeshFace(mesh, face.id)?.normal ?? vec3(0, 1, 0));
    }
  });

  const seams: Array<[VertexID, VertexID]> = [];
  const edgeFaces = buildUndirectedEdgeFaces(mesh);

  edgeFaces.forEach((faces, edgeKey) => {
    if (faces.length < 2) {
      seams.push(edgeKey.split(":") as [VertexID, VertexID]);
      return;
    }

    const [left, right] = faces;
    const leftNormal = normalsByFaceId.get(left);
    const rightNormal = normalsByFaceId.get(right);

    if (!leftNormal || !rightNormal) {
      return;
    }

    const dot = clamp(dotVec3(normalizeVec3(leftNormal), normalizeVec3(rightNormal)), -1, 1);
    const angle = Math.acos(dot);

    if (angle >= thresholdRadians) {
      seams.push(edgeKey.split(":") as [VertexID, VertexID]);
    }
  });

  const projected = projectEditableMeshUvs(mesh, {
    faceIds: Array.from(faceIds),
    mode: "box"
  });
  const marked = markEditableMeshUvSeams(projected, seams, { append: false });

  return packEditableMeshUvs(marked, {
    faceIds: Array.from(faceIds),
    margin: options.margin
  });
}

export function markEditableMeshUvSeams(
  mesh: EditableMesh,
  edges: Array<[VertexID, VertexID]>,
  options: { append?: boolean } = {}
): EditableMesh {
  const next = cloneMesh(mesh);
  const existing = options.append === false ? [] : next.surface?.uvSeams ?? [];
  const seamByKey = new Map(existing.map((seam) => [edgeKey(seam.edge[0], seam.edge[1]), seam]));

  edges.forEach((edge, index) => {
    const key = edgeKey(edge[0], edge[1]);
    seamByKey.set(key, {
      edge: key.split(":") as [VertexID, VertexID],
      id: seamByKey.get(key)?.id ?? `uv-seam:${key}:${index}`
    });
  });

  next.surface = {
    ...(next.surface ?? {}),
    uvSeams: Array.from(seamByKey.values()).sort((left, right) => edgeKey(left.edge[0], left.edge[1]).localeCompare(edgeKey(right.edge[0], right.edge[1])))
  };
  return next;
}

export function clearEditableMeshUvSeams(mesh: EditableMesh, edges?: Array<[VertexID, VertexID]>): EditableMesh {
  const next = cloneMesh(mesh);

  if (!edges?.length) {
    next.surface = {
      ...(next.surface ?? {}),
      uvSeams: []
    };
    return next;
  }

  const keys = new Set(edges.map((edge) => edgeKey(edge[0], edge[1])));
  next.surface = {
    ...(next.surface ?? {}),
    uvSeams: (next.surface?.uvSeams ?? []).filter((seam) => !keys.has(edgeKey(seam.edge[0], seam.edge[1])))
  };
  return next;
}

export function packEditableMeshUvs(
  mesh: EditableMesh,
  options: { faceIds?: FaceID[]; margin?: number } = {}
): EditableMesh {
  const next = cloneMesh(mesh);
  const faceIds = resolveFaceIds(next, options.faceIds);
  const margin = clamp(options.margin ?? 0.02, 0, 0.2);
  const islands = collectUvIslands(next, faceIds);

  if (islands.length === 0) {
    return next;
  }

  const grid = Math.ceil(Math.sqrt(islands.length));
  const cellSize = 1 / grid;

  islands
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((island, index) => {
      const column = index % grid;
      const row = Math.floor(index / grid);
      const targetMin = vec2(column * cellSize + margin * cellSize, row * cellSize + margin * cellSize);
      const targetSize = Math.max(0.0001, cellSize * (1 - margin * 2));
      const width = Math.max(0.0001, island.max.x - island.min.x);
      const height = Math.max(0.0001, island.max.y - island.min.y);
      const scale = targetSize / Math.max(width, height);

      next.faces = next.faces.map((face) => {
        if (!island.faceIds.includes(face.id) || !face.uvs) {
          return face;
        }

        return {
          ...face,
          uvIslandId: island.id,
          uvs: face.uvs.map((uv) =>
            vec2(
              targetMin.x + (uv.x - island.min.x) * scale,
              targetMin.y + (uv.y - island.min.y) * scale
            )
          )
        };
      });
    });

  return next;
}

export function transformEditableMeshUvIsland(
  mesh: EditableMesh,
  islandId: string,
  transform: { offset?: Vec2; rotationRadians?: number; scale?: Vec2 }
): EditableMesh {
  const next = cloneMesh(mesh);
  const faces = next.faces.filter((face) => face.uvIslandId === islandId && face.uvs?.length);
  const allUvs = faces.flatMap((face) => face.uvs ?? []);

  if (allUvs.length === 0) {
    return next;
  }

  const center = averageUv(allUvs);
  const cos = Math.cos(transform.rotationRadians ?? 0);
  const sin = Math.sin(transform.rotationRadians ?? 0);
  const scale = transform.scale ?? vec2(1, 1);
  const offset = transform.offset ?? vec2(0, 0);

  next.faces = next.faces.map((face) => {
    if (face.uvIslandId !== islandId || !face.uvs) {
      return face;
    }

    return {
      ...face,
      uvs: face.uvs.map((uv) => {
        const x = (uv.x - center.x) * scale.x;
        const y = (uv.y - center.y) * scale.y;
        return vec2(center.x + x * cos - y * sin + offset.x, center.y + x * sin + y * cos + offset.y);
      })
    };
  });

  return next;
}

export function normalizeEditableMeshTexelDensity(
  mesh: EditableMesh,
  options: MeshTexelDensityOptions = {}
): EditableMesh {
  const next = cloneMesh(mesh);
  const faceIds = resolveFaceIds(next, options.faceIds);
  const pixelsPerMeter = Math.max(1, options.pixelsPerMeter ?? next.surface?.texelDensity?.pixelsPerMeter ?? 512);
  const textureResolution = Math.max(1, options.textureResolution ?? next.surface?.texelDensity?.textureResolution ?? 1024);
  const uvUnitsPerMeter = pixelsPerMeter / textureResolution;

  next.faces = next.faces.map((face) => {
    if (!faceIds.has(face.id)) {
      return face;
    }

    const vertices = getFaceVertices(next, face.id).map((vertex) => vertex.position);
    const normal = triangulateMeshFace(next, face.id)?.normal ?? vec3(0, 1, 0);
    const faceUvs = face.uvs && face.uvs.length === vertices.length
      ? face.uvs
      : projectPlanarUvs(vertices, normal, undefined, vec2(1, 1), vec2(0, 0));
    const worldArea = polygonArea3D(vertices);
    const uvArea = Math.max(0.000001, polygonArea2D(faceUvs));
    const targetUvArea = Math.max(0.000001, worldArea * uvUnitsPerMeter * uvUnitsPerMeter);
    const factor = Math.sqrt(targetUvArea / uvArea);
    const center = averageUv(faceUvs);

    return {
      ...face,
      uvs: faceUvs.map((uv) => vec2(center.x + (uv.x - center.x) * factor, center.y + (uv.y - center.y) * factor))
    };
  });

  next.surface = {
    ...(next.surface ?? {}),
    texelDensity: {
      pixelsPerMeter,
      textureResolution
    }
  };

  return next;
}

export function assignEditableMeshMaterialSlot(
  mesh: EditableMesh,
  materialId: MaterialID,
  options: { name?: string; slotId?: string } = {}
): EditableMesh {
  const next = cloneMesh(mesh);
  const slots = next.surface?.materialSlots ?? [];
  const existing = slots.find((slot) => slot.materialId === materialId || slot.id === options.slotId);
  const materialSlots: MeshMaterialSlot[] = existing
    ? slots.map((slot) => slot.id === existing.id ? { ...slot, materialId, name: options.name ?? slot.name } : slot)
    : [
        ...slots,
        {
          id: options.slotId ?? `slot:${materialId}`,
          materialId,
          name: options.name
        }
      ];

  next.surface = {
    ...(next.surface ?? {}),
    materialSlots
  };
  return next;
}

export function paintEditableMeshFacesMaterial(
  mesh: EditableMesh,
  faceIds: FaceID[],
  materialId: MaterialID
): EditableMesh {
  const next = assignEditableMeshMaterialSlot(mesh, materialId);
  const targets = resolveFaceIds(next, faceIds);

  next.faces = next.faces.map((face) => targets.has(face.id) ? { ...face, materialId } : face);
  return next;
}

export function paintEditableMeshVertexColors(
  mesh: EditableMesh,
  faceIds: FaceID[],
  color: ColorRGBA,
  strength = 1
): EditableMesh {
  const next = cloneMesh(mesh);
  const targets = resolveFaceIds(next, faceIds);
  const amount = clamp01(strength);
  const nextColor = normalizeColor(color);

  next.faces = next.faces.map((face) => {
    if (!targets.has(face.id)) {
      return face;
    }

    const vertexCount = getFaceVertexIds(next, face.id).length;
    const existing = face.vertexColors ?? [];

    return {
      ...face,
      vertexColors: Array.from({ length: vertexCount }, (_, index) => mixColor(existing[index] ?? WHITE, nextColor, amount))
    };
  });

  return next;
}

export function upsertEditableMeshBlendLayer(mesh: EditableMesh, layer: MeshTextureBlendLayer): EditableMesh {
  const next = cloneMesh(mesh);
  const layers = next.surface?.blendLayers ?? [];

  next.surface = {
    ...(next.surface ?? {}),
    blendLayers: layers.some((entry) => entry.id === layer.id)
      ? layers.map((entry) => entry.id === layer.id ? { ...entry, ...layer } : entry)
      : [...layers, layer].slice(0, 4)
  };
  return next;
}

export function paintEditableMeshTextureBlend(
  mesh: EditableMesh,
  faceIds: FaceID[],
  layerId: string,
  strength = 1
): EditableMesh {
  const next = cloneMesh(mesh);
  const targets = resolveFaceIds(next, faceIds);
  const amount = clamp01(strength);

  next.faces = next.faces.map((face) => {
    if (!targets.has(face.id)) {
      return face;
    }

    const vertexCount = getFaceVertexIds(next, face.id).length;
    const existing = face.blendWeights ?? [];

    return {
      ...face,
      blendWeights: Array.from({ length: vertexCount }, (_, index) =>
        normalizeBlendWeights({
          ...(existing[index] ?? {}),
          [layerId]: (existing[index]?.[layerId] ?? 0) + amount
        })
      )
    };
  });

  return next;
}

export function addEditableMeshProjectedDecal(mesh: EditableMesh, decal: MeshProjectedDecal): EditableMesh {
  const next = cloneMesh(mesh);

  next.surface = {
    ...(next.surface ?? {}),
    decals: [
      ...(next.surface?.decals ?? []).filter((entry) => entry.id !== decal.id),
      {
        blendMode: "normal",
        color: "#ffffff",
        depth: 0.2,
        opacity: 1,
        ...decal,
        normal: normalizeVec3(decal.normal),
        up: normalizeVec3(decal.up ?? vec3(0, 1, 0))
      }
    ]
  };

  return next;
}

export function removeEditableMeshProjectedDecal(mesh: EditableMesh, decalId: string): EditableMesh {
  const next = cloneMesh(mesh);

  next.surface = {
    ...(next.surface ?? {}),
    decals: (next.surface?.decals ?? []).filter((decal) => decal.id !== decalId)
  };
  return next;
}

function cloneMesh(mesh: EditableMesh): EditableMesh {
  return structuredClone(mesh);
}

function resolveFaceIds(mesh: EditableMesh, faceIds?: FaceID[]) {
  const ids = faceIds?.length ? faceIds : mesh.faces.map((face) => face.id);
  return new Set(ids);
}

function projectPlanarUvs(vertices: Vec3[], normal: Vec3, axis: "x" | "y" | "z" | undefined, scale: Vec2, offset: Vec2) {
  const basis = axis ? axisBasis(axis) : createFacePlaneBasis(normal);
  const origin = vertices[0] ?? vec3(0, 0, 0);
  return vertices.map((vertex) => {
    const local = subVec3(vertex, origin);
    return vec2(dotVec3(local, basis.u) * safeScale(scale.x) + offset.x, dotVec3(local, basis.v) * safeScale(scale.y) + offset.y);
  });
}

function projectBoxUvs(vertices: Vec3[], normal: Vec3, scale: Vec2, offset: Vec2) {
  const abs = {
    x: Math.abs(normal.x),
    y: Math.abs(normal.y),
    z: Math.abs(normal.z)
  };
  const axis = abs.x >= abs.y && abs.x >= abs.z ? "x" : abs.y >= abs.z ? "y" : "z";
  return projectPlanarUvs(vertices, normal, axis, scale, offset);
}

function projectCylindricalUvs(
  vertices: Vec3[],
  bounds: { center: Vec3; max: Vec3; min: Vec3 },
  axis: "x" | "y" | "z",
  scale: Vec2,
  offset: Vec2
) {
  const height = Math.max(0.0001, bounds.max[axis] - bounds.min[axis]);

  return vertices.map((vertex) => {
    const axial = (vertex[axis] - bounds.min[axis]) / height;
    const radial =
      axis === "x"
        ? Math.atan2(vertex.z - bounds.center.z, vertex.y - bounds.center.y)
        : axis === "z"
          ? Math.atan2(vertex.y - bounds.center.y, vertex.x - bounds.center.x)
          : Math.atan2(vertex.x - bounds.center.x, vertex.z - bounds.center.z);

    return vec2(((radial / (Math.PI * 2)) + 0.5) * safeScale(scale.x) + offset.x, axial * safeScale(scale.y) + offset.y);
  });
}

function createFacePlaneBasis(normal: Vec3) {
  const normalizedNormal = normalizeVec3(normal);
  const reference = Math.abs(normalizedNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, normalizedNormal));
  const v = normalizeVec3(crossVec3(normalizedNormal, u));

  return { u, v };
}

function axisBasis(axis: "x" | "y" | "z") {
  switch (axis) {
    case "x":
      return { u: vec3(0, 0, 1), v: vec3(0, 1, 0) };
    case "y":
      return { u: vec3(1, 0, 0), v: vec3(0, 0, 1) };
    case "z":
      return { u: vec3(1, 0, 0), v: vec3(0, 1, 0) };
  }
}

function computeMeshBounds(mesh: EditableMesh) {
  if (mesh.vertices.length === 0) {
    return {
      center: vec3(0, 0, 0),
      max: vec3(1, 1, 1),
      min: vec3(-1, -1, -1)
    };
  }

  const min = vec3(Infinity, Infinity, Infinity);
  const max = vec3(-Infinity, -Infinity, -Infinity);

  mesh.vertices.forEach((vertex) => {
    min.x = Math.min(min.x, vertex.position.x);
    min.y = Math.min(min.y, vertex.position.y);
    min.z = Math.min(min.z, vertex.position.z);
    max.x = Math.max(max.x, vertex.position.x);
    max.y = Math.max(max.y, vertex.position.y);
    max.z = Math.max(max.z, vertex.position.z);
  });

  return {
    center: scaleVec3(addVec3(min, max), 0.5),
    max,
    min
  };
}

function buildUndirectedEdgeFaces(mesh: EditableMesh) {
  const result = new Map<string, FaceID[]>();

  mesh.faces.forEach((face) => {
    const vertexIds = getFaceVertexIds(mesh, face.id);

    vertexIds.forEach((vertexId, index) => {
      const nextVertexId = vertexIds[(index + 1) % vertexIds.length];
      const key = edgeKey(vertexId, nextVertexId);
      const faces = result.get(key) ?? [];
      faces.push(face.id);
      result.set(key, faces);
    });
  });

  return result;
}

function collectUvIslands(mesh: EditableMesh, faceIds: Set<FaceID>) {
  const islands = new Map<string, { faceIds: FaceID[]; id: string; max: Vec2; min: Vec2 }>();

  mesh.faces.forEach((face) => {
    if (!faceIds.has(face.id)) {
      return;
    }

    const vertices = getFaceVertices(mesh, face.id).map((vertex) => vertex.position);
    const normal = triangulateMeshFace(mesh, face.id)?.normal ?? vec3(0, 1, 0);
    const uvs = face.uvs && face.uvs.length === vertices.length
      ? face.uvs
      : projectPlanarUvs(vertices, normal, undefined, vec2(1, 1), vec2(0, 0));
    face.uvs = uvs;
    const id = face.uvIslandId ?? `island:${face.id}`;
    const island = islands.get(id) ?? {
      faceIds: [],
      id,
      max: vec2(-Infinity, -Infinity),
      min: vec2(Infinity, Infinity)
    };

    island.faceIds.push(face.id);
    uvs.forEach((uv) => {
      island.min.x = Math.min(island.min.x, uv.x);
      island.min.y = Math.min(island.min.y, uv.y);
      island.max.x = Math.max(island.max.x, uv.x);
      island.max.y = Math.max(island.max.y, uv.y);
    });
    islands.set(id, island);
  });

  return Array.from(islands.values()).filter((island) => Number.isFinite(island.min.x) && Number.isFinite(island.max.x));
}

function polygonArea3D(vertices: Vec3[]) {
  if (vertices.length < 3) {
    return 0;
  }

  const origin = vertices[0];
  let area = 0;

  for (let index = 1; index < vertices.length - 1; index += 1) {
    area += lengthVec3(crossVec3(subVec3(vertices[index], origin), subVec3(vertices[index + 1], origin))) * 0.5;
  }

  return area;
}

function polygonArea2D(uvs: Vec2[]) {
  if (uvs.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < uvs.length; index += 1) {
    const next = uvs[(index + 1) % uvs.length];
    area += uvs[index].x * next.y - next.x * uvs[index].y;
  }

  return Math.abs(area) * 0.5;
}

function averageUv(uvs: Vec2[]) {
  const total = uvs.reduce((sum, uv) => vec2(sum.x + uv.x, sum.y + uv.y), vec2(0, 0));
  return vec2(total.x / uvs.length, total.y / uvs.length);
}

function normalizeBlendWeights(weights: Record<string, number>) {
  const entries = Object.entries(weights)
    .map(([id, value]) => [id, Math.max(0, value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 4);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0.000001) {
    return {};
  }

  return Object.fromEntries(entries.map(([id, value]) => [id, value / total]));
}

function normalizeColor(color: ColorRGBA): ColorRGBA {
  return {
    a: clamp01(color.a ?? 1),
    b: clamp01(color.b),
    g: clamp01(color.g),
    r: clamp01(color.r)
  };
}

function mixColor(left: ColorRGBA, right: ColorRGBA, amount: number): ColorRGBA {
  return {
    a: clamp01((left.a ?? 1) + ((right.a ?? 1) - (left.a ?? 1)) * amount),
    b: clamp01(left.b + (right.b - left.b) * amount),
    g: clamp01(left.g + (right.g - left.g) * amount),
    r: clamp01(left.r + (right.r - left.r) * amount)
  };
}

function safeScale(value: number) {
  return Math.abs(value) <= 0.0001 ? 1 : value;
}

function edgeKey(left: VertexID, right: VertexID) {
  return [left, right].sort().join(":");
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const WHITE: ColorRGBA = { a: 1, b: 1, g: 1, r: 1 };

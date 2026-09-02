import type {
  EditableMesh,
  EditableMeshModelingData,
  EditableMeshTopology,
  MeshLatticeModifier,
  MeshModelingModifier,
  MeshRemeshModifier,
  MeshRetopoModifier,
  Vec3
} from "@blud/shared";
import {
  addVec3,
  averageVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  vec3
} from "@blud/shared";
import {
  quadrangulateEditableMeshFaces,
  solidifyEditableMesh,
  triangulateEditableMeshFaces,
  weldEditableMeshVerticesByDistance
} from "./mesh-ops/advanced-ops";
import { mirrorEditableMesh } from "./mesh-ops/advanced-ops";

export function cloneEditableMeshTopology(topology: EditableMeshTopology): EditableMeshTopology {
  return {
    faces: structuredClone(topology.faces),
    halfEdges: structuredClone(topology.halfEdges),
    vertices: structuredClone(topology.vertices)
  };
}

export function stripEditableMeshToTopology(mesh: EditableMesh): EditableMeshTopology {
  return cloneEditableMeshTopology(mesh);
}

export function initializeEditableMeshModeling(mesh: EditableMesh): EditableMesh {
  if (mesh.modeling?.baseTopology) {
    return structuredClone(mesh);
  }

  return {
    ...structuredClone(mesh),
    modeling: {
      ...structuredClone(mesh.modeling ?? {}),
      baseTopology: stripEditableMeshToTopology(mesh)
    }
  };
}

export function applyEditableMeshModeling(mesh: EditableMesh): EditableMesh {
  const prepared = initializeEditableMeshModeling(mesh);
  const baseTopology = prepared.modeling?.baseTopology ?? stripEditableMeshToTopology(prepared);
  const modeling = structuredClone(prepared.modeling ?? {});
  let result: EditableMesh = {
    ...cloneEditableMeshTopology(baseTopology),
    modeling,
    physics: structuredClone(prepared.physics),
    role: prepared.role
  };

  (modeling.modifiers ?? [])
    .filter((modifier) => modifier.enabled)
    .forEach((modifier) => {
      result = applyModifier(result, modifier);
    });

  if (modeling.symmetry?.enabled) {
    const mirrored = mirrorEditableMesh(result, modeling.symmetry.axis);

    if (mirrored) {
      result = {
        ...mirrored,
        modeling,
        physics: structuredClone(prepared.physics),
        role: prepared.role
      };
    }
  }

  return {
    ...result,
    modeling,
    physics: structuredClone(prepared.physics),
    role: prepared.role
  };
}

export function updateEditableMeshModeling(
  mesh: EditableMesh,
  modeling: EditableMeshModelingData
): EditableMesh {
  const initialized = initializeEditableMeshModeling(mesh);

  return applyEditableMeshModeling({
    ...initialized,
    modeling: {
      ...structuredClone(initialized.modeling ?? {}),
      ...structuredClone(modeling),
      baseTopology: structuredClone(modeling.baseTopology ?? initialized.modeling?.baseTopology)
    }
  });
}

export function captureEditableMeshModelingBase(mesh: EditableMesh): EditableMesh {
  return {
    ...structuredClone(mesh),
    modeling: {
      ...structuredClone(mesh.modeling ?? {}),
      baseTopology: stripEditableMeshToTopology(mesh)
    }
  };
}

function applyModifier(mesh: EditableMesh, modifier: MeshModelingModifier): EditableMesh {
  switch (modifier.type) {
    case "boolean":
      return mesh;
    case "mirror": {
      const mirrored = mirrorEditableMesh(mesh, modifier.axis);
      return mirrored ? preserveMeshMeta(mirrored, mesh) : mesh;
    }
    case "solidify": {
      const solidified = solidifyEditableMesh(mesh, modifier.thickness);
      return solidified ? preserveMeshMeta(solidified, mesh) : mesh;
    }
    case "lattice":
      return preserveMeshMeta(applyLatticeModifier(mesh, modifier), mesh);
    case "remesh":
      return preserveMeshMeta(applyRemeshModifier(mesh, modifier), mesh);
    case "retopo":
      return preserveMeshMeta(applyRetopoModifier(mesh, modifier), mesh);
  }
}

function applyLatticeModifier(mesh: EditableMesh, modifier: MeshLatticeModifier): EditableMesh {
  const bounds = computeMeshBounds(mesh.vertices.map((vertex) => vertex.position));
  const axisLength = Math.max(bounds.size[modifier.axis], 0.0001);
  const center = averageVec3(mesh.vertices.map((vertex) => vertex.position));
  const intensity = modifier.intensity;
  const falloff = Math.max(0, modifier.falloff);

  return {
    ...structuredClone(mesh),
    vertices: mesh.vertices.map((vertex) => {
      const local = subVec3(vertex.position, center);
      const axisPosition = (vertex.position[modifier.axis] - bounds.min[modifier.axis]) / axisLength;
      const weighted = intensity * Math.pow(axisPosition, Math.max(0.2, falloff));

      switch (modifier.mode) {
        case "bend": {
          const angle = weighted;
          const primary = modifier.axis === "x" ? local.x : modifier.axis === "y" ? local.y : local.z;
          const secondary = modifier.axis === "y" ? local.z : local.y;
          const bent = rotatePlane(primary, secondary, angle);

          return {
            ...vertex,
            position:
              modifier.axis === "x"
                ? addVec3(center, vec3(local.x, bent.secondary, bent.primary))
                : modifier.axis === "y"
                  ? addVec3(center, vec3(local.x, local.y, bent.secondary))
                  : addVec3(center, vec3(bent.secondary, local.y, local.z))
          };
        }
        case "twist": {
          const angle = weighted * Math.PI;
          const twisted =
            modifier.axis === "x"
              ? rotatePlane(local.y, local.z, angle)
              : modifier.axis === "y"
                ? rotatePlane(local.x, local.z, angle)
                : rotatePlane(local.x, local.y, angle);

          return {
            ...vertex,
            position:
              modifier.axis === "x"
                ? addVec3(center, vec3(local.x, twisted.primary, twisted.secondary))
                : modifier.axis === "y"
                  ? addVec3(center, vec3(twisted.primary, local.y, twisted.secondary))
                  : addVec3(center, vec3(twisted.primary, twisted.secondary, local.z))
          };
        }
        case "taper": {
          const scale = 1 + weighted;
          return {
            ...vertex,
            position:
              modifier.axis === "x"
                ? addVec3(center, vec3(local.x, local.y * scale, local.z * scale))
                : modifier.axis === "y"
                  ? addVec3(center, vec3(local.x * scale, local.y, local.z * scale))
                  : addVec3(center, vec3(local.x * scale, local.y * scale, local.z))
          };
        }
        case "shear":
        default: {
          const shearOffset = weighted * 0.5;
          return {
            ...vertex,
            position:
              modifier.axis === "x"
                ? addVec3(center, vec3(local.x, local.y + local.x * shearOffset, local.z))
                : modifier.axis === "y"
                  ? addVec3(center, vec3(local.x + local.y * shearOffset, local.y, local.z))
                  : addVec3(center, vec3(local.x, local.y + local.z * shearOffset, local.z))
          };
        }
      }
    })
  };
}

function applyRemeshModifier(mesh: EditableMesh, modifier: MeshRemeshModifier): EditableMesh {
  if (modifier.mode === "cleanup") {
    const welded = weldEditableMeshVerticesByDistance(mesh, Math.max(0.0001, modifier.weldDistance));
    return welded ?? mesh;
  }

  const triangulated = triangulateEditableMeshFaces(mesh) ?? mesh;

  if (modifier.mode === "quad") {
    const allFaceIds = triangulated.faces.map((face) => face.id);
    return quadrangulateEditableMeshFaces(triangulated, allFaceIds) ?? triangulated;
  }

  return triangulated;
}

function applyRetopoModifier(mesh: EditableMesh, modifier: MeshRetopoModifier): EditableMesh {
  if (mesh.faces.length <= modifier.targetFaceCount) {
    return mesh;
  }

  const triangulated = triangulateEditableMeshFaces(mesh) ?? mesh;

  if (modifier.preserveBorders) {
    return triangulated;
  }

  const groupedFaceIds = triangulated.faces.map((face) => face.id);
  return quadrangulateEditableMeshFaces(triangulated, groupedFaceIds) ?? triangulated;
}

function preserveMeshMeta(nextMesh: EditableMesh, sourceMesh: EditableMesh): EditableMesh {
  return {
    ...nextMesh,
    modeling: structuredClone(sourceMesh.modeling),
    physics: structuredClone(sourceMesh.physics),
    role: sourceMesh.role
  };
}

function computeMeshBounds(points: Vec3[]) {
  const min = vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  points.forEach((point) => {
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  });

  return {
    max,
    min,
    size: vec3(max.x - min.x, max.y - min.y, max.z - min.z)
  };
}

function rotatePlane(primary: number, secondary: number, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return {
    primary: primary * cosine - secondary * sine,
    secondary: primary * sine + secondary * cosine
  };
}

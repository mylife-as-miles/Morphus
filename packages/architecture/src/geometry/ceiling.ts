import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh } from "@blud/shared";

export function buildCeiling(params: {
  width: number;
  depth: number;
  thickness: number;
  height: number;
  materialId?: string;
}): EditableMesh {
  const width = Math.max(0.1, params.width);
  const depth = Math.max(0.1, params.depth);
  const thickness = Math.max(0.1, params.thickness);
  const height = params.height;
  const { materialId } = params;

  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const bottom = height;
  const top = height + thickness;

  const polygons: EditableMeshPolygon[] = [
    // Top face
    { materialId, positions: [vec3(-halfW, top, halfD), vec3(halfW, top, halfD), vec3(halfW, top, -halfD), vec3(-halfW, top, -halfD)] },
    // Bottom face
    { materialId, positions: [vec3(halfW, bottom, halfD), vec3(-halfW, bottom, halfD), vec3(-halfW, bottom, -halfD), vec3(halfW, bottom, -halfD)] },
    // Front face (+Z)
    { materialId, positions: [vec3(-halfW, bottom, halfD), vec3(halfW, bottom, halfD), vec3(halfW, top, halfD), vec3(-halfW, top, halfD)] },
    // Back face (-Z)
    { materialId, positions: [vec3(halfW, bottom, -halfD), vec3(-halfW, bottom, -halfD), vec3(-halfW, top, -halfD), vec3(halfW, top, -halfD)] },
    // Left face (-X)
    { materialId, positions: [vec3(-halfW, bottom, -halfD), vec3(-halfW, bottom, halfD), vec3(-halfW, top, halfD), vec3(-halfW, top, -halfD)] },
    // Right face (+X)
    { materialId, positions: [vec3(halfW, bottom, halfD), vec3(halfW, bottom, -halfD), vec3(halfW, top, -halfD), vec3(halfW, top, halfD)] },
  ];

  return createEditableMeshFromPolygons(polygons);
}

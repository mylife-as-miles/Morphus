import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh } from "@blud/shared";

export function buildWall(params: {
  width: number;
  height: number;
  thickness: number;
  materialId?: string;
}): EditableMesh {
  const width = Math.max(0.1, params.width);
  const height = Math.max(0.1, params.height);
  const thickness = Math.max(0.1, params.thickness);
  const { materialId } = params;

  const halfW = width * 0.5;
  const halfT = thickness * 0.5;

  const polygons: EditableMeshPolygon[] = [
    // Front face (+Z)
    { materialId, positions: [vec3(-halfW, 0, halfT), vec3(halfW, 0, halfT), vec3(halfW, height, halfT), vec3(-halfW, height, halfT)] },
    // Back face (-Z)
    { materialId, positions: [vec3(halfW, 0, -halfT), vec3(-halfW, 0, -halfT), vec3(-halfW, height, -halfT), vec3(halfW, height, -halfT)] },
    // Top face (+Y)
    { materialId, positions: [vec3(-halfW, height, halfT), vec3(halfW, height, halfT), vec3(halfW, height, -halfT), vec3(-halfW, height, -halfT)] },
    // Bottom face (Y=0)
    { materialId, positions: [vec3(halfW, 0, halfT), vec3(-halfW, 0, halfT), vec3(-halfW, 0, -halfT), vec3(halfW, 0, -halfT)] },
    // Left face (-X)
    { materialId, positions: [vec3(-halfW, 0, -halfT), vec3(-halfW, 0, halfT), vec3(-halfW, height, halfT), vec3(-halfW, height, -halfT)] },
    // Right face (+X)
    { materialId, positions: [vec3(halfW, 0, halfT), vec3(halfW, 0, -halfT), vec3(halfW, height, -halfT), vec3(halfW, height, halfT)] },
  ];

  return createEditableMeshFromPolygons(polygons);
}

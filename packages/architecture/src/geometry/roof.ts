import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh } from "@blud/shared";

export function buildRoof(params: {
  width: number;
  depth: number;
  pitchAngle: number;
  overhang: number;
  materialId?: string;
}): EditableMesh {
  const width = Math.max(0.1, params.width);
  const depth = Math.max(0.1, params.depth);
  const pitchAngle = Math.max(0, Math.min(89, params.pitchAngle));
  const overhang = Math.max(0, params.overhang);
  const { materialId } = params;

  const totalW = width + overhang * 2;
  const totalD = depth + overhang * 2;
  const halfW = totalW * 0.5;
  const halfD = totalD * 0.5;

  // Flat roof
  if (pitchAngle === 0) {
    const t = 0.1;
    const polygons: EditableMeshPolygon[] = [
      { materialId, positions: [vec3(-halfW, t, halfD), vec3(halfW, t, halfD), vec3(halfW, t, -halfD), vec3(-halfW, t, -halfD)] },
      { materialId, positions: [vec3(halfW, 0, halfD), vec3(-halfW, 0, halfD), vec3(-halfW, 0, -halfD), vec3(halfW, 0, -halfD)] },
      { materialId, positions: [vec3(-halfW, 0, halfD), vec3(halfW, 0, halfD), vec3(halfW, t, halfD), vec3(-halfW, t, halfD)] },
      { materialId, positions: [vec3(halfW, 0, -halfD), vec3(-halfW, 0, -halfD), vec3(-halfW, t, -halfD), vec3(halfW, t, -halfD)] },
      { materialId, positions: [vec3(-halfW, 0, -halfD), vec3(-halfW, 0, halfD), vec3(-halfW, t, halfD), vec3(-halfW, t, -halfD)] },
      { materialId, positions: [vec3(halfW, 0, halfD), vec3(halfW, 0, -halfD), vec3(halfW, t, -halfD), vec3(halfW, t, halfD)] },
    ];
    return createEditableMeshFromPolygons(polygons);
  }

  // Pitched (gabled) roof — ridge runs along Z (depth) axis
  const ridgeHeight = Math.tan((pitchAngle * Math.PI) / 180) * (totalW * 0.5);

  const polygons: EditableMeshPolygon[] = [
    // Left slope
    { materialId, positions: [vec3(-halfW, 0, halfD), vec3(0, ridgeHeight, halfD), vec3(0, ridgeHeight, -halfD), vec3(-halfW, 0, -halfD)] },
    // Right slope
    { materialId, positions: [vec3(halfW, 0, -halfD), vec3(0, ridgeHeight, -halfD), vec3(0, ridgeHeight, halfD), vec3(halfW, 0, halfD)] },
    // Front gable triangle (+Z)
    { materialId, positions: [vec3(-halfW, 0, halfD), vec3(halfW, 0, halfD), vec3(0, ridgeHeight, halfD)] },
    // Back gable triangle (-Z)
    { materialId, positions: [vec3(halfW, 0, -halfD), vec3(-halfW, 0, -halfD), vec3(0, ridgeHeight, -halfD)] },
    // Bottom face
    { materialId, positions: [vec3(halfW, 0, halfD), vec3(-halfW, 0, halfD), vec3(-halfW, 0, -halfD), vec3(halfW, 0, -halfD)] },
  ];

  return createEditableMeshFromPolygons(polygons);
}

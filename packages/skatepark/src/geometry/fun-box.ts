import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh } from "@blud/shared";

export function buildFunBox(params: {
  width: number;
  height: number;
  length: number;
  rampLength: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, length, rampLength, materialId } = params;
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  
  const polygons: EditableMeshPolygon[] = [];
  
  // Top Deck
  polygons.push({
    materialId,
    positions: [
      vec3(-halfW, height, halfL),
      vec3(halfW, height, halfL),
      vec3(halfW, height, -halfL),
      vec3(-halfW, height, -halfL)
    ]
  });
  
  // Front Ramp
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, 0, halfL + rampLength),
        vec3(halfW, 0, halfL + rampLength),
        vec3(halfW, height, halfL),
        vec3(-halfW, height, halfL)
    ]
  });
  
  // Back Ramp
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, height, -halfL),
        vec3(halfW, height, -halfL),
        vec3(halfW, 0, -halfL - rampLength),
        vec3(-halfW, 0, -halfL - rampLength)
    ]
  });

  // Left Side
  polygons.push({
    materialId,
    positions: [
      vec3(-halfW, 0, halfL + rampLength),
      vec3(-halfW, height, halfL),
      vec3(-halfW, height, -halfL),
      vec3(-halfW, 0, -halfL - rampLength)
    ]
  });
  
  // Right Side
  polygons.push({
    materialId,
    positions: [
      vec3(halfW, 0, -halfL - rampLength),
      vec3(halfW, height, -halfL),
      vec3(halfW, height, halfL),
      vec3(halfW, 0, halfL + rampLength)
    ]
  });

  // Bottom
  polygons.push({
    materialId,
    positions: [
      vec3(-halfW, 0, -halfL - rampLength),
      vec3(halfW, 0, -halfL - rampLength),
      vec3(halfW, 0, halfL + rampLength),
      vec3(-halfW, 0, halfL + rampLength)
    ]
  });

  return createEditableMeshFromPolygons(polygons);
}

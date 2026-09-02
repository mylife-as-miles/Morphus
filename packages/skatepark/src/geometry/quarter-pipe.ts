import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh, type Vec3 } from "@blud/shared";

export function buildQuarterPipe(params: {
  width: number;
  height: number;
  radius: number;
  segments: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, radius, segments, materialId } = params;
  const halfW = width * 0.5;
  const deckDepth = 1.0;
  
  const polygons: EditableMeshPolygon[] = [];
  
  // Build the curve points
  const points: Vec3[] = [];
  points.push(vec3(0, 0, radius)); // Bottom edge
  
  for (let i = 1; i < segments; i++) {
    const angle = (Math.PI / 2) * (i / segments);
    const xDist = radius - Math.cos(angle) * radius;
    const yDist = Math.sin(angle) * radius;
    points.push(vec3(0, yDist, radius - xDist));
  }
  
  points.push(vec3(0, height, 0)); // Coping edge
  points.push(vec3(0, height, -deckDepth)); // Back deck edge
  points.push(vec3(0, 0, -deckDepth)); // Back bottom edge
  
  // Curve + Deck faces
  for (let i = 0; i < points.length - 2; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    polygons.push({
      materialId,
      positions: [
        vec3(-halfW, p1.y, p1.z),
        vec3(halfW, p1.y, p1.z),
        vec3(halfW, p2.y, p2.z),
        vec3(-halfW, p2.y, p2.z)
      ]
    });
  }
  
  // Back face
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, height, -deckDepth),
        vec3(halfW, height, -deckDepth),
        vec3(halfW, 0, -deckDepth),
        vec3(-halfW, 0, -deckDepth)
      ]
  });
  
  // Bottom face
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, 0, -deckDepth),
        vec3(halfW, 0, -deckDepth),
        vec3(halfW, 0, radius),
        vec3(-halfW, 0, radius)
      ]
  });

  // Left and right side walls
  const sidePositionsLeft: Vec3[] = [];
  const sidePositionsRight: Vec3[] = [];
  
  for (let i = 0; i < points.length; i++) {
    sidePositionsLeft.push(vec3(-halfW, points[i].y, points[i].z));
    sidePositionsRight.push(vec3(halfW, points[i].y, points[i].z));
  }
  
  polygons.push({
    materialId,
    positions: sidePositionsLeft,
  });
  
  // Reverse right side for proper winding
  polygons.push({
    materialId,
    positions: sidePositionsRight.reverse(),
  });

  return createEditableMeshFromPolygons(polygons);
}

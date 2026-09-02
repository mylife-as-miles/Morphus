import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh, type Vec3 } from "@blud/shared";

export function buildHalfPipe(params: {
  width: number;
  height: number;
  flatLength: number;
  radius: number;
  segments: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, flatLength, radius, segments, materialId } = params;
  const halfW = width * 0.5;
  const halfFlat = flatLength * 0.5;
  const deckDepth = 1.0;
  
  const polygons: EditableMeshPolygon[] = [];
  
  // Left side points
  const pointsLeft: Vec3[] = [];
  pointsLeft.push(vec3(0, height, -halfFlat - radius - deckDepth));
  pointsLeft.push(vec3(0, height, -halfFlat - radius));
  
  for (let i = segments - 1; i >= 0; i--) {
    const angle = (Math.PI / 2) * (i / segments);
    const xDist = radius - Math.cos(angle) * radius;
    const yDist = Math.sin(angle) * radius;
    pointsLeft.push(vec3(0, yDist, -halfFlat - radius + xDist));
  }
  
  // Right side points
  const pointsRight: Vec3[] = [];
  for (let i = 1; i <= segments; i++) {
    const angle = (Math.PI / 2) * (i / segments);
    const xDist = radius - Math.cos(angle) * radius;
    const yDist = Math.sin(angle) * radius;
    pointsRight.push(vec3(0, yDist, halfFlat + radius - xDist));
  }
  
  pointsRight.push(vec3(0, height, halfFlat + radius));
  pointsRight.push(vec3(0, height, halfFlat + radius + deckDepth));
  
  const profilePoints = [
    ...pointsLeft,
    ...pointsRight
  ];
  
  // Generate faces
  for (let i = 0; i < profilePoints.length - 1; i++) {
    const p1 = profilePoints[i];
    const p2 = profilePoints[i + 1];
    
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
  
  // Right Back face
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, height, halfFlat + radius + deckDepth),
        vec3(halfW, height, halfFlat + radius + deckDepth),
        vec3(halfW, 0, halfFlat + radius + deckDepth),
        vec3(-halfW, 0, halfFlat + radius + deckDepth)
      ]
  });
  
  // Left Back face
  polygons.push({
    materialId,
    positions: [
        vec3(halfW, height, -halfFlat - radius - deckDepth),
        vec3(-halfW, height, -halfFlat - radius - deckDepth),
        vec3(-halfW, 0, -halfFlat - radius - deckDepth),
        vec3(halfW, 0, -halfFlat - radius - deckDepth),
      ]
  });
  
  // Bottom face
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, 0, -halfFlat - radius - deckDepth),
        vec3(halfW, 0, -halfFlat - radius - deckDepth),
        vec3(halfW, 0, halfFlat + radius + deckDepth),
        vec3(-halfW, 0, halfFlat + radius + deckDepth)
      ]
  });
  
  // Left and right side walls
  const sidePositionsLeft: Vec3[] = [];
  const sidePositionsRight: Vec3[] = [];
  
  for (let i = 0; i < profilePoints.length; i++) {
    sidePositionsLeft.push(vec3(-halfW, profilePoints[i].y, profilePoints[i].z));
    sidePositionsRight.push(vec3(halfW, profilePoints[i].y, profilePoints[i].z));
  }
  
  sidePositionsLeft.push(vec3(-halfW, 0, halfFlat + radius + deckDepth));
  sidePositionsLeft.push(vec3(-halfW, 0, -halfFlat - radius - deckDepth));
  
  sidePositionsRight.push(vec3(halfW, 0, halfFlat + radius + deckDepth));
  sidePositionsRight.push(vec3(halfW, 0, -halfFlat - radius - deckDepth));

  polygons.push({ materialId, positions: sidePositionsLeft });
  polygons.push({ materialId, positions: sidePositionsRight.reverse() });

  return createEditableMeshFromPolygons(polygons);
}

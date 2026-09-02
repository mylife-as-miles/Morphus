import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh, type Vec3 } from "@blud/shared";

export function buildBowl(params: {
  radiusX: number;
  radiusZ: number;
  depth: number;
  segments: number;
  materialId?: string;
}): EditableMesh {
  const { radiusX, radiusZ, depth, segments, materialId } = params;
  const radialSegments = Math.max(16, segments * 4); // Full circle
  const verticalSegments = segments;
  
  const polygons: EditableMeshPolygon[] = [];
  
  // Create vertices for the inner bowl surface
  const vertices: Vec3[][] = [];
  for (let ring = 0; ring <= verticalSegments; ring++) {
    const vPct = ring / verticalSegments;
    // Map vPct (0 to 1) to angle (90 deg to 0 deg)
    // At vPct = 0 (bottom), angle = Math.PI/2 (cos=0, sin=1). Wait, depth should be at top or bottom?
    // Let's say top is y = depth, bottom is y = 0.
    const angle = (Math.PI / 2) * (1 - vPct);
    const rScale = Math.cos(angle);
    const y = depth - Math.sin(angle) * depth;
    
    const ringVertices: Vec3[] = [];
    for (let r = 0; r < radialSegments; r++) {
      const a = (Math.PI * 2) * (r / radialSegments);
      const x = Math.cos(a) * (radiusX * rScale);
      const z = Math.sin(a) * (radiusZ * rScale);
      ringVertices.push(vec3(x, y, z));
    }
    vertices.push(ringVertices);
  }
  
  // Create faces from grid
  for (let r = 0; r < verticalSegments; r++) {
    for (let i = 0; i < radialSegments; i++) {
      const nextI = (i + 1) % radialSegments;
      
      const v0 = vertices[r][i];
      const v1 = vertices[r][nextI];
      const v2 = vertices[r + 1][nextI];
      const v3 = vertices[r + 1][i];
      
      // If at bottom ring (r=0), v0 and v1 are basically the same point (0,0,0) if rScale=0.
      if (r === 0) {
          polygons.push({
            materialId,
            positions: [v2, v3, v0]
          });
      } else {
          polygons.push({
            materialId,
            positions: [v3, v0, v1, v2]
          });
      }
    }
  }
  
  // Add an outer blockout skirt for thickness
  const deckWidth = 2.0;
  const topRing = vertices[verticalSegments];
  const outerRingTop: Vec3[] = [];
  const outerRingBottom: Vec3[] = [];
  
  for (let i = 0; i < radialSegments; i++) {
    const a = (Math.PI * 2) * (i / radialSegments);
    const x = Math.cos(a) * (radiusX + deckWidth);
    const z = Math.sin(a) * (radiusZ + deckWidth);
    outerRingTop.push(vec3(x, depth, z));
    outerRingBottom.push(vec3(x, 0, z));
  }
  
  for (let i = 0; i < radialSegments; i++) {
    const nextI = (i + 1) % radialSegments;
    // Deck face
    polygons.push({
        materialId,
        positions: [topRing[i], topRing[nextI], outerRingTop[nextI], outerRingTop[i]]
    });
    // Outer wall
    polygons.push({
        materialId,
        positions: [outerRingTop[i], outerRingTop[nextI], outerRingBottom[nextI], outerRingBottom[i]]
    });
  }
  
  // Bottom cap
  polygons.push({
      materialId,
      positions: outerRingBottom.slice().reverse()
  });

  return createEditableMeshFromPolygons(polygons);
}

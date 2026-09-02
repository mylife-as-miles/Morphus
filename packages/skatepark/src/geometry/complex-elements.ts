import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh, type Vec3 } from "@blud/shared";
import { buildQuarterPipe } from "./quarter-pipe.js";

export function buildSpine(params: {
  width: number;
  height: number;
  radius: number;
  segments: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, radius, segments, materialId } = params;
  const halfW = width * 0.5;
  const polygons: EditableMeshPolygon[] = [];
  
  // Left side points
  const pointsLeft: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI / 2) * (i / segments);
    const xDist = radius - Math.cos(angle) * radius;
    const yDist = Math.sin(angle) * radius;
    pointsLeft.push(vec3(0, yDist, -xDist));
  }
  
  // Right side points (mirror of left)
  const pointsRight: Vec3[] = [];
  for (let i = segments - 1; i >= 0; i--) {
    const angle = (Math.PI / 2) * (i / segments);
    const xDist = radius - Math.cos(angle) * radius;
    const yDist = Math.sin(angle) * radius;
    pointsRight.push(vec3(0, yDist, xDist));
  }
  
  const profilePoints = [...pointsLeft, ...pointsRight];
  
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
  
  // Bottom face
  polygons.push({
    materialId,
    positions: [
        vec3(-halfW, 0, -radius),
        vec3(halfW, 0, -radius),
        vec3(halfW, 0, radius),
        vec3(-halfW, 0, radius)
      ]
  });
  
  // Left and right side walls
  const sidePositionsLeft: Vec3[] = [];
  const sidePositionsRight: Vec3[] = [];
  
  for (let i = 0; i < profilePoints.length; i++) {
    sidePositionsLeft.push(vec3(-halfW, profilePoints[i].y, profilePoints[i].z));
    sidePositionsRight.push(vec3(halfW, profilePoints[i].y, profilePoints[i].z));
  }
  
  polygons.push({ materialId, positions: sidePositionsLeft });
  polygons.push({ materialId, positions: sidePositionsRight.reverse() });

  return createEditableMeshFromPolygons(polygons);
}

export function buildPyramid(params: {
  width: number;
  height: number;
  length: number;
  rampLength: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, length, rampLength, materialId } = params;
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const outerHalfW = halfW + rampLength;
  const outerHalfL = halfL + rampLength;

  const polygons: EditableMeshPolygon[] = [
    // Top Deck
    { materialId, positions: [vec3(-halfW, height, halfL), vec3(halfW, height, halfL), vec3(halfW, height, -halfL), vec3(-halfW, height, -halfL)] },
    // Front Ramp
    { materialId, positions: [vec3(-outerHalfW, 0, outerHalfL), vec3(outerHalfW, 0, outerHalfL), vec3(halfW, height, halfL), vec3(-halfW, height, halfL)] },
    // Back Ramp
    { materialId, positions: [vec3(-halfW, height, -halfL), vec3(halfW, height, -halfL), vec3(outerHalfW, 0, -outerHalfL), vec3(-outerHalfW, 0, -outerHalfL)] },
    // Left Ramp
    { materialId, positions: [vec3(-outerHalfW, 0, -outerHalfL), vec3(-outerHalfW, 0, outerHalfL), vec3(-halfW, height, halfL), vec3(-halfW, height, -halfL)] },
    // Right Ramp
    { materialId, positions: [vec3(halfW, height, -halfL), vec3(halfW, height, halfL), vec3(outerHalfW, 0, outerHalfL), vec3(outerHalfW, 0, -outerHalfL)] },
    // Bottom
    { materialId, positions: [vec3(-outerHalfW, 0, -outerHalfL), vec3(outerHalfW, 0, -outerHalfL), vec3(outerHalfW, 0, outerHalfL), vec3(-outerHalfW, 0, outerHalfL)] }
  ];

  return createEditableMeshFromPolygons(polygons);
}

export function buildStairSet(params: {
  width: number;
  stepCount: number;
  stepDepth: number;
  stepHeight: number;
  materialId?: string;
}): EditableMesh {
  const { width, stepCount, stepDepth, stepHeight, materialId } = params;
  const halfW = width * 0.5;
  const polygons: EditableMeshPolygon[] = [];
  
  let currentY = 0;
  let currentZ = 0;
  
  const sideLeft: Vec3[] = [vec3(-halfW, 0, 0)];
  const sideRight: Vec3[] = [vec3(halfW, 0, 0)];

  for (let i = 0; i < stepCount; i++) {
    // Riser
    polygons.push({
      materialId,
      positions: [
        vec3(-halfW, currentY, currentZ),
        vec3(halfW, currentY, currentZ),
        vec3(halfW, currentY + stepHeight, currentZ),
        vec3(-halfW, currentY + stepHeight, currentZ)
      ]
    });
    
    // Tread
    polygons.push({
      materialId,
      positions: [
        vec3(-halfW, currentY + stepHeight, currentZ),
        vec3(halfW, currentY + stepHeight, currentZ),
        vec3(halfW, currentY + stepHeight, currentZ - stepDepth),
        vec3(-halfW, currentY + stepHeight, currentZ - stepDepth)
      ]
    });
    
    sideLeft.push(vec3(-halfW, currentY, currentZ));
    sideLeft.push(vec3(-halfW, currentY + stepHeight, currentZ));
    sideLeft.push(vec3(-halfW, currentY + stepHeight, currentZ - stepDepth));
    
    sideRight.push(vec3(halfW, currentY, currentZ));
    sideRight.push(vec3(halfW, currentY + stepHeight, currentZ));
    sideRight.push(vec3(halfW, currentY + stepHeight, currentZ - stepDepth));
    
    currentY += stepHeight;
    currentZ -= stepDepth;
  }
  
  sideLeft.push(vec3(-halfW, 0, currentZ));
  sideRight.push(vec3(halfW, 0, currentZ));
  
  polygons.push({ materialId, positions: sideLeft });
  polygons.push({ materialId, positions: sideRight.reverse() });
  
  // Back face
  polygons.push({
      materialId,
      positions: [vec3(-halfW, currentY, currentZ), vec3(halfW, currentY, currentZ), vec3(halfW, 0, currentZ), vec3(-halfW, 0, currentZ)]
  });
  
  // Bottom face
  polygons.push({
      materialId,
      positions: [vec3(-halfW, 0, currentZ), vec3(halfW, 0, currentZ), vec3(halfW, 0, 0), vec3(-halfW, 0, 0)]
  });

  return createEditableMeshFromPolygons(polygons);
}

export function buildHip(params: {
  radius: number;
  height: number;
  width: number;
  segments: number;
  materialId?: string;
}): EditableMesh {
  // A hip is essentially a corner where two banks or quarter pipes meet.
  // For simplicity, we will create a 90-degree outward corner quarter pipe 
  // by sweeping a quarter pipe profile along an arc.
  const { radius, height, width, segments, materialId } = params;
  const polygons: EditableMeshPolygon[] = [];
  
  // ... basic implementation ... 
  // Let's implement a quarter pipe that sweeps 90 degrees around an origin.
  const sweepSegments = segments;
  const profileSteps = segments;
  
  const vertices: Vec3[][] = [];
  
  for (let s = 0; s <= sweepSegments; s++) {
    const sweepAngle = (Math.PI / 2) * (s / sweepSegments);
    const ring: Vec3[] = [];
    
    for (let p = 0; p <= profileSteps; p++) {
        const phi = (Math.PI / 2) * (p / profileSteps); // profile angle
        const profileX = width + radius - (radius * Math.cos(phi));
        const profileY = radius * Math.sin(phi);
        
        // Rotate around Y axis
        const finalX = profileX * Math.cos(sweepAngle);
        const finalZ = profileX * Math.sin(sweepAngle);
        ring.push(vec3(finalX, profileY, finalZ));
    }
    vertices.push(ring);
  }
  
  for (let s = 0; s < sweepSegments; s++) {
      for (let p = 0; p < profileSteps; p++) {
          const v0 = vertices[s][p];
          const v1 = vertices[s+1][p];
          const v2 = vertices[s+1][p+1];
          const v3 = vertices[s][p+1];
          
          polygons.push({
              materialId,
              positions: [v0, v1, v2, v3]
          });
      }
  }

  // Cap ends and bottom (simplified)
  return createEditableMeshFromPolygons(polygons);
}

export function buildHubbaLedge(params: {
  width: number;
  height: number;
  length: number;
  stairHeight: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, length, stairHeight, materialId } = params;
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  
  const polygons: EditableMeshPolygon[] = [
    // Top Angled
    { materialId, positions: [vec3(-halfW, height, halfL), vec3(halfW, height, halfL), vec3(halfW, height + stairHeight, -halfL), vec3(-halfW, height + stairHeight, -halfL)] },
    // Bottom
    { materialId, positions: [vec3(halfW, 0, halfL), vec3(-halfW, 0, halfL), vec3(-halfW, stairHeight, -halfL), vec3(halfW, stairHeight, -halfL)] },
    // Front
    { materialId, positions: [vec3(-halfW, 0, halfL), vec3(halfW, 0, halfL), vec3(halfW, height, halfL), vec3(-halfW, height, halfL)] },
    // Back
    { materialId, positions: [vec3(halfW, stairHeight, -halfL), vec3(-halfW, stairHeight, -halfL), vec3(-halfW, height + stairHeight, -halfL), vec3(halfW, height + stairHeight, -halfL)] },
    // Left
    { materialId, positions: [vec3(-halfW, stairHeight, -halfL), vec3(-halfW, 0, halfL), vec3(-halfW, height, halfL), vec3(-halfW, height + stairHeight, -halfL)] },
    // Right
    { materialId, positions: [vec3(halfW, 0, halfL), vec3(halfW, stairHeight, -halfL), vec3(halfW, height + stairHeight, -halfL), vec3(halfW, height, halfL)] }
  ];

  return createEditableMeshFromPolygons(polygons);
}

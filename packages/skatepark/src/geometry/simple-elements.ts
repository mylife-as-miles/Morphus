import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh } from "@blud/shared";

export function buildLedge(params: {
  width: number;
  height: number;
  length: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, length, materialId } = params;
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  
  const polygons: EditableMeshPolygon[] = [
    // Top
    { materialId, positions: [vec3(-halfW, height, halfL), vec3(halfW, height, halfL), vec3(halfW, height, -halfL), vec3(-halfW, height, -halfL)] },
    // Bottom
    { materialId, positions: [vec3(halfW, 0, halfL), vec3(-halfW, 0, halfL), vec3(-halfW, 0, -halfL), vec3(halfW, 0, -halfL)] },
    // Front
    { materialId, positions: [vec3(-halfW, 0, halfL), vec3(halfW, 0, halfL), vec3(halfW, height, halfL), vec3(-halfW, height, halfL)] },
    // Back
    { materialId, positions: [vec3(halfW, 0, -halfL), vec3(-halfW, 0, -halfL), vec3(-halfW, height, -halfL), vec3(halfW, height, -halfL)] },
    // Left
    { materialId, positions: [vec3(-halfW, 0, -halfL), vec3(-halfW, 0, halfL), vec3(-halfW, height, halfL), vec3(-halfW, height, -halfL)] },
    // Right
    { materialId, positions: [vec3(halfW, 0, halfL), vec3(halfW, 0, -halfL), vec3(halfW, height, -halfL), vec3(halfW, height, halfL)] }
  ];

  return createEditableMeshFromPolygons(polygons);
}

export function buildManualPad(params: {
  width: number;
  height: number;
  length: number;
  materialId?: string;
}): EditableMesh {
  return buildLedge(params);
}

export function buildBank(params: {
  width: number;
  height: number;
  depth: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, depth, materialId } = params;
  const halfW = width * 0.5;
  const deckDepth = 1.0;
  
  const polygons: EditableMeshPolygon[] = [
    // Ramp
    { materialId, positions: [vec3(-halfW, 0, depth), vec3(halfW, 0, depth), vec3(halfW, height, 0), vec3(-halfW, height, 0)] },
    // Deck
    { materialId, positions: [vec3(-halfW, height, 0), vec3(halfW, height, 0), vec3(halfW, height, -deckDepth), vec3(-halfW, height, -deckDepth)] },
    // Back
    { materialId, positions: [vec3(halfW, 0, -deckDepth), vec3(-halfW, 0, -deckDepth), vec3(-halfW, height, -deckDepth), vec3(halfW, height, -deckDepth)] },
    // Bottom
    { materialId, positions: [vec3(-halfW, 0, depth), vec3(-halfW, 0, -deckDepth), vec3(halfW, 0, -deckDepth), vec3(halfW, 0, depth)] },
    // Left
    { materialId, positions: [vec3(-halfW, 0, -deckDepth), vec3(-halfW, 0, depth), vec3(-halfW, height, 0), vec3(-halfW, height, -deckDepth)] },
    // Right
    { materialId, positions: [vec3(halfW, 0, depth), vec3(halfW, 0, -deckDepth), vec3(halfW, height, -deckDepth), vec3(halfW, height, 0)] }
  ];

  return createEditableMeshFromPolygons(polygons);
}

export function buildKicker(params: {
  width: number;
  height: number;
  depth: number;
  materialId?: string;
}): EditableMesh {
  const { width, height, depth, materialId } = params;
  const halfW = width * 0.5;
  
  const polygons: EditableMeshPolygon[] = [
    // Ramp
    { materialId, positions: [vec3(-halfW, 0, depth), vec3(halfW, 0, depth), vec3(halfW, height, 0), vec3(-halfW, height, 0)] },
    // Back
    { materialId, positions: [vec3(-halfW, height, 0), vec3(halfW, height, 0), vec3(halfW, 0, 0), vec3(-halfW, 0, 0)] },
    // Bottom
    { materialId, positions: [vec3(-halfW, 0, depth), vec3(-halfW, 0, 0), vec3(halfW, 0, 0), vec3(halfW, 0, depth)] },
    // Left
    { materialId, positions: [vec3(-halfW, 0, 0), vec3(-halfW, 0, depth), vec3(-halfW, height, 0)] },
    // Right
    { materialId, positions: [vec3(halfW, 0, depth), vec3(halfW, 0, 0), vec3(halfW, height, 0)] }
  ];

  return createEditableMeshFromPolygons(polygons);
}


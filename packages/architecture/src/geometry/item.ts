import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh } from "@blud/shared";

export function buildItem(params: {
  itemType: "door" | "window" | "light-fixture";
  width: number;
  height: number;
  materialId?: string;
}): EditableMesh {
  const width = Math.max(0.1, params.width);
  const height = Math.max(0.1, params.height);
  const { materialId, itemType } = params;

  const frameThickness = 0.05;
  const frameDepth = 0.05;
  const halfD = frameDepth * 0.5;

  // Vertical offset for windows (sill height)
  const yOffset = itemType === "window" ? 0.9 : 0;

  if (itemType === "light-fixture") {
    // Small flat box
    const halfW = width * 0.5;
    const h = 0.05;
    const polygons: EditableMeshPolygon[] = [
      { materialId, positions: [vec3(-halfW, h, halfW), vec3(halfW, h, halfW), vec3(halfW, h, -halfW), vec3(-halfW, h, -halfW)] },
      { materialId, positions: [vec3(halfW, 0, halfW), vec3(-halfW, 0, halfW), vec3(-halfW, 0, -halfW), vec3(halfW, 0, -halfW)] },
      { materialId, positions: [vec3(-halfW, 0, halfW), vec3(halfW, 0, halfW), vec3(halfW, h, halfW), vec3(-halfW, h, halfW)] },
      { materialId, positions: [vec3(halfW, 0, -halfW), vec3(-halfW, 0, -halfW), vec3(-halfW, h, -halfW), vec3(halfW, h, -halfW)] },
      { materialId, positions: [vec3(-halfW, 0, -halfW), vec3(-halfW, 0, halfW), vec3(-halfW, h, halfW), vec3(-halfW, h, -halfW)] },
      { materialId, positions: [vec3(halfW, 0, halfW), vec3(halfW, 0, -halfW), vec3(halfW, h, -halfW), vec3(halfW, h, halfW)] },
    ];
    return createEditableMeshFromPolygons(polygons);
  }

  // Door or window frame — 4 rectangular bars forming a frame
  const ft = frameThickness;
  const y0 = yOffset;
  const y1 = yOffset + height;

  const polygons: EditableMeshPolygon[] = [];

  // Helper to add a box
  function addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    polygons.push(
      { materialId, positions: [vec3(x0, y1, z1), vec3(x1, y1, z1), vec3(x1, y1, z0), vec3(x0, y1, z0)] },
      { materialId, positions: [vec3(x1, y0, z1), vec3(x0, y0, z1), vec3(x0, y0, z0), vec3(x1, y0, z0)] },
      { materialId, positions: [vec3(x0, y0, z1), vec3(x1, y0, z1), vec3(x1, y1, z1), vec3(x0, y1, z1)] },
      { materialId, positions: [vec3(x1, y0, z0), vec3(x0, y0, z0), vec3(x0, y1, z0), vec3(x1, y1, z0)] },
      { materialId, positions: [vec3(x0, y0, z0), vec3(x0, y0, z1), vec3(x0, y1, z1), vec3(x0, y1, z0)] },
      { materialId, positions: [vec3(x1, y0, z1), vec3(x1, y0, z0), vec3(x1, y1, z0), vec3(x1, y1, z1)] },
    );
  }

  // Left vertical bar
  addBox(0, y0, -halfD, ft, y1, halfD);
  // Right vertical bar
  addBox(width - ft, y0, -halfD, width, y1, halfD);
  // Top horizontal bar
  addBox(0, y1 - ft, -halfD, width, y1, halfD);
  // Bottom horizontal bar (sill)
  addBox(0, y0, -halfD, width, y0 + ft, halfD);

  return createEditableMeshFromPolygons(polygons);
}

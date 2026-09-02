import { createEditableMeshFromPolygons, type EditableMeshPolygon } from "@blud/geometry-kernel";
import { vec3, type EditableMesh, type Vec3 } from "@blud/shared";

export function buildRail(params: {
  length: number;
  railHeight: number;
  railRadius: number;
  legCount: number;
  materialId?: string;
}): EditableMesh {
  const { length, railHeight, railRadius, legCount, materialId } = params;
  const halfL = length * 0.5;
  const segments = 8;
  const legRadius = railRadius * 0.8;
  
  const polygons: EditableMeshPolygon[] = [];
  
  // Build main rail cylinder (along Z axis)
  for (let i = 0; i < segments; i++) {
    const angle1 = (Math.PI * 2) * (i / segments);
    const angle2 = (Math.PI * 2) * ((i + 1) / segments);
    
    const x1 = Math.cos(angle1) * railRadius;
    const y1 = railHeight + Math.sin(angle1) * railRadius;
    const x2 = Math.cos(angle2) * railRadius;
    const y2 = railHeight + Math.sin(angle2) * railRadius;
    
    polygons.push({
      materialId,
      positions: [
        vec3(x1, y1, -halfL),
        vec3(x2, y2, -halfL),
        vec3(x2, y2, halfL),
        vec3(x1, y1, halfL)
      ]
    });
  }
  
  // Caps for rail
  const capFront: Vec3[] = [];
  const capBack: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (Math.PI * 2) * (i / segments);
    const px = Math.cos(angle) * railRadius;
    const py = railHeight + Math.sin(angle) * railRadius;
    capFront.push(vec3(px, py, halfL));
    capBack.push(vec3(px, py, -halfL));
  }
  polygons.push({ materialId, positions: capFront });
  polygons.push({ materialId, positions: capBack.reverse() });
  
  // Build legs
  const legSpacing = length / (legCount + 1);
  for (let j = 1; j <= legCount; j++) {
    const zPos = -halfL + (j * legSpacing);
    
    for (let i = 0; i < segments; i++) {
        const angle1 = (Math.PI * 2) * (i / segments);
        const angle2 = (Math.PI * 2) * ((i + 1) / segments);
        
        const x1 = Math.cos(angle1) * legRadius;
        const z1 = zPos + Math.sin(angle1) * legRadius;
        const x2 = Math.cos(angle2) * legRadius;
        const z2 = zPos + Math.sin(angle2) * legRadius;
        
        polygons.push({
            materialId,
            positions: [
                vec3(x1, 0, z1),
                vec3(x2, 0, z2),
                vec3(x2, railHeight, z2),
                vec3(x1, railHeight, z1)
            ]
        });
    }
  }

  return createEditableMeshFromPolygons(polygons);
}

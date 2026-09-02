import type { Vec3 } from "@blud/shared";

/**
 * Computes the minimum distance from a point to a line segment.
 */
function distanceToSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number
): { distance: number; closestY: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;

  let t: number;
  if (lenSq === 0) {
    t = 0;
  } else {
    t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closestX = ax + t * dx;
  const closestZ = az + t * dz;
  const distX = px - closestX;
  const distZ = pz - closestZ;

  return {
    distance: Math.sqrt(distX * distX + distZ * distZ),
    closestY: 0, // placeholder, computed by caller
    t,
  };
}

/**
 * Flattens/carves the heightmap along a spline path.
 *
 * For each heightmap cell within the corridor width + falloff distance of the spline,
 * the height is blended toward the spline's elevation minus embedDepth.
 *
 * @param heightmap - Flat Float32Array of elevation values
 * @param resolution - Grid dimensions (resolution × resolution)
 * @param size - World extents (width, maxHeight, depth)
 * @param splinePoints - Array of spline sample points in world space
 * @param corridorWidth - Half-width of the flat corridor in world units
 * @param falloff - Distance over which terrain blends from spline elevation to original
 * @param embedDepth - Vertical offset below the spline for river-style carving
 * @returns Both the modified heightmap and a copy of the original for undo
 */
export function applySplineDeformation(
  heightmap: Float32Array,
  resolution: number,
  size: Vec3,
  splinePoints: Array<{ x: number; z: number; y: number }>,
  corridorWidth: number,
  falloff: number,
  embedDepth: number
): { modified: Float32Array; original: Float32Array } {
  const original = new Float32Array(heightmap);
  const modified = new Float32Array(heightmap);

  if (splinePoints.length < 2 || resolution < 2) {
    return { modified, original };
  }

  const totalInfluence = corridorWidth + falloff;

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const u = col / (resolution - 1);
      const v = row / (resolution - 1);
      const worldX = u * size.x - size.x / 2;
      const worldZ = v * size.z - size.z / 2;

      // Find the closest point on the spline polyline
      let minDist = Infinity;
      let splineY = 0;

      for (let i = 0; i < splinePoints.length - 1; i++) {
        const a = splinePoints[i];
        const b = splinePoints[i + 1];

        const seg = distanceToSegment(worldX, worldZ, a.x, a.z, b.x, b.z);

        if (seg.distance < minDist) {
          minDist = seg.distance;
          // Interpolate the Y along the segment
          splineY = a.y + seg.t * (b.y - a.y);
        }
      }

      if (minDist > totalInfluence) continue;

      const index = row * resolution + col;
      // Target height: spline elevation minus embed depth, normalized to heightmap space
      const targetHeight = (splineY - embedDepth) / size.y;

      let blendFactor: number;
      if (minDist <= corridorWidth) {
        // Inside the flat corridor: full blend
        blendFactor = 1.0;
      } else {
        // In the falloff zone: smooth blend from 1 to 0
        const falloffT = (minDist - corridorWidth) / falloff;
        blendFactor = 1.0 - (falloffT * falloffT * (3 - 2 * falloffT)); // smoothstep
      }

      const currentHeight = heightmap[index];
      modified[index] = currentHeight + (targetHeight - currentHeight) * blendFactor;
    }
  }

  return { modified, original };
}

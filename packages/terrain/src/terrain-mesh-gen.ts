import type { Vec3 } from "@blud/shared";

/**
 * Result of terrain mesh generation containing raw buffer data.
 */
export type TerrainMeshData = {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  uvs: Float32Array;
};

/**
 * Generates a subdivided plane mesh from a heightmap.
 *
 * The heightmap is a flat Float32Array of length resolution × resolution in row-major order.
 * Each value represents the normalized elevation (0–1) at that grid cell.
 *
 * World-space position of cell (row, col):
 *   worldX = (col / (resolution - 1)) * size.x - size.x / 2
 *   worldY = heightmap[row * resolution + col] * size.y
 *   worldZ = (row / (resolution - 1)) * size.z - size.z / 2
 *
 * Cells where holeMask[row * resolution + col] === 1 are skipped (no triangles generated).
 *
 * @param heightmap - Flat Float32Array of elevation values
 * @param resolution - Grid dimensions (resolution × resolution)
 * @param size - World extents (width, maxHeight, depth)
 * @param holeMask - Optional per-cell visibility mask (0 = visible, 1 = hole)
 * @returns Mesh data with positions, indices, normals, and UVs
 */
export function generateTerrainMesh(
  heightmap: Float32Array,
  resolution: number,
  size: Vec3,
  holeMask?: Uint8Array
): TerrainMeshData {
  if (resolution < 2) {
    return {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
    };
  }

  const vertexCount = resolution * resolution;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  // Generate vertex positions and UVs
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const index = row * resolution + col;
      const u = col / (resolution - 1);
      const v = row / (resolution - 1);

      const worldX = u * size.x - size.x / 2;
      const worldY = heightmap[index] * size.y;
      const worldZ = v * size.z - size.z / 2;

      positions[index * 3] = worldX;
      positions[index * 3 + 1] = worldY;
      positions[index * 3 + 2] = worldZ;

      uvs[index * 2] = u;
      uvs[index * 2 + 1] = v;
    }
  }

  // Compute normals using central differences
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const index = row * resolution + col;

      const left = col > 0 ? heightmap[row * resolution + (col - 1)] : heightmap[index];
      const right = col < resolution - 1 ? heightmap[row * resolution + (col + 1)] : heightmap[index];
      const down = row > 0 ? heightmap[(row - 1) * resolution + col] : heightmap[index];
      const up = row < resolution - 1 ? heightmap[(row + 1) * resolution + col] : heightmap[index];

      // Gradient in world space
      const cellWidth = size.x / (resolution - 1);
      const cellDepth = size.z / (resolution - 1);

      const dhdx = (right - left) * size.y / (col > 0 && col < resolution - 1 ? 2 * cellWidth : cellWidth);
      const dhdz = (up - down) * size.y / (row > 0 && row < resolution - 1 ? 2 * cellDepth : cellDepth);

      // Normal = normalize(-dhdx, 1, -dhdz)
      let nx = -dhdx;
      let ny = 1;
      let nz = -dhdz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }

      normals[index * 3] = nx;
      normals[index * 3 + 1] = ny;
      normals[index * 3 + 2] = nz;
    }
  }

  // Generate indices, skipping cells where holeMask is 1
  const indexList: number[] = [];

  for (let row = 0; row < resolution - 1; row++) {
    for (let col = 0; col < resolution - 1; col++) {
      // Check if this cell is a hole
      if (holeMask) {
        const cellIndex = row * resolution + col;
        if (holeMask[cellIndex] === 1) continue;
      }

      const topLeft = row * resolution + col;
      const topRight = row * resolution + col + 1;
      const bottomLeft = (row + 1) * resolution + col;
      const bottomRight = (row + 1) * resolution + col + 1;

      // Two triangles per cell
      indexList.push(topLeft, bottomLeft, topRight);
      indexList.push(topRight, bottomLeft, bottomRight);
    }
  }

  return {
    positions,
    indices: new Uint32Array(indexList),
    normals,
    uvs,
  };
}

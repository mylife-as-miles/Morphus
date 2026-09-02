import type { Vec3 } from "@blud/shared";
import type { TerrainMeshData } from "./terrain-mesh-gen";

/**
 * Generates a LOD mesh from a heightmap by skipping every 2^lodLevel vertices.
 *
 * At lodLevel 0, the full resolution mesh is generated.
 * At lodLevel 1, every other vertex is sampled (resolution / 2).
 * At lodLevel 2, every 4th vertex is sampled (resolution / 4).
 * And so on.
 *
 * @param heightmap - Flat Float32Array of elevation values
 * @param resolution - Original grid dimensions (resolution × resolution)
 * @param size - World extents (width, maxHeight, depth)
 * @param lodLevel - LOD level (0 = full detail, higher = less detail)
 * @param holeMask - Optional per-cell visibility mask (0 = visible, 1 = hole)
 * @returns Mesh data with positions, indices, normals, and UVs
 */
export function generateLodMesh(
  heightmap: Float32Array,
  resolution: number,
  size: Vec3,
  lodLevel: number,
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

  const step = Math.pow(2, lodLevel);
  // Compute the number of sampled vertices along each axis
  const lodResolution = Math.floor((resolution - 1) / step) + 1;

  if (lodResolution < 2) {
    return {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
    };
  }

  const vertexCount = lodResolution * lodResolution;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  // Generate vertex positions and UVs from sampled heightmap
  for (let lodRow = 0; lodRow < lodResolution; lodRow++) {
    for (let lodCol = 0; lodCol < lodResolution; lodCol++) {
      const srcRow = Math.min(lodRow * step, resolution - 1);
      const srcCol = Math.min(lodCol * step, resolution - 1);
      const srcIndex = srcRow * resolution + srcCol;
      const lodIndex = lodRow * lodResolution + lodCol;

      const u = srcCol / (resolution - 1);
      const v = srcRow / (resolution - 1);

      const worldX = u * size.x - size.x / 2;
      const worldY = heightmap[srcIndex] * size.y;
      const worldZ = v * size.z - size.z / 2;

      positions[lodIndex * 3] = worldX;
      positions[lodIndex * 3 + 1] = worldY;
      positions[lodIndex * 3 + 2] = worldZ;

      uvs[lodIndex * 2] = u;
      uvs[lodIndex * 2 + 1] = v;
    }
  }

  // Compute normals using central differences on the sampled grid
  for (let lodRow = 0; lodRow < lodResolution; lodRow++) {
    for (let lodCol = 0; lodCol < lodResolution; lodCol++) {
      const lodIndex = lodRow * lodResolution + lodCol;

      const srcRow = Math.min(lodRow * step, resolution - 1);
      const srcCol = Math.min(lodCol * step, resolution - 1);
      const srcIndex = srcRow * resolution + srcCol;

      const leftCol = Math.max(0, srcCol - step);
      const rightCol = Math.min(resolution - 1, srcCol + step);
      const upRow = Math.min(resolution - 1, srcRow + step);
      const downRow = Math.max(0, srcRow - step);

      const left = heightmap[srcRow * resolution + leftCol];
      const right = heightmap[srcRow * resolution + rightCol];
      const down = heightmap[downRow * resolution + srcCol];
      const up = heightmap[upRow * resolution + srcCol];

      const cellWidth = (rightCol - leftCol) / (resolution - 1) * size.x;
      const cellDepth = (upRow - downRow) / (resolution - 1) * size.z;

      const dhdx = cellWidth > 0 ? (right - left) * size.y / cellWidth : 0;
      const dhdz = cellDepth > 0 ? (up - down) * size.y / cellDepth : 0;

      let nx = -dhdx;
      let ny = 1;
      let nz = -dhdz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }

      normals[lodIndex * 3] = nx;
      normals[lodIndex * 3 + 1] = ny;
      normals[lodIndex * 3 + 2] = nz;
    }
  }

  // Generate indices, skipping cells where holeMask is 1
  const indexList: number[] = [];

  for (let lodRow = 0; lodRow < lodResolution - 1; lodRow++) {
    for (let lodCol = 0; lodCol < lodResolution - 1; lodCol++) {
      // Check hole mask at the source cell
      if (holeMask) {
        const srcRow = Math.min(lodRow * step, resolution - 1);
        const srcCol = Math.min(lodCol * step, resolution - 1);
        if (holeMask[srcRow * resolution + srcCol] === 1) continue;
      }

      const topLeft = lodRow * lodResolution + lodCol;
      const topRight = lodRow * lodResolution + lodCol + 1;
      const bottomLeft = (lodRow + 1) * lodResolution + lodCol;
      const bottomRight = (lodRow + 1) * lodResolution + lodCol + 1;

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

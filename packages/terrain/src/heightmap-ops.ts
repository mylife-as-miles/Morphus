import type { FalloffType } from "@blud/shared";

/**
 * Brush parameters for heightmap sculpting operations.
 */
export type BrushParams = {
  cx: number;
  cz: number;
  radius: number;
  strength: number;
  falloff: FalloffType;
};

/**
 * Computes a 0–1 falloff weight based on distance from the brush center.
 */
export function computeFalloff(distance: number, radius: number, falloff: FalloffType): number {
  if (distance >= radius) return 0;
  if (radius <= 0) return 0;

  const t = distance / radius;

  switch (falloff) {
    case "constant":
      return 1;
    case "linear":
      return 1 - t;
    case "smooth":
      // Hermite smoothstep: 3t² - 2t³ (inverted so center = 1)
      return 1 - (t * t * (3 - 2 * t));
    default:
      return 1 - t;
  }
}

/**
 * Raises heightmap values within the brush radius.
 */
export function applyRaiseBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams
): Float32Array {
  const result = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff } = params;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const weight = computeFalloff(distance, radius, falloff);

      if (weight > 0) {
        const index = z * resolution + x;
        result[index] += strength * weight;
      }
    }
  }

  return result;
}

/**
 * Lowers heightmap values within the brush radius.
 */
export function applyLowerBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams
): Float32Array {
  const result = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff } = params;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const weight = computeFalloff(distance, radius, falloff);

      if (weight > 0) {
        const index = z * resolution + x;
        result[index] -= strength * weight;
      }
    }
  }

  return result;
}

/**
 * Flattens heightmap values toward a target height within the brush radius.
 */
export function applyFlattenBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams & { targetHeight: number }
): Float32Array {
  const result = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff, targetHeight } = params;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const weight = computeFalloff(distance, radius, falloff);

      if (weight > 0) {
        const index = z * resolution + x;
        const current = result[index];
        result[index] = current + (targetHeight - current) * strength * weight;
      }
    }
  }

  return result;
}

/**
 * Smooths heightmap values by averaging neighbors within the brush radius.
 */
export function applySmoothBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams
): Float32Array {
  const result = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff } = params;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const weight = computeFalloff(distance, radius, falloff);

      if (weight > 0) {
        const index = z * resolution + x;
        // Average the 3×3 neighborhood
        let sum = 0;
        let count = 0;

        for (let nz = Math.max(0, z - 1); nz <= Math.min(resolution - 1, z + 1); nz++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(resolution - 1, x + 1); nx++) {
            sum += heightmap[nz * resolution + nx];
            count++;
          }
        }

        const avg = sum / count;
        const current = heightmap[index];
        result[index] = current + (avg - current) * strength * weight;
      }
    }
  }

  return result;
}

/**
 * Simple seeded pseudo-random number generator for deterministic noise.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Adds procedural noise displacement to heightmap values within the brush radius.
 */
export function applyNoiseBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams & { seed?: number }
): Float32Array {
  const result = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff, seed = 42 } = params;
  const rng = seededRandom(seed);

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const weight = computeFalloff(distance, radius, falloff);

      if (weight > 0) {
        const index = z * resolution + x;
        // Random value in [-1, 1]
        const noise = rng() * 2 - 1;
        result[index] += noise * strength * weight;
      }
    }
  }

  return result;
}

/**
 * Quantizes heightmap values to discrete elevation steps within the brush radius.
 */
export function applyTerraceBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams & { stepHeight: number }
): Float32Array {
  const result = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff, stepHeight } = params;

  if (stepHeight <= 0) return result;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const weight = computeFalloff(distance, radius, falloff);

      if (weight > 0) {
        const index = z * resolution + x;
        const current = heightmap[index];
        const terraced = Math.round(current / stepHeight) * stepHeight;
        result[index] = current + (terraced - current) * strength * weight;
      }
    }
  }

  return result;
}

/**
 * Simulates simple hydraulic erosion on heightmap values within the brush radius.
 * Smooths peaks and deepens valleys by iteratively moving height from higher to lower neighbors.
 */
export function applyErosionBrush(
  heightmap: Float32Array,
  resolution: number,
  params: BrushParams & { iterations?: number }
): Float32Array {
  let current = new Float32Array(heightmap);
  const { cx, cz, radius, strength, falloff, iterations = 3 } = params;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Float32Array(current);

    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dz = z - cz;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const weight = computeFalloff(distance, radius, falloff);

        if (weight > 0) {
          const index = z * resolution + x;
          const h = current[index];

          // Find the lowest neighbor
          let lowestH = h;
          for (let nz = Math.max(0, z - 1); nz <= Math.min(resolution - 1, z + 1); nz++) {
            for (let nx = Math.max(0, x - 1); nx <= Math.min(resolution - 1, x + 1); nx++) {
              if (nx === x && nz === z) continue;
              const nh = current[nz * resolution + nx];
              if (nh < lowestH) {
                lowestH = nh;
              }
            }
          }

          // Move height toward the lowest neighbor (erosion effect)
          const diff = h - lowestH;
          if (diff > 0) {
            const erosionAmount = diff * strength * weight * 0.5;
            next[index] -= erosionAmount;
          }
        }
      }
    }

    current = next;
  }

  return current;
}

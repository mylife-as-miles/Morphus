import type { BrushParams } from "./heightmap-ops";

/**
 * Paints a splatmap layer by increasing the weight for the selected layer
 * and proportionally decreasing other layers so per-texel weights sum to 1.0.
 *
 * The splatmap is a flat Float32Array of length resolution × resolution × layerCount.
 * For cell (row, col) and layer k, the weight is at index: (row * resolution + col) * layerCount + k.
 */
export function paintSplatmapLayer(
  splatmap: Float32Array,
  resolution: number,
  layerCount: number,
  layerIndex: number,
  params: BrushParams
): Float32Array {
  if (layerCount <= 0 || layerIndex < 0 || layerIndex >= layerCount) {
    return new Float32Array(splatmap);
  }

  const result = new Float32Array(splatmap);
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

      // Inline falloff computation
      if (distance >= radius) continue;
      if (radius <= 0) continue;

      const t = distance / radius;
      let weight: number;
      switch (falloff) {
        case "constant":
          weight = 1;
          break;
        case "linear":
          weight = 1 - t;
          break;
        case "smooth":
          weight = 1 - (t * t * (3 - 2 * t));
          break;
        default:
          weight = 1 - t;
      }

      if (weight <= 0) continue;

      const baseIndex = (z * resolution + x) * layerCount;
      const addAmount = strength * weight;

      // Increase the target layer weight
      const oldTargetWeight = result[baseIndex + layerIndex];
      const newTargetWeight = Math.min(1.0, oldTargetWeight + addAmount);
      result[baseIndex + layerIndex] = newTargetWeight;

      // Compute the remaining weight for other layers
      const remainingWeight = 1.0 - newTargetWeight;

      // Sum of other layers' current weights
      let otherSum = 0;
      for (let k = 0; k < layerCount; k++) {
        if (k !== layerIndex) {
          otherSum += result[baseIndex + k];
        }
      }

      // Proportionally scale other layers to fill the remaining weight
      if (otherSum > 0) {
        const scale = remainingWeight / otherSum;
        for (let k = 0; k < layerCount; k++) {
          if (k !== layerIndex) {
            result[baseIndex + k] *= scale;
          }
        }
      } else if (layerCount > 1) {
        // If all other layers are 0, distribute remaining weight evenly
        const perLayer = remainingWeight / (layerCount - 1);
        for (let k = 0; k < layerCount; k++) {
          if (k !== layerIndex) {
            result[baseIndex + k] = perLayer;
          }
        }
      }
    }
  }

  return result;
}

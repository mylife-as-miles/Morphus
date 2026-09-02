/**
 * Applies a hole or un-hole brush to the terrain hole mask.
 *
 * The holeMask is a Uint8Array of length resolution × resolution.
 * 0 = visible, 1 = hole (invisible).
 *
 * @param holeMask - The current hole mask
 * @param resolution - Grid resolution (holeMask is resolution × resolution)
 * @param cx - Brush center X in grid coordinates
 * @param cz - Brush center Z in grid coordinates
 * @param radius - Brush radius in grid cells
 * @param mode - "hole" sets cells to 1 (invisible), "unhole" sets cells to 0 (visible)
 * @returns A new Uint8Array with the modified hole mask
 */
export function applyHoleBrush(
  holeMask: Uint8Array,
  resolution: number,
  cx: number,
  cz: number,
  radius: number,
  mode: "hole" | "unhole"
): Uint8Array {
  const result = new Uint8Array(holeMask);
  const value: number = mode === "hole" ? 1 : 0;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(resolution - 1, Math.ceil(cx + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(resolution - 1, Math.ceil(cz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= radius) {
        result[z * resolution + x] = value;
      }
    }
  }

  return result;
}

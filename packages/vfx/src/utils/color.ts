import { Color } from "three";

/**
 * Cached hex-string to Color conversion.
 *
 * Settings store colours as `#rrggbb` strings; shaders need Colors every frame.
 * Allocating a Color per frame per uniform would churn the GC, so we memoise one
 * instance per string and mutate uniform values from it.
 */
const cache = new Map<string, Color>();

export function getColor(hex: string): Color {
  let c = cache.get(hex);
  if (!c) {
    // three's colour management already converts `#rrggbb` (sRGB) into the
    // linear working space -- no manual conversion here, or it would be applied
    // twice and everything would come out too dark.
    c = new Color(hex);
    cache.set(hex, c);
  }
  return c;
}

/** Copy a settings colour into a uniform's Color value without allocating. */
export function copyColor(target: Color, hex: string): Color {
  target.copy(getColor(hex));
  return target;
}

/** Fresh (non-shared) Color from a settings string -- for one-off construction. */
export function makeColor(hex: string): Color {
  return getColor(hex).clone();
}

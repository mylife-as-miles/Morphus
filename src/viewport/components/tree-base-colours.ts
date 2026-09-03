/**
 * Base bark and leaf colours for the viewport's forest.
 *
 * The generator's vertex colours are *tints*, not albedo. `barkColor` builds
 * them as `0.8 + variation * 0.2` and the comment in `woodMesher.ts` says so
 * outright -- "a warm vertex tint separates the ripe tissue from the shared
 * bark material". Upstream multiplies that tint by a baked bark texture; this
 * port had no texture and no base colour, so it rendered the tint alone and
 * every tree in the scene came out near-white. Measured on a compiled beech,
 * the wood tints mean 0.82/0.78/0.70 and the foliage tints mean 0.74/0.75/0.77
 * -- a light warm grey and a light blue-grey, which is exactly what was on
 * screen.
 *
 * The fix is a base colour to multiply against, and upstream already carries
 * per-species ones: `barkProfileFor(species).palette.crown` is the lit face of
 * the bark between the fissures, and `leafProfileFor(species).palette.sun` is
 * the sunlit leaf. Reusing those keeps a beech reading differently from a pine
 * rather than painting every species the same brown.
 */

import { Color } from "three";
import { barkProfileFor } from "@/super-terrain/tree/materials/bark/profiles";
import { leafProfileFor } from "@/super-terrain/tree/materials/leaf/profiles";
import { parseTreePrototypeId } from "@blud/forest";

/**
 * Fallbacks for a species the profile tables do not know.
 *
 * A missing profile should cost the tree its species character, not its
 * colour -- the previous behaviour (white) was far more wrong than a generic
 * brown would have been.
 */
const FALLBACK_BARK = new Color(0.36, 0.31, 0.25);
const FALLBACK_LEAF = new Color(0.28, 0.38, 0.18);

/**
 * Colours are read once per species and kept.
 *
 * A stand of ten prototypes re-renders on every grow, and `barkProfileFor`
 * walks a table each call. Neither is expensive, but these values never change
 * for a given species, so there is no reason to recompute them per frame.
 */
const barkCache = new Map<string, Color>();
const leafCache = new Map<string, Color>();

/** The lit bark colour for a prototype, to multiply the vertex tint by. */
export function barkBaseColour(prototypeId: string): Color {
  const cached = barkCache.get(prototypeId);
  if (cached) return cached;

  const parsed = parseTreePrototypeId(prototypeId);
  let colour = FALLBACK_BARK;

  if (parsed) {
    try {
      const crown = barkProfileFor(parsed.species as never)?.palette?.crown;
      if (crown) colour = new Color(crown[0], crown[1], crown[2]);
    } catch {
      // An unknown species throws rather than returning undefined in some
      // tables. Falling back is right either way.
      colour = FALLBACK_BARK;
    }
  }

  barkCache.set(prototypeId, colour);
  return colour;
}

/** The sunlit leaf colour for a prototype, to multiply the card tint by. */
export function leafBaseColour(prototypeId: string): Color {
  const cached = leafCache.get(prototypeId);
  if (cached) return cached;

  const parsed = parseTreePrototypeId(prototypeId);
  let colour = FALLBACK_LEAF;

  if (parsed) {
    try {
      const palette = leafProfileFor(parsed.species as never)?.palette;
      // `sun` alone is the brightest face of the canopy and reads flat across a
      // whole stand. Leaning it toward `shade` keeps the mass from glowing.
      if (palette?.sun && palette?.shade) {
        colour = new Color(
          palette.sun[0] * 0.65 + palette.shade[0] * 0.35,
          palette.sun[1] * 0.65 + palette.shade[1] * 0.35,
          palette.sun[2] * 0.65 + palette.shade[2] * 0.35
        );
      } else if (palette?.sun) {
        colour = new Color(palette.sun[0], palette.sun[1], palette.sun[2]);
      }
    } catch {
      colour = FALLBACK_LEAF;
    }
  }

  leafCache.set(prototypeId, colour);
  return colour;
}

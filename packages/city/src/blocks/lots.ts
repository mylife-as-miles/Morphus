/**
 * Divides a block into building lots.
 *
 * Perimeter subdivision, not a grid of parcels. Buildings in a dense city stand
 * shoulder to shoulder along the street with their backs to a shared interior;
 * the reference footage shows exactly that -- continuous street walls, ragged
 * yards behind. Slicing a block into a checkerboard instead produces buildings
 * marooned in the middle with no frontage, which is the clearest sign a city
 * was generated rather than laid out.
 *
 * So each edge of the block is walked, divided into frontages, and each
 * frontage extruded inward to a lot depth. What is left in the middle is the
 * block interior: a courtyard, car park or garden, and deliberately not built
 * on.
 */

import { polygonArea, type Point2 } from './blockPolygons'

export interface Lot {
  id: string
  /** Corners, counter-clockwise. Quad in the ordinary case. */
  points: Point2[]
  /** Midpoint of the street-facing edge. */
  frontage: Point2
  /** Outward normal of the frontage, so a building can face the street. */
  facing: Point2
  /** Metres of street frontage -- the strongest predictor of what fits. */
  frontageWidth: number
  depth: number
  area: number
}

export interface SubdivideBlockOptions {
  polygon: readonly Point2[]
  blockId: string
  /** Target street frontage per lot, in metres. */
  lotWidth?: number
  /** How far back from the street a lot reaches, in metres. */
  lotDepth?: number
  /**
   * Variation in lot width, 0 to 1.
   *
   * Uniform frontages read as a terrace of identical houses, which is the other
   * classic generated-city tell. A little jitter is most of what makes a street
   * wall look accumulated rather than stamped.
   */
  jitter?: number
  seed?: number
}

export function subdivideBlock({
  blockId,
  jitter = 0.35,
  lotDepth = 24,
  lotWidth = 18,
  polygon,
  seed = 1
}: SubdivideBlockOptions): Lot[] {
  if (polygon.length < 3) return []

  const lots: Lot[] = []
  let random = mulberry32(seed)
  let counter = 0

  // A block too shallow for two lots back to back gets one row that meets in
  // the middle, rather than two rows overlapping through each other.
  const inradius = approximateInradius(polygon)
  const depth = Math.min(lotDepth, Math.max(4, inradius * 0.95))

  for (let edge = 0; edge < polygon.length; edge += 1) {
    const a = polygon[edge]!
    const b = polygon[(edge + 1) % polygon.length]!

    const dx = b.x - a.x
    const dz = b.z - a.z
    const edgeLength = Math.hypot(dx, dz)
    if (edgeLength < lotWidth * 0.5) continue

    const ux = dx / edgeLength
    const uz = dz / edgeLength
    // Inward normal for a counter-clockwise ring; the outward one faces street.
    const inX = uz
    const inZ = -ux

    // Whole lots only, then the remainder shared out. A leftover sliver at the
    // end of every block is the kind of artefact that survives all the way to
    // the final render.
    const count = Math.max(1, Math.round(edgeLength / lotWidth))
    const baseWidth = edgeLength / count

    let cursor = 0
    for (let index = 0; index < count; index += 1) {
      const remaining = count - index
      const wobble = 1 + (random() * 2 - 1) * jitter
      const width =
        index === count - 1
          ? edgeLength - cursor
          : Math.min(
              Math.max(baseWidth * wobble, baseWidth * 0.5),
              (edgeLength - cursor) - baseWidth * 0.5 * (remaining - 1)
            )

      if (width <= 0.5) continue

      const startX = a.x + ux * cursor
      const startZ = a.z + uz * cursor
      const endX = a.x + ux * (cursor + width)
      const endZ = a.z + uz * (cursor + width)

      const points: Point2[] = [
        { x: startX, z: startZ },
        { x: endX, z: endZ },
        { x: endX + inX * depth, z: endZ + inZ * depth },
        { x: startX + inX * depth, z: startZ + inZ * depth }
      ]

      lots.push({
        area: polygonArea(points),
        depth,
        facing: { x: -inX, z: -inZ },
        frontage: { x: (startX + endX) / 2, z: (startZ + endZ) / 2 },
        frontageWidth: width,
        id: `${blockId}_l${counter}`,
        points
      })

      counter += 1
      cursor += width
    }
  }

  return lots
}

/**
 * Roughly how far inward a polygon can be pushed before it collapses.
 *
 * The true inradius needs a medial axis; the area-to-perimeter ratio is within
 * a few percent for the convex, roughly rectangular blocks a street grid makes,
 * and costs a loop instead of a library.
 */
function approximateInradius(polygon: readonly Point2[]): number {
  let perimeter = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!
    const b = polygon[(index + 1) % polygon.length]!
    perimeter += Math.hypot(b.x - a.x, b.z - a.z)
  }
  if (perimeter === 0) return 0
  return (2 * polygonArea(polygon)) / perimeter
}

/** Small deterministic PRNG, so the same seed rebuilds the same city. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

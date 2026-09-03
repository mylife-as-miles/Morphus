/**
 * The buildable ground between streets.
 *
 * A block is not the rectangle joining four junctions -- that rectangle is
 * measured along street *centrelines*, so half of every street lies inside it.
 * Building on it would put the front door in the middle of the carriageway.
 * The buildable block is that rectangle inset by each street's own half-width
 * plus its footway, which is why the inset is computed per edge rather than
 * once: an avenue and an alley bounding the same block take very different
 * bites out of it.
 */

import {
  segmentFootprintWidth,
  type RoadNetwork,
  type RoadSegment
} from '../network/roadNetwork'

export interface Point2 {
  x: number
  z: number
}

export interface BlockPolygon {
  id: string
  /** Buildable boundary, counter-clockwise seen from above. */
  points: Point2[]
  /** Ground area in square metres, after the street inset. */
  area: number
}

export interface BuildBlockPolygonsOptions {
  network: RoadNetwork
  /** Corner node ids per block, in order around the block. */
  blockCorners: readonly (readonly string[])[]
  /**
   * Extra setback from the kerb, in metres.
   *
   * Zero puts the building line hard against the footway, which is right for a
   * dense downtown and wrong for a suburb. It is a separate knob from the
   * street width because it is an authoring choice rather than a fact about
   * the road.
   */
  setback?: number
}

export function buildBlockPolygons({
  blockCorners,
  network,
  setback = 0
}: BuildBlockPolygonsOptions): BlockPolygon[] {
  const blocks: BlockPolygon[] = []

  blockCorners.forEach((corners, index) => {
    const ring = corners
      .map((id) => network.nodes[id])
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => ({ x: node.x, z: node.z }))

    if (ring.length < 3) return

    const oriented = isClockwise(ring) ? [...ring].reverse() : ring
    const insets = oriented.map((_, corner) => {
      const from = corners[corner]!
      const to = corners[(corner + 1) % corners.length]!
      const segment = findSegment(network, from, to)
      const halfWidth = segment ? segmentFootprintWidth(segment) / 2 : 0
      return halfWidth + setback
    })

    const points = insetPolygon(oriented, insets)
    if (points.length < 3) return

    const area = polygonArea(points)
    // A block swallowed by the streets around it is not a small block, it is a
    // junction with delusions. Dropping it beats emitting an inside-out ring.
    if (area < 1) return

    blocks.push({ area, id: `b_${index}`, points })
  })

  return blocks
}

function findSegment(
  network: RoadNetwork,
  a: string,
  b: string
): RoadSegment | undefined {
  return Object.values(network.segments).find(
    (segment) =>
      (segment.from === a && segment.to === b) || (segment.from === b && segment.to === a)
  )
}

/**
 * Moves every edge inward by its own distance and re-intersects them.
 *
 * Offsetting the *edges* and finding the new corners, rather than pushing each
 * corner along its bisector, is what lets neighbouring edges inset by different
 * amounts -- which is the whole point when an avenue and an alley meet.
 */
export function insetPolygon(points: readonly Point2[], insets: readonly number[]): Point2[] {
  const count = points.length
  if (count < 3) return []

  const lines: { px: number; pz: number; dx: number; dz: number }[] = []

  for (let index = 0; index < count; index += 1) {
    const a = points[index]!
    const b = points[(index + 1) % count]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.hypot(dx, dz)
    if (length === 0) return []

    const ux = dx / length
    const uz = dz / length
    // Inward normal for a counter-clockwise ring.
    const nx = uz
    const nz = -ux
    const inset = insets[index] ?? 0

    lines.push({ dx: ux, dz: uz, px: a.x + nx * inset, pz: a.z + nz * inset })
  }

  const result: Point2[] = []
  for (let index = 0; index < count; index += 1) {
    const previous = lines[(index - 1 + count) % count]!
    const current = lines[index]!
    const point = intersect(previous, current)
    if (!point) return []
    result.push(point)
  }

  return result
}

function intersect(
  a: { px: number; pz: number; dx: number; dz: number },
  b: { px: number; pz: number; dx: number; dz: number }
): Point2 | null {
  const denominator = a.dx * b.dz - a.dz * b.dx
  // Parallel edges never re-intersect, which happens on a degenerate block.
  if (Math.abs(denominator) < 1e-9) return null

  const t = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / denominator
  return { x: a.px + a.dx * t, z: a.pz + a.dz * t }
}

export function polygonArea(points: readonly Point2[]): number {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!
    const b = points[(index + 1) % points.length]!
    total += a.x * b.z - b.x * a.z
  }
  return Math.abs(total) / 2
}

function isClockwise(points: readonly Point2[]): boolean {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!
    const b = points[(index + 1) % points.length]!
    total += (b.x - a.x) * (b.z + a.z)
  }
  return total > 0
}

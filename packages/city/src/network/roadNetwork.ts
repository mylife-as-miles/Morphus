/**
 * The street network: what a city is laid out *on*.
 *
 * A planar graph of intersections joined by segments. Everything downstream
 * reads from this -- the road surface, the blocks enclosed between streets, the
 * lots those blocks divide into, and the buildings that stand on the lots -- so
 * it is deliberately the smallest description that can carry all of them, and
 * it holds no geometry of its own.
 *
 * Segments carry an explicit width rather than deriving one from their class.
 * A city reads as real largely through the hierarchy of its streets, and an
 * author needs to widen one avenue without inventing a new class for it.
 */

/** An intersection, or a dead end where only one segment meets. */
export interface RoadNode {
  id: string
  x: number
  z: number
}

/**
 * The role a street plays, which sets its defaults and its drawing order.
 *
 * Not a width: `arterial` is a claim about the street's place in the hierarchy,
 * and the widths below are only where an author starts.
 */
export type RoadClass = 'arterial' | 'street' | 'alley'

export interface RoadSegment {
  id: string
  /** Endpoint node ids. Order sets which side is "left" for kerb offsets. */
  from: string
  to: string
  /**
   * Intermediate control points, in world metres.
   *
   * Absent for a straight run, which is most of a gridded city. When present
   * the centreline is a centripetal Catmull-Rom through node, waypoints, node.
   */
  waypoints?: readonly { x: number; z: number }[]
  roadClass: RoadClass
  /** Carriageway width in metres, kerb to kerb, excluding footways. */
  width: number
  /** Footway width in metres, per side. Zero for an alley. */
  sidewalkWidth: number
  /** Travel lanes, used for markings rather than for width. */
  lanes: number
}

export interface RoadNetwork {
  nodes: Record<string, RoadNode>
  segments: Record<string, RoadSegment>
}

/** A zebra crossing positioned along one source graph segment. */
export interface RoadCrosswalk {
  id: string
  segmentId: string
  /** Zero is the segment's `from` node and one is its `to` node. */
  position: number
  /** Length of the striped band along the street, in metres. */
  width: number
}

/** Sensible starting widths, in metres, by street class. */
export const ROAD_CLASS_DEFAULTS: Record<RoadClass, { width: number; sidewalkWidth: number; lanes: number }> = {
  alley: { width: 5, sidewalkWidth: 0, lanes: 1 },
  arterial: { width: 16, sidewalkWidth: 4, lanes: 4 },
  street: { width: 9, sidewalkWidth: 3, lanes: 2 }
}

export function emptyRoadNetwork(): RoadNetwork {
  return { nodes: {}, segments: {} }
}

/** Total width including both footways -- what the block edge sits outside of. */
export function segmentFootprintWidth(segment: RoadSegment): number {
  return segment.width + segment.sidewalkWidth * 2
}

/** Segments touching a node, which is what makes a junction a junction. */
export function segmentsAtNode(network: RoadNetwork, nodeId: string): RoadSegment[] {
  return Object.values(network.segments).filter(
    (segment) => segment.from === nodeId || segment.to === nodeId
  )
}

/**
 * The centreline as a polyline, in world metres.
 *
 * Centripetal Catmull-Rom, the one variant that cannot loop or cusp when
 * control points are dragged close together -- and tightening a corner is
 * exactly when an author drags them close together. A straight segment skips
 * the spline entirely so a gridded city stays exact rather than approximated.
 */
export function sampleSegmentCentreline(
  network: RoadNetwork,
  segment: RoadSegment,
  spacing = 4
): { x: number; z: number }[] {
  const from = network.nodes[segment.from]
  const to = network.nodes[segment.to]
  if (!from || !to) return []

  const waypoints = segment.waypoints ?? []
  if (waypoints.length === 0) return subdivide(from, to, spacing)

  const control = [from, ...waypoints, to]
  const points: { x: number; z: number }[] = []

  for (let index = 0; index < control.length - 1; index += 1) {
    const p0 = control[Math.max(0, index - 1)]!
    const p1 = control[index]!
    const p2 = control[index + 1]!
    const p3 = control[Math.min(control.length - 1, index + 2)]!
    const span = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    const steps = Math.max(2, Math.ceil(span / spacing))
    for (let step = 0; step < steps; step += 1) {
      points.push(catmullRom(p0, p1, p2, p3, step / steps))
    }
  }

  points.push({ x: to.x, z: to.z })
  return points
}

function subdivide(
  a: { x: number; z: number },
  b: { x: number; z: number },
  spacing: number
): { x: number; z: number }[] {
  const span = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(span / spacing))
  const points: { x: number; z: number }[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
  }
  return points
}

/** Centripetal Catmull-Rom, alpha = 0.5. */
function catmullRom(
  p0: { x: number; z: number },
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  p3: { x: number; z: number },
  t: number
): { x: number; z: number } {
  const t0 = 0
  const t1 = t0 + Math.sqrt(Math.hypot(p1.x - p0.x, p1.z - p0.z)) || t0 + 1
  const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.z - p1.z)) || t1 + 1
  const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.z - p2.z)) || t2 + 1
  const time = t1 + (t2 - t1) * t

  const a1 = lerp(p0, p1, safeDiv(t1 - time, t1 - t0), safeDiv(time - t0, t1 - t0))
  const a2 = lerp(p1, p2, safeDiv(t2 - time, t2 - t1), safeDiv(time - t1, t2 - t1))
  const a3 = lerp(p2, p3, safeDiv(t3 - time, t3 - t2), safeDiv(time - t2, t3 - t2))
  const b1 = lerp(a1, a2, safeDiv(t2 - time, t2 - t0), safeDiv(time - t0, t2 - t0))
  const b2 = lerp(a2, a3, safeDiv(t3 - time, t3 - t1), safeDiv(time - t1, t3 - t1))

  return lerp(b1, b2, safeDiv(t2 - time, t2 - t1), safeDiv(time - t1, t2 - t1))
}

function lerp(
  a: { x: number; z: number },
  b: { x: number; z: number },
  wa: number,
  wb: number
): { x: number; z: number } {
  return { x: a.x * wa + b.x * wb, z: a.z * wa + b.z * wb }
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

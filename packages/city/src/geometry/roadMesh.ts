/**
 * Turns a street network into drawable geometry.
 *
 * Renderer-free on purpose, exactly like the tree generator: this returns typed
 * arrays and nothing else, so it can move to a worker later without touching a
 * line of it, and so the same output can feed a WebGL mesh, a WebGPU node
 * material, or an export.
 *
 * Three surfaces come out of a segment, not one: the carriageway, and a footway
 * either side raised by a kerb. Drawing a street as a single flat ribbon is the
 * single clearest "this is a prototype" tell -- the kerb line is what the eye
 * reads as a street edge, and it is also what a building lot is measured from.
 */

import {
  sampleSegmentCentreline,
  segmentsAtNode,
  type RoadNetwork,
  type RoadSegment
} from '../network/roadNetwork'

/** Samples the ground so streets follow terrain instead of floating over it. */
export type GroundHeight = (x: number, z: number) => number

export interface RoadMeshData {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  colors: Float32Array
  indices: Uint32Array
  /** Vertex count, for callers that want to size buffers before building. */
  vertexCount: number
}

export interface BuildRoadMeshOptions {
  network: RoadNetwork
  groundHeight?: GroundHeight
  /**
   * Kerb height in metres.
   *
   * Small, but not zero: at 0.15m it reads as a kerb from street level and
   * still disappears from the air, which is the right trade for a surface seen
   * from both.
   */
  kerbHeight?: number
  /**
   * Lift of the whole road surface above the terrain, in metres.
   *
   * Terrain and road are separate meshes sampling the same heightfield, so
   * without a bias they z-fight along every metre of every street. This is the
   * cheapest fix that does not require depth tricks in the material.
   */
  surfaceBias?: number
}

const CARRIAGEWAY_COLOUR = [0.24, 0.24, 0.26] as const
const FOOTWAY_COLOUR = [0.52, 0.51, 0.5] as const
const JUNCTION_COLOUR = [0.26, 0.26, 0.28] as const

/**
 * Builds the whole network's surface as one mesh.
 *
 * One mesh rather than one per street: a gridded downtown is hundreds of
 * segments, and hundreds of draw calls for flat grey ground is the wrong place
 * to spend a frame. Colour rides in a vertex attribute so carriageway, footway
 * and junction can differ without splitting the buffer.
 */
export function buildRoadMesh({
  groundHeight,
  kerbHeight = 0.15,
  network,
  surfaceBias = 0.06
}: BuildRoadMeshOptions): RoadMeshData {
  const builder = createBuilder()
  const height = groundHeight ?? (() => 0)

  for (const segment of Object.values(network.segments)) {
    addSegment(builder, network, segment, height, kerbHeight, surfaceBias)
  }

  for (const node of Object.values(network.nodes)) {
    addJunction(builder, network, node.id, height, surfaceBias)
  }

  return finishBuilder(builder)
}

interface Builder {
  positions: number[]
  normals: number[]
  uvs: number[]
  colors: number[]
  indices: number[]
}

function createBuilder(): Builder {
  return { colors: [], indices: [], normals: [], positions: [], uvs: [] }
}

function finishBuilder(builder: Builder): RoadMeshData {
  return {
    colors: Float32Array.from(builder.colors),
    indices: Uint32Array.from(builder.indices),
    normals: Float32Array.from(builder.normals),
    positions: Float32Array.from(builder.positions),
    uvs: Float32Array.from(builder.uvs),
    vertexCount: builder.positions.length / 3
  }
}

function pushVertex(
  builder: Builder,
  x: number,
  y: number,
  z: number,
  u: number,
  v: number,
  colour: readonly number[]
): number {
  const index = builder.positions.length / 3
  builder.positions.push(x, y, z)
  // Every surface here is a road deck: flat enough that a true normal buys
  // nothing a shading-correct up-vector does not already give.
  builder.normals.push(0, 1, 0)
  builder.uvs.push(u, v)
  builder.colors.push(colour[0]!, colour[1]!, colour[2]!)
  return index
}

/** A quad as two triangles, wound counter-clockwise seen from above. */
function pushQuad(builder: Builder, a: number, b: number, c: number, d: number): void {
  builder.indices.push(a, b, c, a, c, d)
}

function addSegment(
  builder: Builder,
  network: RoadNetwork,
  segment: RoadSegment,
  height: GroundHeight,
  kerbHeight: number,
  surfaceBias: number
): void {
  const centreline = sampleSegmentCentreline(network, segment)
  if (centreline.length < 2) return

  const halfRoad = segment.width / 2
  const halfWalk = halfRoad + segment.sidewalkWidth

  // Junctions own the ground around a node, so each segment stops short of both
  // ends. Without this, two crossing streets both paint the same square and the
  // overlap z-fights -- and the crossing reads as a seam rather than a junction.
  const trimStart = junctionRadius(network, segment.from)
  const trimEnd = junctionRadius(network, segment.to)
  const trimmed = trimPolyline(centreline, trimStart, trimEnd)
  if (trimmed.length < 2) return

  let distance = 0
  const rows: {
    left: number
    leftKerb: number
    rightKerb: number
    right: number
    leftWalk: number
    rightWalk: number
  }[] = []

  for (let index = 0; index < trimmed.length; index += 1) {
    const point = trimmed[index]!
    const previous = trimmed[Math.max(0, index - 1)]!
    const next = trimmed[Math.min(trimmed.length - 1, index + 1)]!

    // Normal from the local tangent, so a curved street's kerbs stay parallel.
    const tangentX = next.x - previous.x
    const tangentZ = next.z - previous.z
    const length = Math.hypot(tangentX, tangentZ) || 1
    const normalX = -tangentZ / length
    const normalZ = tangentX / length

    if (index > 0) {
      distance += Math.hypot(point.x - previous.x, point.z - previous.z)
    }

    const v = distance / 8

    // Height is sampled at each edge, not once at the centreline.
    //
    // Reusing the centreline height across the full width tilts nothing and
    // buries everything: on a cross-slope the uphill kerb sinks into the hill
    // and the downhill kerb hangs in the air by half the width times the
    // gradient. Measured on a default world that was 2.3 metres of float on a
    // 16m avenue, which is a road bridging its own kerb.
    //
    // Sampling per edge lets the deck follow the cross-slope instead. That is
    // still not what a real road does -- a real one cuts and fills the ground
    // to hold a near-level camber -- but it keeps the surface *on* the terrain,
    // which is the part an author notices. The corridor cut belongs with the
    // terrain modifier stack, not here.
    const leftX = point.x + normalX * halfRoad
    const leftZ = point.z + normalZ * halfRoad
    const rightX = point.x - normalX * halfRoad
    const rightZ = point.z - normalZ * halfRoad
    const leftWalkX = point.x + normalX * halfWalk
    const leftWalkZ = point.z + normalZ * halfWalk
    const rightWalkX = point.x - normalX * halfWalk
    const rightWalkZ = point.z - normalZ * halfWalk

    const leftGround = height(leftX, leftZ) + surfaceBias
    const rightGround = height(rightX, rightZ) + surfaceBias

    rows.push({
      left: pushVertex(builder, leftX, leftGround, leftZ, 0, v, CARRIAGEWAY_COLOUR),
      leftKerb: pushVertex(builder, leftX, leftGround + kerbHeight, leftZ, 0, v, FOOTWAY_COLOUR),
      leftWalk: pushVertex(builder, leftWalkX, height(leftWalkX, leftWalkZ) + surfaceBias + kerbHeight, leftWalkZ, 1, v, FOOTWAY_COLOUR),
      right: pushVertex(builder, rightX, rightGround, rightZ, 1, v, CARRIAGEWAY_COLOUR),
      rightKerb: pushVertex(builder, rightX, rightGround + kerbHeight, rightZ, 1, v, FOOTWAY_COLOUR),
      rightWalk: pushVertex(builder, rightWalkX, height(rightWalkX, rightWalkZ) + surfaceBias + kerbHeight, rightWalkZ, 0, v, FOOTWAY_COLOUR)
    })
  }

  for (let index = 0; index < rows.length - 1; index += 1) {
    const a = rows[index]!
    const b = rows[index + 1]!

    pushQuad(builder, a.left, b.left, b.right, a.right)

    if (segment.sidewalkWidth > 0) {
      // Kerb face then footway, per side. The face is what makes the footway
      // read as raised rather than as a differently coloured stripe of road.
      pushQuad(builder, a.leftKerb, b.leftKerb, b.left, a.left)
      pushQuad(builder, a.leftWalk, b.leftWalk, b.leftKerb, a.leftKerb)
      pushQuad(builder, a.right, b.right, b.rightKerb, a.rightKerb)
      pushQuad(builder, a.rightKerb, b.rightKerb, b.rightWalk, a.rightWalk)
    }
  }
}

/**
 * How far back from a node its segments stop.
 *
 * Half the widest street meeting there: narrow enough that a side street does
 * not leave a gap, wide enough that the avenue's own width is covered.
 */
function junctionRadius(network: RoadNetwork, nodeId: string): number {
  const segments = segmentsAtNode(network, nodeId)
  if (segments.length < 2) return 0
  let widest = 0
  for (const segment of segments) {
    widest = Math.max(widest, segment.width + segment.sidewalkWidth * 2)
  }
  return widest / 2
}

/**
 * The deck that fills a junction.
 *
 * A convex fan around the node out to its radius. That is not the true shape of
 * a junction -- real ones are bounded by the kerb returns of the streets that
 * meet there -- but it covers the hole exactly, costs a handful of triangles,
 * and is the right placeholder until kerb returns exist.
 */
function addJunction(
  builder: Builder,
  network: RoadNetwork,
  nodeId: string,
  height: GroundHeight,
  surfaceBias: number
): void {
  const node = network.nodes[nodeId]
  if (!node) return

  const radius = junctionRadius(network, nodeId)
  if (radius <= 0) return

  const ground = height(node.x, node.z) + surfaceBias
  const centre = pushVertex(builder, node.x, ground, node.z, 0.5, 0.5, JUNCTION_COLOUR)

  const steps = 16
  const rim: number[] = []
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2
    const x = node.x + Math.cos(angle) * radius
    const z = node.z + Math.sin(angle) * radius
    rim.push(
      pushVertex(builder, x, height(x, z) + surfaceBias, z, 0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5, JUNCTION_COLOUR)
    )
  }

  for (let step = 0; step < steps; step += 1) {
    builder.indices.push(centre, rim[step]!, rim[(step + 1) % steps]!)
  }
}

/** Drops `start` and `end` metres from the two ends of a polyline. */
function trimPolyline(
  points: readonly { x: number; z: number }[],
  start: number,
  end: number
): { x: number; z: number }[] {
  if (start <= 0 && end <= 0) return [...points]

  const lengths: number[] = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.z - points[index - 1]!.z)
    lengths.push(total)
  }

  const from = start
  const to = total - end
  // A short segment between two wide avenues can be swallowed whole. Better to
  // drop it and let the junctions meet than to emit an inside-out ribbon.
  if (to <= from) return []

  return [pointAt(points, lengths, from), ...points.filter((_, index) => lengths[index]! > from && lengths[index]! < to), pointAt(points, lengths, to)]
}

function pointAt(
  points: readonly { x: number; z: number }[],
  lengths: readonly number[],
  target: number
): { x: number; z: number } {
  for (let index = 1; index < points.length; index += 1) {
    if (lengths[index]! >= target) {
      const span = lengths[index]! - lengths[index - 1]!
      const t = span === 0 ? 0 : (target - lengths[index - 1]!) / span
      const a = points[index - 1]!
      const b = points[index]!
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
    }
  }
  return { ...points[points.length - 1]! }
}

/**
 * Adapts Morphus's small street graph to three-roads.
 *
 * The graph remains the authoring source for blocks, lots and massing. Roads
 * need a different topology for rendering: a grid stores one segment per block
 * edge, while three-roads needs the uninterrupted avenue so it can split the
 * crossing itself and own the kerb returns. This adapter is the only place the
 * two representations meet.
 */

import {
  addLaneMarkingIntent,
  addRoadStroke,
  addRoadTemplate,
  compileRoadNetwork,
  createRoadAuthoringDocument,
  germanRoadPreset,
  makeLineSegment,
  referenceLineLength,
  resolveAutomaticNetwork,
  solveDesignAlignment,
  type GeometrySegment,
  type RoadAuthoringDocument,
  type RoadNetworkCompilation,
  type RoadStroke,
  type RoadTemplate
} from '@three-roads/core'
import {
  buildRoadSurfaceModel,
  meshRoadSurfaceChunks,
  type IndexedRoadMesh,
  type RoadMeshChunk
} from '@three-roads/mesher'

import type { RoadCrosswalk, RoadNetwork, RoadSegment } from '../network/roadNetwork'

/** Samples the ground so streets follow terrain instead of floating over it. */
export type GroundHeight = (x: number, z: number) => number

export interface RoadMeshMaterialGroup {
  materialClass: string
  indexStart: number
  indexCount: number
}

/** Renderer-neutral buffers, already converted from Z-up to Three.js Y-up. */
export interface RoadRenderMeshData {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  groups: RoadMeshMaterialGroup[]
  vertexCount: number
}

export interface RoadSegmentLocation {
  strokeId: string
  sStart: number
  sEnd: number
  /** True when increasing stroke station runs from the segment's `to` to `from`. */
  reversed: boolean
}

export interface ThreeRoadsAuthoringResult {
  document: RoadAuthoringDocument
  segmentLocations: Map<string, RoadSegmentLocation>
}

export interface BuildRoadSurfaceMeshesOptions {
  network: RoadNetwork
  crosswalks?: readonly RoadCrosswalk[]
  groundHeight?: GroundHeight
  /** Small separation from the terrain, before three-roads's own kerb and paint lift. */
  surfaceBias?: number
}

export interface RoadSurfaceMeshes {
  compilation: RoadNetworkCompilation
  surface: RoadRenderMeshData
  markings: RoadRenderMeshData
  chunks: number
}

const COLLINEAR_DOT = -0.999_99
const EMPTY_HEIGHT: GroundHeight = () => 0
const MARKING_HEIGHT = 0.003
const TERRAIN_MAX_EDGE_LENGTH = 4
const MAX_TESSELLATION_PASSES = 16

/**
 * Builds the persistent three-roads source document for one Morphus graph.
 *
 * Collinear edges are paired even at a four-way graph node. Merely following
 * degree-two nodes would stop every avenue at every crossing, giving the
 * compiler four unrelated stubs and losing the continuous centre markings.
 */
export function createThreeRoadsDocument({
  crosswalks = [],
  network
}: {
  network: RoadNetwork
  crosswalks?: readonly RoadCrosswalk[]
}): ThreeRoadsAuthoringResult {
  let document = createRoadAuthoringDocument({ id: 'morphus-city-roads', name: 'Morphus city roads' })
  const segmentLocations = new Map<string, RoadSegmentLocation>()
  const authoredStrokes = buildAuthoredStrokes(network)
  const templates = new Map<string, RoadTemplate>()

  for (const authored of authoredStrokes) {
    const template = templateForSegment(authored.segments[0]!.segment)
    templates.set(template.id, template)
    document = addRoadStroke(document, {
      // Zero-valued records look redundant, but every record station is a
      // forced mesher sample. Without them a mathematically straight 400 m
      // avenue can remain one quad and bridge straight over authored hills.
      elevation: flatSamplingStations(authored.geometry),
      geometry: authored.geometry,
      id: authored.id,
      name: authored.name,
      templateSpans: [{ templateId: template.id, s: 0 }]
    })

    for (const located of authored.segments) {
      segmentLocations.set(located.segment.id, {
        reversed: located.reversed,
        sEnd: located.sEnd,
        sStart: located.sStart,
        strokeId: authored.id
      })
    }
  }

  for (const template of [...templates.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    document = addRoadTemplate(document, template)
  }

  const templateByStroke = new Map(
    document.strokes.map((stroke) => [stroke.id, templates.get(stroke.templateSpans[0]!.templateId)!])
  )
  for (const crosswalk of crosswalks) {
    const location = segmentLocations.get(crosswalk.segmentId)
    if (!location) continue
    const template = templateByStroke.get(location.strokeId)
    if (!template) continue
    const laneRoles = template.lanes
      .filter((lane) => lane.type === 'driving' || lane.type === 'shared')
      .map((lane) => lane.role)
    if (laneRoles.length === 0) continue

    const segmentLength = location.sEnd - location.sStart
    const position = Math.max(0, Math.min(1, crosswalk.position))
    const alongStroke = location.reversed ? 1 - position : position
    const centre = location.sStart + segmentLength * alongStroke
    const halfWidth = Math.min(Math.max(0.25, crosswalk.width) / 2, segmentLength / 2)

    document = addLaneMarkingIntent(document, {
      color: 'white',
      id: crosswalk.id,
      kind: 'zebra',
      laneRoles,
      roadId: location.strokeId,
      sEnd: Math.min(location.sEnd, centre + halfWidth),
      sStart: Math.max(location.sStart, centre - halfWidth)
    })
  }

  return { document, segmentLocations }
}

function flatSamplingStations(geometry: GeometrySegment[]) {
  const length = referenceLineLength({ geometry })
  const records = []
  for (let s = 0; s < length; s += TERRAIN_MAX_EDGE_LENGTH) {
    records.push({ a: 0, b: 0, c: 0, d: 0, s })
  }
  return records
}

/** Compiles and meshes both the road deck and its independent paint geometry. */
export function buildRoadSurfaceMeshes({
  crosswalks,
  groundHeight = EMPTY_HEIGHT,
  network,
  surfaceBias = 0.06
}: BuildRoadSurfaceMeshesOptions): RoadSurfaceMeshes {
  const authored = createThreeRoadsDocument({ crosswalks, network })
  const automatic = resolveAutomaticNetwork(authored.document, {
    junctionIdPrefix: 'morphus-junction',
    splitInteriorCrossings: true
  })
  // This is the editor's live surface pass, before traffic controls exist.
  // Interactive validation keeps geometry and topology checks but does not
  // reject a wide avenue merely because its lane-level priority is unfinished.
  const compilation = compileRoadNetwork(automatic.document, { validationProfile: 'interactive' })

  if (!compilation.ok || !compilation.network || !compilation.physicalTopology) {
    const detail = compilation.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('; ')
    throw new Error(`three-roads could not compile the street network${detail ? `: ${detail}` : ''}`)
  }

  const model = buildRoadSurfaceModel(compilation.network, compilation.physicalTopology, {
    // This controls curved alignment approximation, but three-roads correctly
    // leaves a planar corridor sparse. The indexed faces are tessellated again
    // below because terrain displacement needs a hard spatial edge limit even
    // when the authored road is perfectly straight.
    maxSegmentLength: TERRAIN_MAX_EDGE_LENGTH
  })
  const chunks = meshRoadSurfaceChunks(model)
  const prepared = prepareChunks(chunks, groundHeight, surfaceBias)

  return {
    chunks: chunks.length,
    compilation,
    markings: mergePreparedMeshes(prepared, 'markings'),
    surface: mergePreparedMeshes(prepared, 'surface')
  }
}

interface LocatedSegment {
  segment: RoadSegment
  reversed: boolean
  sStart: number
  sEnd: number
}

interface AuthoredStroke {
  id: string
  name: string
  geometry: GeometrySegment[]
  segments: LocatedSegment[]
}

function buildAuthoredStrokes(network: RoadNetwork): AuthoredStroke[] {
  const validSegments = Object.values(network.segments)
    .filter((segment) => validSegment(network, segment))
    .sort((left, right) => left.id.localeCompare(right.id))
  const byId = new Map(validSegments.map((segment) => [segment.id, segment]))
  const continuations = findCollinearContinuations(network, validSegments)
  const visited = new Set<string>()
  const strokes: AuthoredStroke[] = []

  for (const seed of validSegments) {
    if (visited.has(seed.id)) continue
    const start = findStrokeStart(seed, continuations, byId)
    const ordered: Array<{ segment: RoadSegment; entryNode: string }> = []
    let segment: RoadSegment | undefined = start.segment
    let entryNode = start.entryNode

    while (segment && !visited.has(segment.id)) {
      ordered.push({ entryNode, segment })
      visited.add(segment.id)
      const exitNode = otherNode(segment, entryNode)
      const nextId = continuationAt(continuations, segment.id, exitNode)
      segment = nextId ? byId.get(nextId) : undefined
      entryNode = exitNode
    }

    strokes.push(createAuthoredStroke(network, ordered))
  }

  return strokes
}

/**
 * Walks backwards to an actual endpoint before collecting a whole stroke.
 *
 * Segment IDs describe authoring history, not topology. Starting from the
 * lexically first segment used to split a continuous road whenever that ID
 * happened to belong to its middle. The visited guard also gives closed loops
 * a stable finite starting point even though they have no endpoint.
 */
function findStrokeStart(
  seed: RoadSegment,
  continuations: ReadonlyMap<string, string>,
  byId: ReadonlyMap<string, RoadSegment>
): { segment: RoadSegment; entryNode: string } {
  let segment = seed
  let entryNode = seed.from
  const traced = new Set([seed.id])

  while (true) {
    const nextId = continuationAt(continuations, segment.id, entryNode)
    if (!nextId || traced.has(nextId)) return { entryNode, segment }
    const next = byId.get(nextId)
    if (!next) return { entryNode, segment }

    traced.add(nextId)
    const sharedNode = entryNode
    segment = next
    entryNode = otherNode(next, sharedNode)
  }
}

function validSegment(network: RoadNetwork, segment: RoadSegment): boolean {
  const from = network.nodes[segment.from]
  const to = network.nodes[segment.to]
  return Boolean(from && to && Math.hypot(to.x - from.x, to.z - from.z) > 0.000_001)
}

/** Pairs the straight-through arms at each node, including degree-four nodes. */
function findCollinearContinuations(
  network: RoadNetwork,
  segments: readonly RoadSegment[]
): Map<string, string> {
  const incident = new Map<string, RoadSegment[]>()
  for (const segment of segments) {
    if ((segment.waypoints?.length ?? 0) > 0) continue
    for (const nodeId of [segment.from, segment.to]) {
      const atNode = incident.get(nodeId) ?? []
      atNode.push(segment)
      incident.set(nodeId, atNode)
    }
  }

  const result = new Map<string, string>()
  for (const [nodeId, atNode] of incident) {
    const candidates: Array<{ left: RoadSegment; right: RoadSegment; dot: number }> = []
    for (let leftIndex = 0; leftIndex < atNode.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < atNode.length; rightIndex += 1) {
        const left = atNode[leftIndex]!
        const right = atNode[rightIndex]!
        if (!sameCrossSection(left, right)) continue
        const dot = outwardDot(network, nodeId, left, right)
        if (dot <= COLLINEAR_DOT) candidates.push({ dot, left, right })
      }
    }

    const paired = new Set<string>()
    candidates.sort((left, right) => left.dot - right.dot || left.left.id.localeCompare(right.left.id))
    for (const candidate of candidates) {
      if (paired.has(candidate.left.id) || paired.has(candidate.right.id)) continue
      result.set(contactKey(candidate.left.id, nodeId), candidate.right.id)
      result.set(contactKey(candidate.right.id, nodeId), candidate.left.id)
      paired.add(candidate.left.id)
      paired.add(candidate.right.id)
    }
  }
  return result
}

function sameCrossSection(left: RoadSegment, right: RoadSegment): boolean {
  return left.roadClass === right.roadClass &&
    left.lanes === right.lanes &&
    Math.abs(left.width - right.width) < 0.000_001 &&
    Math.abs(left.sidewalkWidth - right.sidewalkWidth) < 0.000_001
}

function outwardDot(
  network: RoadNetwork,
  nodeId: string,
  left: RoadSegment,
  right: RoadSegment
): number {
  const node = network.nodes[nodeId]!
  const leftNode = network.nodes[otherNode(left, nodeId)]!
  const rightNode = network.nodes[otherNode(right, nodeId)]!
  const leftLength = Math.hypot(leftNode.x - node.x, leftNode.z - node.z)
  const rightLength = Math.hypot(rightNode.x - node.x, rightNode.z - node.z)
  return ((leftNode.x - node.x) * (rightNode.x - node.x) +
    (leftNode.z - node.z) * (rightNode.z - node.z)) / (leftLength * rightLength)
}

function continuationAt(
  continuations: ReadonlyMap<string, string>,
  segmentId: string,
  nodeId: string
): string | undefined {
  return continuations.get(contactKey(segmentId, nodeId))
}

function contactKey(segmentId: string, nodeId: string): string {
  return `${segmentId}\u0000${nodeId}`
}

function otherNode(segment: RoadSegment, nodeId: string): string {
  return segment.from === nodeId ? segment.to : segment.from
}

function createAuthoredStroke(
  network: RoadNetwork,
  ordered: readonly { segment: RoadSegment; entryNode: string }[]
): AuthoredStroke {
  const first = ordered[0]!
  const strokeId = `morphus-road|${first.segment.id}`

  if (ordered.length === 1 && (first.segment.waypoints?.length ?? 0) > 0) {
    const geometry = curvedGeometry(network, first.segment)
    const length = geometry.reduce((sum, segment) => sum + segment.length, 0)
    return {
      geometry,
      id: strokeId,
      name: first.segment.id,
      segments: [{
        reversed: false,
        sEnd: length,
        sStart: 0,
        segment: first.segment
      }]
    }
  }

  const start = network.nodes[first.entryNode]!
  const firstExit = network.nodes[otherNode(first.segment, first.entryNode)]!
  const heading = Math.atan2(firstExit.z - start.z, firstExit.x - start.x)
  let station = 0
  const located: LocatedSegment[] = []
  for (const item of ordered) {
    const entry = network.nodes[item.entryNode]!
    const exit = network.nodes[otherNode(item.segment, item.entryNode)]!
    const length = Math.hypot(exit.x - entry.x, exit.z - entry.z)
    located.push({
      reversed: item.segment.from !== item.entryNode,
      sEnd: station + length,
      sStart: station,
      segment: item.segment
    })
    station += length
  }

  return {
    geometry: [makeLineSegment(0, start.x, start.z, heading, station)],
    id: strokeId,
    name: ordered.map(({ segment }) => segment.id).join(' + '),
    segments: located
  }
}

/**
 * Fits a G1 cubic chain through authored waypoints.
 *
 * Hard-joining sampled line records is rejected by three-roads and would kink
 * lane boundaries even if accepted. Shared endpoint tangents keep the source
 * curve smooth while leaving straight grid streets on the exact line path.
 */
function curvedGeometry(network: RoadNetwork, segment: RoadSegment): GeometrySegment[] {
  const from = network.nodes[segment.from]!
  const to = network.nodes[segment.to]!
  const points = [from, ...(segment.waypoints ?? []), to]
  const headings = points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!
    const next = points[Math.min(points.length - 1, index + 1)]!
    return Math.atan2(next.z - previous.z, next.x - previous.x)
  })

  const elements = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]!
    const chord = Math.hypot(next.x - point.x, next.z - point.z)
    const handle = chord / 3
    const heading = headings[index]!
    const endHeading = headings[index + 1]!
    const control1 = { x: point.x + Math.cos(heading) * handle, z: point.z + Math.sin(heading) * handle }
    const control2 = { x: next.x - Math.cos(endHeading) * handle, z: next.z - Math.sin(endHeading) * handle }
    return {
      control1: toLocal(control1, point, heading),
      control2: toLocal(control2, point, heading),
      end: toLocal(next, point, heading),
      id: `${segment.id}|curve-${index}`,
      kind: 'cubic' as const
    }
  })

  return solveDesignAlignment({
    elements,
    id: `${segment.id}|alignment`,
    start: { heading: headings[0]!, x: from.x, y: from.z }
  }).geometry
}

function toLocal(
  point: { x: number; z: number },
  origin: { x: number; z: number },
  heading: number
): { x: number; y: number } {
  const dx = point.x - origin.x
  const dz = point.z - origin.z
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)
  return { x: dx * cos + dz * sin, y: -dx * sin + dz * cos }
}

function templateForSegment(segment: RoadSegment): RoadTemplate {
  const presetId = segment.lanes >= 4 ? 'de-urban-four-lane' : 'de-urban-two-way'
  const preset = germanRoadPreset(presetId)
  const hasFootway = segment.sidewalkWidth > 0
  let lanes = preset.template.lanes.filter((lane) => hasFootway || (lane.type !== 'border' && lane.type !== 'sidewalk'))

  // A one-lane alley is physically shared, but retaining one lane per travel
  // direction gives the automatic junction resolver the incoming and outgoing
  // roles it needs. With no kerb or footway its total width is still exact.
  const driving = lanes.filter((lane) => lane.type === 'driving')
  const borderWidth = hasFootway ? Math.min(0.2, segment.width / 8) : 0
  const drivingWidth = Math.max(0.25, (segment.width - borderWidth * 2) / driving.length)
  lanes = lanes.map((lane) => {
    if (lane.type === 'driving') {
      return {
        ...lane,
        boundaryMarkings: segment.lanes === 1 ? [] : lane.boundaryMarkings,
        width: drivingWidth
      }
    }
    if (lane.type === 'border') return { ...lane, width: borderWidth }
    if (lane.type === 'sidewalk') return { ...lane, width: segment.sidewalkWidth }
    return lane
  })

  const signature = [segment.roadClass, segment.lanes, segment.width, segment.sidewalkWidth]
    .map((value) => String(value).replace(/[^a-z0-9]+/gi, '_'))
    .join('-')
  return {
    ...preset.template,
    // Morphus terrain is an arbitrary authored surface, not a surveyed road
    // design. Grade validation would reject terrain conformance before the
    // vertex pass can place it, so engineering limits do not belong here.
    designLimits: undefined,
    id: `morphus-template|${signature}`,
    lanes,
    name: `Morphus ${segment.roadClass}`
  }
}

interface PreparedMesh {
  mesh: TessellatedRoadMesh
  positions: number[]
}

interface PreparedChunk {
  markings: PreparedMesh
  surface: PreparedMesh
}

function prepareChunks(
  chunks: readonly RoadMeshChunk[],
  groundHeight: GroundHeight,
  surfaceBias: number
): PreparedChunk[] {
  const surfaces = chunks.map((chunk): PreparedMesh => {
    const surfaceMesh = tessellateForTerrain(chunk.mesh.surface, 'surface')
    return {
      mesh: surfaceMesh,
      positions: conformSurfacePositions(surfaceMesh.positions, groundHeight, surfaceBias)
    }
  })
  const projectionIndex = buildSurfaceProjectionIndex(surfaces)

  return chunks.map((chunk, index) => {
    const surface = surfaces[index]!
    const markingMesh = tessellateForTerrain(chunk.mesh.markings, 'markings')
    const markingPositions = conformMarkingPositions(
      markingMesh.positions,
      projectionIndex,
      groundHeight,
      surfaceBias
    )
    return {
      markings: { mesh: markingMesh, positions: markingPositions },
      surface
    }
  })
}

function mergePreparedMeshes(
  chunks: readonly PreparedChunk[],
  kind: 'surface' | 'markings'
): RoadRenderMeshData {
  const positions: number[] = []
  const uvs: number[] = []
  const indicesByMaterial = new Map<string, number[]>()
  let vertexOffset = 0

  for (const chunk of chunks) {
    const prepared = chunk[kind]
    for (const position of prepared.positions) positions.push(position)
    for (const uv of prepared.mesh.uvs) uvs.push(uv)
    appendMaterialTriangles(indicesByMaterial, prepared.mesh.triangles, vertexOffset)
    vertexOffset += prepared.mesh.positions.length / 3
  }

  const indices: number[] = []
  const groups: RoadMeshMaterialGroup[] = []
  for (const [materialClass, materialIndices] of [...indicesByMaterial].sort(([left], [right]) => left.localeCompare(right))) {
    if (materialIndices.length === 0) continue
    groups.push({ indexCount: materialIndices.length, indexStart: indices.length, materialClass })
    // A generated district can hold hundreds of thousands of indices. Spread
    // turns them into function arguments and exceeds V8's call-stack limit.
    for (const materialIndex of materialIndices) indices.push(materialIndex)
  }

  const positionArray = Float32Array.from(positions)
  const indexArray = Uint32Array.from(indices)
  return {
    groups,
    indices: indexArray,
    normals: calculateNormals(positionArray, indexArray),
    positions: positionArray,
    uvs: Float32Array.from(uvs),
    vertexCount: positionArray.length / 3
  }
}

function conformSurfacePositions(
  source: ArrayLike<number>,
  groundHeight: GroundHeight,
  surfaceBias: number
): number[] {
  const output: number[] = []
  for (let index = 0; index < source.length; index += 3) {
    const x = source[index]!
    const z = source[index + 1]!
    const localElevation = source[index + 2]!
    // three-roads is OpenDRIVE-style XY ground with Z elevation. Swapping the
    // last two axes puts it into Three.js, then the exact visible terrain
    // sampler moves each vertex without erasing kerb or marking height.
    output.push(x, groundHeight(x, z) + localElevation + surfaceBias, z)
  }
  return output
}

/**
 * Paint is placed on the deformed deck, not on a second terrain sample.
 *
 * Sampling terrain independently sounds equivalent, but the deck is a planar
 * interpolation between its sampled vertices. A stripe sampling the exact
 * nonlinear heightfield between those vertices can cut below that plane or
 * hover above it. Barycentric projection keeps all paint at three-roads's own
 * local lift over the surface that the renderer actually draws.
 */
function conformMarkingPositions(
  source: ArrayLike<number>,
  projectionIndex: SurfaceProjectionIndex,
  groundHeight: GroundHeight,
  surfaceBias: number
): number[] {
  const output: number[] = []
  for (let index = 0; index < source.length; index += 3) {
    const x = source[index]!
    const z = source[index + 1]!
    const localElevation = source[index + 2]!
    const projection = projectToSurface(
      x,
      z,
      localElevation,
      projectionIndex
    )
    if (projection) {
      // Junction patches can have a different local elevation basis than the
      // road chunk that owns the marking. The paint lift is a surface-space
      // constant, so retaining that raw difference would bury seam vertices.
      output.push(x, projection.height + MARKING_HEIGHT, z)
    } else {
      // Junction seams and future mesher semantics may leave paint just outside
      // its owner chunk. Exact terrain is a visible and deterministic fallback.
      output.push(x, groundHeight(x, z) + localElevation + surfaceBias, z)
    }
  }
  return output
}

interface SurfaceProjectionTriangle {
  conformedPositions: readonly number[]
  sourcePositions: readonly number[]
  triangle: MaterialTriangle
}

type SurfaceProjectionIndex = Map<string, SurfaceProjectionTriangle[]>

/**
 * Markings and surfaces can be owned by different chunks at a junction seam.
 * A four-metre grid keeps that cross-owner lookup local instead of comparing
 * every stripe vertex with every triangle in the district.
 */
function buildSurfaceProjectionIndex(surfaces: readonly PreparedMesh[]): SurfaceProjectionIndex {
  const index: SurfaceProjectionIndex = new Map()
  const epsilon = 0.000_01

  for (const surface of surfaces) {
    for (const triangle of surface.mesh.triangles) {
      const { a, b, c } = triangle
      const ax = surface.mesh.positions[a * 3]!
      const az = surface.mesh.positions[a * 3 + 1]!
      const bx = surface.mesh.positions[b * 3]!
      const bz = surface.mesh.positions[b * 3 + 1]!
      const cx = surface.mesh.positions[c * 3]!
      const cz = surface.mesh.positions[c * 3 + 1]!
      const minX = Math.floor((Math.min(ax, bx, cx) - epsilon) / TERRAIN_MAX_EDGE_LENGTH)
      const maxX = Math.floor((Math.max(ax, bx, cx) + epsilon) / TERRAIN_MAX_EDGE_LENGTH)
      const minZ = Math.floor((Math.min(az, bz, cz) - epsilon) / TERRAIN_MAX_EDGE_LENGTH)
      const maxZ = Math.floor((Math.max(az, bz, cz) + epsilon) / TERRAIN_MAX_EDGE_LENGTH)
      const entry: SurfaceProjectionTriangle = {
        conformedPositions: surface.positions,
        sourcePositions: surface.mesh.positions,
        triangle
      }

      for (let gridX = minX; gridX <= maxX; gridX += 1) {
        for (let gridZ = minZ; gridZ <= maxZ; gridZ += 1) {
          const key = projectionCellKey(gridX, gridZ)
          const bucket = index.get(key) ?? []
          bucket.push(entry)
          index.set(key, bucket)
        }
      }
    }
  }

  return index
}

function projectionCellKey(gridX: number, gridZ: number): string {
  return `${gridX}:${gridZ}`
}

function projectToSurface(
  x: number,
  z: number,
  markingElevation: number,
  projectionIndex: SurfaceProjectionIndex
): { height: number } | undefined {
  let best: { height: number } | undefined
  let bestScore = Number.POSITIVE_INFINITY
  const gridX = Math.floor(x / TERRAIN_MAX_EDGE_LENGTH)
  const gridZ = Math.floor(z / TERRAIN_MAX_EDGE_LENGTH)

  for (const candidate of projectionIndex.get(projectionCellKey(gridX, gridZ)) ?? []) {
    const weights = barycentricWeights(x, z, candidate.sourcePositions, candidate.triangle)
    if (!weights) continue
    const surfaceElevation = interpolateComponent(
      candidate.sourcePositions,
      candidate.triangle,
      weights,
      2
    )
    const localLift = markingElevation - surfaceElevation
    const score = Math.abs(localLift - MARKING_HEIGHT)
    if (score >= bestScore) continue

    bestScore = score
    best = {
      height: interpolateComponent(
        candidate.conformedPositions,
        candidate.triangle,
        weights,
        1
      )
    }
  }

  return best
}

type BarycentricWeights = readonly [number, number, number]

function barycentricWeights(
  x: number,
  z: number,
  positions: readonly number[],
  { a, b, c }: MaterialTriangle
): BarycentricWeights | undefined {
  const ax = positions[a * 3]!
  const az = positions[a * 3 + 1]!
  const bx = positions[b * 3]!
  const bz = positions[b * 3 + 1]!
  const cx = positions[c * 3]!
  const cz = positions[c * 3 + 1]!
  const epsilon = 0.000_01
  if (
    x < Math.min(ax, bx, cx) - epsilon
    || x > Math.max(ax, bx, cx) + epsilon
    || z < Math.min(az, bz, cz) - epsilon
    || z > Math.max(az, bz, cz) + epsilon
  ) return undefined

  const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
  if (Math.abs(denominator) < 0.000_000_001) return undefined
  const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator
  const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator
  const wc = 1 - wa - wb
  if (wa < -epsilon || wb < -epsilon || wc < -epsilon) return undefined
  return [wa, wb, wc]
}

function interpolateComponent(
  positions: readonly number[],
  { a, b, c }: MaterialTriangle,
  [wa, wb, wc]: BarycentricWeights,
  component: number
): number {
  return positions[a * 3 + component]! * wa
    + positions[b * 3 + component]! * wb
    + positions[c * 3 + component]! * wc
}

interface MaterialTriangle {
  a: number
  b: number
  c: number
  materialClass: string
}

interface TessellatedRoadMesh {
  positions: number[]
  triangles: MaterialTriangle[]
  uvs: number[]
}

/**
 * Splits every overlong horizontal edge, not just the road reference line.
 *
 * Decisions are made per shared edge and midpoint indices are cached globally
 * within the chunk. Adjacent faces therefore split the same edge together;
 * independently subdividing each triangle would leave T-junction cracks that
 * only become visible after the two sides sample different terrain heights.
 */
function tessellateForTerrain(
  source: IndexedRoadMesh,
  kind: 'surface' | 'markings'
): TessellatedRoadMesh {
  const positions = Array.from(source.positions)
  const vertexCount = positions.length / 3
  const uvs = source.uvs.length === vertexCount * 2
    ? Array.from(source.uvs)
    : new Array<number>(vertexCount * 2).fill(0)
  let triangles = extractMaterialTriangles(source, kind)
  const midpointByEdge = new Map<string, number>()
  const maximumSquared = TERRAIN_MAX_EDGE_LENGTH * TERRAIN_MAX_EDGE_LENGTH

  for (let pass = 0; pass < MAX_TESSELLATION_PASSES; pass += 1) {
    const next: MaterialTriangle[] = []
    let splitCount = 0

    for (const triangle of triangles) {
      const splitAB = edgeLengthSquared(positions, triangle.a, triangle.b) > maximumSquared
      const splitBC = edgeLengthSquared(positions, triangle.b, triangle.c) > maximumSquared
      const splitCA = edgeLengthSquared(positions, triangle.c, triangle.a) > maximumSquared
      if (!splitAB && !splitBC && !splitCA) {
        next.push(triangle)
        continue
      }

      splitCount += 1
      const midpointAB = splitAB
        ? midpointVertex(triangle.a, triangle.b, positions, uvs, midpointByEdge)
        : undefined
      const midpointBC = splitBC
        ? midpointVertex(triangle.b, triangle.c, positions, uvs, midpointByEdge)
        : undefined
      const midpointCA = splitCA
        ? midpointVertex(triangle.c, triangle.a, positions, uvs, midpointByEdge)
        : undefined
      appendSplitTriangles(next, triangle, midpointAB, midpointBC, midpointCA)
    }

    triangles = next
    if (splitCount === 0) return { positions, triangles, uvs }
  }

  throw new Error(`three-roads terrain tessellation exceeded ${MAX_TESSELLATION_PASSES} passes`)
}

function extractMaterialTriangles(
  source: IndexedRoadMesh,
  kind: 'surface' | 'markings'
): MaterialTriangle[] {
  const triangles: MaterialTriangle[] = []
  const covered = new Uint8Array(source.indices.length)

  for (const materialGroup of source.materialGroups) {
    for (const rangeIndex of materialGroup.rangeIndices) {
      const range = source.semanticRanges[rangeIndex]
      if (!range) continue
      for (let index = range.indexStart; index < range.indexStart + range.indexCount; index += 3) {
        triangles.push({
          a: source.indices[index]!,
          b: source.indices[index + 1]!,
          c: source.indices[index + 2]!,
          materialClass: materialGroup.materialClass
        })
        covered[index] = 1
        covered[index + 1] = 1
        covered[index + 2] = 1
      }
    }
  }

  // Future three-roads releases may add an ungrouped semantic. Keeping it
  // visible is safer than silently dropping geometry from an upgraded package.
  const fallbackClass = kind === 'markings' ? 'marking-white' : 'road'
  for (let index = 0; index < source.indices.length; index += 3) {
    if (covered[index]) continue
    triangles.push({
      a: source.indices[index]!,
      b: source.indices[index + 1]!,
      c: source.indices[index + 2]!,
      materialClass: fallbackClass
    })
  }

  return triangles
}

function edgeLengthSquared(positions: readonly number[], a: number, b: number): number {
  const dx = positions[a * 3]! - positions[b * 3]!
  const dz = positions[a * 3 + 1]! - positions[b * 3 + 1]!
  return dx * dx + dz * dz
}

function midpointVertex(
  a: number,
  b: number,
  positions: number[],
  uvs: number[],
  midpointByEdge: Map<string, number>
): number {
  const lower = Math.min(a, b)
  const upper = Math.max(a, b)
  const key = `${lower}:${upper}`
  const cached = midpointByEdge.get(key)
  if (cached !== undefined) return cached

  const midpoint = positions.length / 3
  for (let component = 0; component < 3; component += 1) {
    positions.push((positions[a * 3 + component]! + positions[b * 3 + component]!) / 2)
  }
  for (let component = 0; component < 2; component += 1) {
    uvs.push((uvs[a * 2 + component]! + uvs[b * 2 + component]!) / 2)
  }
  midpointByEdge.set(key, midpoint)
  return midpoint
}

function appendSplitTriangles(
  output: MaterialTriangle[],
  triangle: MaterialTriangle,
  ab: number | undefined,
  bc: number | undefined,
  ca: number | undefined
): void {
  const { a, b, c, materialClass } = triangle
  const push = (nextA: number, nextB: number, nextC: number) => {
    output.push({ a: nextA, b: nextB, c: nextC, materialClass })
  }

  if (ab !== undefined && bc !== undefined && ca !== undefined) {
    push(a, ab, ca)
    push(ab, b, bc)
    push(ca, bc, c)
    push(ab, bc, ca)
  } else if (ab !== undefined && bc !== undefined) {
    push(ab, b, bc)
    push(a, ab, bc)
    push(a, bc, c)
  } else if (ab !== undefined && ca !== undefined) {
    push(a, ab, ca)
    push(ab, b, c)
    push(ab, c, ca)
  } else if (bc !== undefined && ca !== undefined) {
    push(ca, bc, c)
    push(a, b, bc)
    push(a, bc, ca)
  } else if (ab !== undefined) {
    push(a, ab, c)
    push(ab, b, c)
  } else if (bc !== undefined) {
    push(a, b, bc)
    push(a, bc, c)
  } else if (ca !== undefined) {
    push(a, b, ca)
    push(ca, b, c)
  }
}

function appendMaterialTriangles(
  output: Map<string, number[]>,
  triangles: readonly MaterialTriangle[],
  vertexOffset: number
): void {
  for (const triangle of triangles) {
    const bucket = output.get(triangle.materialClass) ?? []
    // An axis swap changes handedness. Reversing B and C keeps the faces
    // front-facing in Three.js rather than relying on double-sided paint.
    bucket.push(
      triangle.a + vertexOffset,
      triangle.c + vertexOffset,
      triangle.b + vertexOffset
    )
    output.set(triangle.materialClass, bucket)
  }
}

function calculateNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]! * 3
    const b = indices[index + 1]! * 3
    const c = indices[index + 2]! * 3
    const abx = positions[b]! - positions[a]!
    const aby = positions[b + 1]! - positions[a + 1]!
    const abz = positions[b + 2]! - positions[a + 2]!
    const acx = positions[c]! - positions[a]!
    const acy = positions[c + 1]! - positions[a + 1]!
    const acz = positions[c + 2]! - positions[a + 2]!
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    for (const vertex of [a, b, c]) {
      normals[vertex] += nx
      normals[vertex + 1] += ny
      normals[vertex + 2] += nz
    }
  }

  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index]!, normals[index + 1]!, normals[index + 2]!)
    if (length <= 0.000_000_001) continue
    normals[index] /= length
    normals[index + 1] /= length
    normals[index + 2] /= length
  }
  return normals
}

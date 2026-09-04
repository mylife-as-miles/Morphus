import assert from 'node:assert/strict'
import test from 'node:test'

import { generateGridNetwork } from '../network/gridLayout'
import { emptyRoadNetwork, type RoadNetwork, type RoadSegment } from '../network/roadNetwork'
import {
  buildRoadSurfaceMeshes,
  createThreeRoadsDocument,
  type RoadRenderMeshData
} from './threeRoads'

function streetSegment(id: string, from: string, to: string): RoadSegment {
  return {
    from,
    id,
    lanes: 2,
    roadClass: 'street',
    sidewalkWidth: 3,
    to,
    width: 9
  }
}

test('grid block edges become continuous avenue and cross-street strokes', () => {
  const { network } = generateGridNetwork({
    blockDepth: 120,
    blockWidth: 60,
    columns: 3,
    rows: 2,
    rotation: Math.PI / 7
  })

  const authored = createThreeRoadsDocument({ network })

  assert.equal(Object.keys(network.segments).length, 17)
  assert.equal(authored.document.strokes.length, 7)
  assert.equal(authored.segmentLocations.size, 17)
  assert.ok(authored.document.strokes.every((stroke) => stroke.geometry.length === 1))
})

test('stroke merging starts at a real endpoint when the middle segment sorts first', () => {
  const network: RoadNetwork = {
    nodes: {
      n0: { id: 'n0', x: -60, z: 0 },
      n1: { id: 'n1', x: -20, z: 0 },
      n2: { id: 'n2', x: 20, z: 0 },
      n3: { id: 'n3', x: 60, z: 0 }
    },
    segments: {
      'a-middle': streetSegment('a-middle', 'n1', 'n2'),
      'z-left': streetSegment('z-left', 'n0', 'n1'),
      'z-right': streetSegment('z-right', 'n2', 'n3')
    }
  }

  const authored = createThreeRoadsDocument({ network })

  assert.equal(authored.document.strokes.length, 1)
  assert.equal(authored.segmentLocations.size, 3)
  assert.equal(authored.document.strokes[0]?.geometry[0]?.length, 120)
})

test('the compiled grid contains junction surfaces and visible road markings', () => {
  const { network } = generateGridNetwork({
    blockDepth: 100,
    blockWidth: 50,
    columns: 2,
    rows: 2
  })

  const result = buildRoadSurfaceMeshes({ network })

  assert.equal(result.compilation.ok, true)
  assert.equal(result.compilation.network?.junctions.length, 9)
  assert.ok(result.surface.vertexCount > 0)
  assert.ok(result.markings.vertexCount > 0)
  assert.deepEqual(
    new Set(result.surface.groups.map(({ materialClass }) => materialClass)),
    new Set(['road', 'shoulder', 'sidewalk'])
  )
  assert.deepEqual(
    new Set(result.markings.groups.map(({ materialClass }) => materialClass)),
    new Set(['marking-white'])
  )
})

test('the renderer adapter swaps Z-up to Y-up and keeps triangles front-facing', () => {
  const network: RoadNetwork = {
    nodes: {
      a: { id: 'a', x: -20, z: 7 },
      b: { id: 'b', x: 20, z: 7 }
    },
    segments: {
      main: {
        from: 'a',
        id: 'main',
        lanes: 2,
        roadClass: 'street',
        sidewalkWidth: 3,
        to: 'b',
        width: 9
      }
    }
  }

  const { surface } = buildRoadSurfaceMeshes({ network, surfaceBias: 0 })
  const xs = axis(surface.positions, 0)
  const ys = axis(surface.positions, 1)
  const zs = axis(surface.positions, 2)

  assert.ok(Math.min(...xs) <= -20)
  assert.ok(Math.max(...xs) >= 20)
  assert.ok(Math.max(...zs) - Math.min(...zs) > 14.9)
  assert.ok(Math.max(...ys) >= 0.15)

  for (let index = 0; index < surface.indices.length; index += 3) {
    const a = surface.indices[index]!
    const b = surface.indices[index + 1]!
    const c = surface.indices[index + 2]!
    const face = triangleNormal(surface.positions, a, b, c)
    const normal = averageNormal(surface.normals, a, b, c)
    assert.ok(dot(face, normal) > 0, `triangle ${index / 3} faces away from its normals`)
  }
})

test('terrain conformance adds the sampled height at every surface and marking vertex', () => {
  const { network } = generateGridNetwork({
    blockDepth: 80,
    blockWidth: 40,
    columns: 1,
    rows: 1,
    rotation: 0.17
  })
  const flat = buildRoadSurfaceMeshes({ network, surfaceBias: 0 })
  const groundHeight = (x: number, z: number) => 18 + x * 0.027 - z * 0.019
  const conformed = buildRoadSurfaceMeshes({ groundHeight, network, surfaceBias: 0 })

  assertTerrainDelta(flat.surface.positions, conformed.surface.positions, groundHeight)
  assertTerrainDelta(flat.markings.positions, conformed.markings.positions, groundHeight)
})

test('terrain conformance tessellates straight road faces before sampling curved ground', () => {
  const network: RoadNetwork = {
    nodes: {
      a: { id: 'a', x: -50, z: 0 },
      b: { id: 'b', x: 50, z: 0 }
    },
    segments: {
      main: {
        from: 'a',
        id: 'main',
        lanes: 2,
        roadClass: 'street',
        sidewalkWidth: 3,
        to: 'b',
        width: 9
      }
    }
  }
  const groundHeight = (x: number, z: number) => 12 + x * x * 0.004 + Math.cos(z / 4) * 0.2
  const flat = buildRoadSurfaceMeshes({ network, surfaceBias: 0 })
  const conformed = buildRoadSurfaceMeshes({ groundHeight, network, surfaceBias: 0 })
  let worstInteriorError = 0

  assert.deepEqual(conformed.surface.indices, flat.surface.indices)
  assertMaximumHorizontalEdge(conformed.surface, 4.000_1)
  assertMaximumHorizontalEdge(conformed.markings, 4.000_1)
  for (let index = 0; index < conformed.surface.indices.length; index += 3) {
    const triangle = [
      conformed.surface.indices[index]!,
      conformed.surface.indices[index + 1]!,
      conformed.surface.indices[index + 2]!
    ]
    const x = triangle.reduce((sum, vertex) => sum + conformed.surface.positions[vertex * 3]!, 0) / 3
    const z = triangle.reduce((sum, vertex) => sum + conformed.surface.positions[vertex * 3 + 2]!, 0) / 3
    const terrainContribution = triangle.reduce(
      (sum, vertex) => sum
        + conformed.surface.positions[vertex * 3 + 1]!
        - flat.surface.positions[vertex * 3 + 1]!,
      0
    ) / 3
    worstInteriorError = Math.max(worstInteriorError, Math.abs(terrainContribution - groundHeight(x, z)))
  }

  assert.ok(worstInteriorError < 0.025, `road triangle missed curved ground by ${worstInteriorError}m`)
})

test('road paint stays on the rendered deck over nonlinear terrain', () => {
  const network: RoadNetwork = {
    nodes: {
      a: { id: 'a', x: -50, z: 0 },
      b: { id: 'b', x: 50, z: 0 }
    },
    segments: {
      main: {
        from: 'a',
        id: 'main',
        lanes: 2,
        roadClass: 'street',
        sidewalkWidth: 3,
        to: 'b',
        width: 9
      }
    }
  }
  const result = buildRoadSurfaceMeshes({
    crosswalks: [{ id: 'zebra', position: 0.5, segmentId: 'main', width: 4 }],
    groundHeight: (x, z) => 20 + Math.sin(x * 0.17) * 2.5 + Math.cos(z * 0.31),
    network,
    surfaceBias: 0
  })

  assert.ok(result.markings.vertexCount > 0)
  for (let vertex = 0; vertex < result.markings.vertexCount; vertex += 1) {
    const x = result.markings.positions[vertex * 3]!
    const y = result.markings.positions[vertex * 3 + 1]!
    const z = result.markings.positions[vertex * 3 + 2]!
    const clearance = closestSurfaceClearance(result.surface, x, y, z)
    assert.ok(clearance !== undefined, `marking vertex ${vertex} has no deck below it`)
    assert.ok(
      Math.abs(clearance - 0.003) < 0.000_02,
      `marking vertex ${vertex} is ${clearance}m above its deck`
    )
  }
})

test('junction-owned paint resolves against neighbouring road chunks', () => {
  const { network } = generateGridNetwork({
    blockDepth: 90,
    blockWidth: 50,
    columns: 1,
    rows: 1
  })
  const result = buildRoadSurfaceMeshes({
    crosswalks: [{ id: 'junction-zebra', position: 1, segmentId: 's_v_0_0', width: 4 }],
    groundHeight: (x, z) => 17 + Math.sin(x * 0.19) * 2 + Math.cos(z * 0.23) * 1.5,
    network,
    surfaceBias: 0
  })
  const referenced = new Set(result.markings.indices)

  for (const vertex of referenced) {
    const x = result.markings.positions[vertex * 3]!
    const y = result.markings.positions[vertex * 3 + 1]!
    const z = result.markings.positions[vertex * 3 + 2]!
    const clearance = closestSurfaceClearance(result.surface, x, y, z)
    assert.ok(clearance !== undefined, `marking vertex ${vertex} has no junction deck below it`)
    assert.ok(
      Math.abs(clearance - 0.003) < 0.000_02,
      `marking vertex ${vertex} is ${clearance}m above its junction deck`
    )
  }
})

test('a 5 by 3 district stays within bounded terrain-ready buffers', () => {
  const { network } = generateGridNetwork({
    blockDepth: 120,
    blockWidth: 60,
    columns: 5,
    rows: 3
  })
  const result = buildRoadSurfaceMeshes({
    crosswalks: [{ id: 'zebra', position: 0.5, segmentId: 's_v_0_0', width: 4 }],
    groundHeight: (x, z) => 25 + Math.sin(x / 37) * 9 + Math.cos(z / 53) * 6,
    network
  })
  const surfaceTriangles = result.surface.indices.length / 3
  const markingTriangles = result.markings.indices.length / 3

  assertMaximumHorizontalEdge(result.surface, 4.000_1)
  assertMaximumHorizontalEdge(result.markings, 4.000_1)
  assert.ok(surfaceTriangles < 150_000, `surface expanded to ${surfaceTriangles} triangles`)
  assert.ok(markingTriangles < 100_000, `markings expanded to ${markingTriangles} triangles`)
})

test('crosswalks bind to an original graph segment after it joins a continuous stroke', () => {
  const { network } = generateGridNetwork({
    blockDepth: 100,
    blockWidth: 50,
    columns: 1,
    rows: 2
  })
  const authored = createThreeRoadsDocument({
    crosswalks: [{ id: 'school-crossing', position: 0.5, segmentId: 's_v_0_1', width: 4 }],
    network
  })

  const crosswalk = authored.document.markings?.find(({ id }) => id === 'school-crossing')
  const location = authored.segmentLocations.get('s_v_0_1')

  assert.ok(crosswalk && crosswalk.kind === 'zebra')
  assert.ok(location)
  if (!crosswalk || crosswalk.kind !== 'zebra' || !location) return
  assert.equal(crosswalk.roadId, location.strokeId)
  assert.ok(crosswalk.sStart >= location.sStart)
  assert.ok(crosswalk.sEnd <= location.sEnd)
})

test('an empty network produces empty render buffers without compiling', () => {
  const result = buildRoadSurfaceMeshes({ network: emptyRoadNetwork() })

  assert.equal(result.compilation.ok, true)
  assert.equal(result.surface.vertexCount, 0)
  assert.equal(result.markings.vertexCount, 0)
})

function axis(values: Float32Array, offset: number): number[] {
  const result: number[] = []
  for (let index = offset; index < values.length; index += 3) result.push(values[index]!)
  return result
}

function triangleNormal(
  positions: Float32Array,
  a: number,
  b: number,
  c: number
): [number, number, number] {
  const ax = positions[a * 3]!
  const ay = positions[a * 3 + 1]!
  const az = positions[a * 3 + 2]!
  const ab = [positions[b * 3]! - ax, positions[b * 3 + 1]! - ay, positions[b * 3 + 2]! - az]
  const ac = [positions[c * 3]! - ax, positions[c * 3 + 1]! - ay, positions[c * 3 + 2]! - az]
  return [
    ab[1]! * ac[2]! - ab[2]! * ac[1]!,
    ab[2]! * ac[0]! - ab[0]! * ac[2]!,
    ab[0]! * ac[1]! - ab[1]! * ac[0]!
  ]
}

function averageNormal(
  normals: Float32Array,
  a: number,
  b: number,
  c: number
): [number, number, number] {
  return [
    normals[a * 3]! + normals[b * 3]! + normals[c * 3]!,
    normals[a * 3 + 1]! + normals[b * 3 + 1]! + normals[c * 3 + 1]!,
    normals[a * 3 + 2]! + normals[b * 3 + 2]! + normals[c * 3 + 2]!
  ]
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
}

function horizontalDistance(positions: Float32Array, a: number, b: number): number {
  return Math.hypot(
    positions[a * 3]! - positions[b * 3]!,
    positions[a * 3 + 2]! - positions[b * 3 + 2]!
  )
}

function assertMaximumHorizontalEdge(mesh: RoadRenderMeshData, maximum: number): void {
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index]!
    const b = mesh.indices[index + 1]!
    const c = mesh.indices[index + 2]!
    const longest = Math.max(
      horizontalDistance(mesh.positions, a, b),
      horizontalDistance(mesh.positions, b, c),
      horizontalDistance(mesh.positions, c, a)
    )
    assert.ok(longest <= maximum, `triangle ${index / 3} still spans ${longest}m`)
  }
}

function closestSurfaceClearance(
  surface: RoadRenderMeshData,
  x: number,
  y: number,
  z: number
): number | undefined {
  let best: number | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (let index = 0; index < surface.indices.length; index += 3) {
    const a = surface.indices[index]!
    const b = surface.indices[index + 1]!
    const c = surface.indices[index + 2]!
    const weights = barycentricAt(surface.positions, x, z, a, b, c)
    if (!weights) continue
    const deck = surface.positions[a * 3 + 1]! * weights[0]
      + surface.positions[b * 3 + 1]! * weights[1]
      + surface.positions[c * 3 + 1]! * weights[2]
    const clearance = y - deck
    const score = Math.abs(clearance - 0.003)
    if (score < bestScore) {
      best = clearance
      bestScore = score
    }
  }
  return best
}

function barycentricAt(
  positions: Float32Array,
  x: number,
  z: number,
  a: number,
  b: number,
  c: number
): readonly [number, number, number] | undefined {
  const ax = positions[a * 3]!
  const az = positions[a * 3 + 2]!
  const bx = positions[b * 3]!
  const bz = positions[b * 3 + 2]!
  const cx = positions[c * 3]!
  const cz = positions[c * 3 + 2]!
  const epsilon = 0.000_02
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

function assertTerrainDelta(
  flat: Float32Array,
  conformed: Float32Array,
  groundHeight: (x: number, z: number) => number
): void {
  assert.equal(conformed.length, flat.length)
  for (let index = 0; index < flat.length; index += 3) {
    assert.equal(conformed[index], flat[index])
    assert.equal(conformed[index + 2], flat[index + 2])
    const expected = groundHeight(flat[index]!, flat[index + 2]!)
    const actual = conformed[index + 1]! - flat[index + 1]!
    assert.ok(Math.abs(actual - expected) < 0.000_01, `vertex ${index / 3} missed terrain by ${actual - expected}m`)
  }
}

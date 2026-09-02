/**
 * Single-shot evaluation of a mesh terrain document into renderable buffers.
 *
 * A `MeshTerrainState` stores no surface -- only a seed, a profile and an
 * ordered modifier stack. This module is what turns that back into geometry:
 * it replays the stack in `sequence` order over the base field and then hands
 * the result to exact CSG.
 *
 * ─── Scope ───────────────────────────────────────────────────────────────────
 *
 * Upstream compiles *sections*: 128 m tiles, five LODs each, produced by a pool
 * of workers, kept resident around the camera, welded along their shared edges
 * and swapped in as the view moves. None of that is here, and none of it should
 * be: the editor needs one bounded patch of ground it can put in front of the
 * user synchronously, not a streaming world. What is here is the part of
 * `compileSection` that decides *what the ground is* -- the same field stack,
 * the same brush kernel, the same Boolean backend -- evaluated once over one
 * region.
 *
 * Consequently there is no LOD selection, no simplification (upstream runs
 * meshoptimizer over each level), no section welding, no stable vertex ids, no
 * surface-field or curvature/occlusion analysis, and no async. `resolution` is
 * the single quality dial.
 *
 * ─── Determinism ─────────────────────────────────────────────────────────────
 *
 * Same state plus same options gives the same buffers, byte for byte. Nothing
 * reads the clock, `Math.random`, or module-level mutable state, and the
 * modifier order is derived from `priority`/`sequence`/`id` rather than from
 * array position, so a document whose modifiers were reordered in storage still
 * evaluates the way it was authored.
 */

import type { MeshTerrainState, TerrainMaterialSettings } from '@blud/shared'

import { sampleBaseField } from './baseField'
import { clamp, intersects, smoothstep } from './core/bounds'
import type { AABB } from './core/types'
import { dropDegenerateTriangles } from './mesh/MeshValidation'
import { cloneModifier, ModifierStack } from './modifiers/ModifierStack'
import {
  BvhCsgTunnelBooleanBackend,
  tunnelCutterVolumes,
  type BooleanMeshBuffers,
  type MeshBooleanBackend,
  type MeshBooleanOperation,
} from './modifiers/boolean/MeshBooleanBackend'
import { materializeModifierTransforms } from './modifiers/transform'
import type {
  RemeshModifier,
  TerrainModifier,
  TessellateModifier,
  WeightPaintModifier,
} from './modifiers/types'
import {
  DEFAULT_TERRAIN_MATERIAL_SETTINGS,
  cloneTerrainMaterialSettings,
  paintChannelIndex,
} from './materialSettings'
import { evaluateTerrainPoint } from './terrainField'

/**
 * The square of world space an evaluation covers.
 *
 * `originX`/`originZ` are the minimum corner in world metres and must be
 * integer multiples of `size`. That is not a stylistic constraint: the Boolean
 * backend decides which side of a shared edge owns a triangle by comparing
 * `floor(world / size)` against `round(origin / size)`, so a region that
 * straddles its own grid silently loses the cut half of its geometry.
 * `resolveRegion` snaps whatever it is given, and records it in `warnings`.
 */
export interface MeshTerrainRegion {
  originX: number
  originZ: number
  size: number
}

export interface MeshTerrainEvaluateOptions {
  /** Defaults to the aligned tile covering the authored modifiers. */
  region?: Partial<MeshTerrainRegion>
  /** Grid vertices per axis before CSG. Clamped to [2, 513]. Default 129. */
  resolution?: number
  /** Set false to skip CSG entirely -- useful while dragging a cutter. */
  applyBooleans?: boolean
  /** Cutter tessellation multiplier handed to the backend. Default 1. */
  booleanDetail?: number
  /** Override for tests, or to share one evaluator across many calls. */
  booleanBackend?: MeshBooleanBackend
}

export interface EvaluatedMeshTerrain {
  /**
   * Region-local positions: x and z run 0..`region.size`, y is world altitude
   * in metres. Add `region.originX`/`originZ` for world coordinates. This
   * matches the section-local convention the ported Boolean backend expects,
   * and keeps float precision usable far from the world origin.
   */
  positions: Float32Array
  normals: Float32Array
  /** 0..1 across the region, so one texture tiles predictably over it. */
  uvs: Float32Array
  indices: Uint32Array
  /** Linear RGB, already blended from the four paint channels. */
  colors: Float32Array
  /** Four weights per vertex, normalized so they sum to 1. */
  paintWeights: Float32Array
  /** 1 where a vertex was exposed by a subtraction rather than by the surface. */
  interiorVertices: Uint8Array
  region: MeshTerrainRegion
  /** World-space bounds of the evaluated geometry. */
  bounds: AABB
  vertexCount: number
  triangleCount: number
  /** Channel roughness averaged by weight; a single-material approximation. */
  averageRoughness: number
  /** Material settings in force, after any `material-settings` modifier. */
  materialSettings: TerrainMaterialSettings
  /** Non-fatal notes: snapped regions, dropped triangles, skipped CSG. */
  warnings: string[]
}

const MIN_RESOLUTION = 2
const MAX_RESOLUTION = 513
const DEFAULT_RESOLUTION = 129
/** Side of the region a terrain with no modifiers yet is previewed over. */
const DEFAULT_REGION_SIZE = 512

/**
 * Shared across calls because it owns nothing but five `MeshBasicMaterial`
 * instances used as CSG group tags. Constructing one per evaluation would leak
 * GPU-backed materials on every re-render.
 */
let sharedBooleanBackend: MeshBooleanBackend | undefined

function defaultBooleanBackend(): MeshBooleanBackend {
  sharedBooleanBackend ??= new BvhCsgTunnelBooleanBackend()
  return sharedBooleanBackend
}

/**
 * Replays a mesh terrain document into geometry.
 *
 * Throws only if the state is structurally impossible (a non-finite world
 * size). Everything recoverable -- a degenerate triangle, a Boolean that
 * produced nothing usable -- is reported through `warnings` and leaves the
 * surface intact, because losing the ground the user is standing on is a far
 * worse outcome than a blemish they can see and fix.
 */
export function evaluateMeshTerrain(
  state: MeshTerrainState,
  options: MeshTerrainEvaluateOptions = {},
): EvaluatedMeshTerrain {
  const warnings: string[] = []
  const seed = Number.isFinite(state.seed) ? state.seed : 0
  const profile = state.profile === 'flat' ? 'flat' : 'natural'
  const ordered = orderedModifiers(state.modifiers ?? [])
  const region = resolveRegion(state, ordered, options.region, warnings)
  const resolution = Math.round(
    clamp(options.resolution ?? DEFAULT_RESOLUTION, MIN_RESOLUTION, MAX_RESOLUTION),
  )

  // The stack is queried, not iterated: the ported spatial index is what
  // decides which strokes can reach this region, and it returns them already in
  // evaluation order. The halo matches the largest displacement a stroke just
  // outside the region could still push across the edge.
  const stack = new ModifierStack(Math.max(1, Math.round(state.sectionSize || 128)))
  stack.replace(ordered)
  const active = stack.query(regionQueryBounds(region))
  const materialSettings = resolveMaterialSettings(state, ordered)

  const densityModifiers = active.filter(
    (modifier): modifier is RemeshModifier | TessellateModifier =>
      (modifier.type === 'remesh' || modifier.type === 'tessellate') &&
      densityModifierOverlapsRegion(modifier, region),
  )
  const xAxis = createAdaptiveAxis(region.originX, region.size, resolution, densityModifiers, 'x')
  const zAxis = createAdaptiveAxis(region.originZ, region.size, resolution, densityModifiers, 'z')

  const base = buildBaseSurface(xAxis, zAxis, region, seed, profile, active)
  const operations = options.applyBooleans === false ? [] : collectBooleanOperations(active)
  const backend = options.booleanBackend ?? defaultBooleanBackend()
  let surface: BooleanMeshBuffers = base
  if (operations.length > 0) {
    try {
      surface = backend.evaluate(
        base,
        operations,
        region.originX,
        region.originZ,
        region.size,
        Math.max(0.25, options.booleanDetail ?? 1),
        seed,
      )
      if (surface === base) {
        warnings.push('CSG produced no usable result; showing the uncut surface.')
      }
    } catch (error) {
      warnings.push(
        `CSG failed (${error instanceof Error ? error.message : String(error)}); showing the uncut surface.`,
      )
      surface = base
    }
  }

  // Sculpting can pull two grid vertices onto each other and leave a triangle
  // with no area. Dropping it costs nothing -- it drew nothing.
  const repaired = dropDegenerateTriangles(surface.positions, surface.indices)
  if (repaired.dropped > 0) {
    warnings.push(`Dropped ${repaired.dropped} degenerate triangle(s).`)
  }
  const indices = repaired.indices
  const positions = surface.positions
  const normals = surface.normals
  const vertexCount = positions.length / 3
  const interiorVertices =
    surface.interiorVertices.length === vertexCount
      ? surface.interiorVertices
      : new Uint8Array(vertexCount)

  const paintWeights = calculatePaintWeights(
    positions,
    normals,
    interiorVertices,
    region,
    active,
  )
  const { colors, averageRoughness } = shadeVertices(
    paintWeights,
    interiorVertices,
    materialSettings,
  )

  return {
    positions,
    normals,
    uvs: buildUvs(positions, region),
    indices,
    colors,
    paintWeights,
    interiorVertices,
    region,
    bounds: worldBounds(positions, region),
    vertexCount,
    triangleCount: indices.length / 3,
    averageRoughness,
    materialSettings,
    warnings,
  }
}

// --- modifier ordering -------------------------------------------------------

/**
 * The authored evaluation order, with every transform baked into world space.
 *
 * `sequence` is the record of when a stroke was drawn, and a stroke means what
 * it meant against the surface it was drawn on -- so it, not array position,
 * decides order. Ties fall back to `id` purely so the sort is total.
 */
function orderedModifiers(modifiers: readonly TerrainModifier[]): TerrainModifier[] {
  const cloned = modifiers.map(cloneModifier)
  cloned.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const sequenceA = a.sequence ?? Number.MAX_SAFE_INTEGER
    const sequenceB = b.sequence ?? Number.MAX_SAFE_INTEGER
    if (sequenceA !== sequenceB) return sequenceA - sequenceB
    return a.id.localeCompare(b.id)
  })
  return materializeModifierTransforms(cloned)
}

/**
 * The material settings in force.
 *
 * A `material-settings` modifier is a stack member rather than a document field
 * so that changing the palette is undoable alongside the strokes it recolours;
 * the last enabled one wins.
 */
function resolveMaterialSettings(
  state: MeshTerrainState,
  ordered: readonly TerrainModifier[],
): TerrainMaterialSettings {
  let settings: TerrainMaterialSettings =
    state.materialSettings ?? DEFAULT_TERRAIN_MATERIAL_SETTINGS
  for (const modifier of ordered) {
    if (modifier.enabled && modifier.type === 'material-settings') {
      settings = modifier.settings
    }
  }
  return cloneTerrainMaterialSettings(settings)
}

// --- region ------------------------------------------------------------------

function resolveRegion(
  state: MeshTerrainState,
  ordered: readonly TerrainModifier[],
  requested: Partial<MeshTerrainRegion> | undefined,
  warnings: string[],
): MeshTerrainRegion {
  const worldSize =
    Number.isFinite(state.worldSize) && state.worldSize > 0 ? state.worldSize : DEFAULT_REGION_SIZE
  if (!Number.isFinite(worldSize)) {
    throw new Error('Mesh terrain world size must be finite')
  }

  // An explicitly requested origin always wins, even when the stack reaches
  // outside it. A caller asking for a specific patch of ground -- a preview
  // thumbnail, a test -- means it, and silently re-centring on their behalf
  // would make the request untestable.
  const explicitOrigin = requested?.originX !== undefined || requested?.originZ !== undefined
  if (requested?.size !== undefined || explicitOrigin) {
    const size = clamp(requested?.size ?? Math.min(worldSize, DEFAULT_REGION_SIZE), 1, worldSize)
    return alignRegion(requested?.originX ?? 0, requested?.originZ ?? 0, size, warnings)
  }

  // With nothing authored yet the only sensible view is a tile of default size
  // at the world origin. Once strokes exist the region has to reach them, or
  // the user's own work is the part that is not on screen.
  const authored = authoredBounds(ordered)
  let size = Math.min(worldSize, DEFAULT_REGION_SIZE)
  if (!authored) return alignRegion(0, 0, size, warnings)

  // Grow by powers of two until one aligned tile contains everything authored.
  // Doubling keeps the tile grid nested, so growing never moves ground that was
  // already on screen sideways.
  let fits = false
  while (!fits && size < worldSize) {
    const originX = Math.floor(authored.min.x / size) * size
    const originZ = Math.floor(authored.min.z / size) * size
    fits = authored.max.x <= originX + size && authored.max.z <= originZ + size
    if (!fits) size = Math.min(worldSize, size * 2)
  }
  const region = alignRegion(
    Math.floor(authored.min.x / size) * size,
    Math.floor(authored.min.z / size) * size,
    size,
    warnings,
  )
  if (
    authored.max.x > region.originX + region.size ||
    authored.max.z > region.originZ + region.size
  ) {
    warnings.push(
      'Authored modifiers reach outside the evaluated region; part of the stack is not drawn.',
    )
  }
  return region
}

function alignRegion(
  originX: number,
  originZ: number,
  size: number,
  warnings: string[],
): MeshTerrainRegion {
  const alignedX = Math.floor(originX / size) * size
  const alignedZ = Math.floor(originZ / size) * size
  if (alignedX !== originX || alignedZ !== originZ) {
    warnings.push(
      `Region origin snapped from (${originX}, ${originZ}) to (${alignedX}, ${alignedZ}) so CSG ownership stays consistent.`,
    )
  }
  return { originX: alignedX, originZ: alignedZ, size }
}

function authoredBounds(modifiers: readonly TerrainModifier[]): AABB | undefined {
  let bounds: AABB | undefined
  for (const modifier of modifiers) {
    if (!modifier.enabled) continue
    if (modifier.type === 'sculpt-layer' || modifier.type === 'material-settings') continue
    const next = modifier.bounds
    if (!Number.isFinite(next.min.x) || !Number.isFinite(next.max.x)) continue
    bounds = bounds
      ? {
          min: {
            x: Math.min(bounds.min.x, next.min.x),
            y: Math.min(bounds.min.y, next.min.y),
            z: Math.min(bounds.min.z, next.min.z),
          },
          max: {
            x: Math.max(bounds.max.x, next.max.x),
            y: Math.max(bounds.max.y, next.max.y),
            z: Math.max(bounds.max.z, next.max.z),
          },
        }
      : { min: { ...next.min }, max: { ...next.max } }
  }
  return bounds
}

/**
 * Query bounds with a halo.
 *
 * A stroke centred just outside the region still displaces vertices inside it,
 * so the query has to reach past the edge. Y is left unbounded because altitude
 * is what the stack is about to decide.
 */
function regionQueryBounds(region: MeshTerrainRegion): AABB {
  const halo = Math.max(64, region.size * 0.25)
  return {
    min: { x: region.originX - halo, y: -Infinity, z: region.originZ - halo },
    max: {
      x: region.originX + region.size + halo,
      y: Infinity,
      z: region.originZ + region.size + halo,
    },
  }
}

// --- base surface ------------------------------------------------------------

function buildBaseSurface(
  xAxis: readonly number[],
  zAxis: readonly number[],
  region: MeshTerrainRegion,
  seed: number,
  profile: 'natural' | 'flat',
  modifiers: readonly TerrainModifier[],
): BooleanMeshBuffers {
  const width = xAxis.length
  const depth = zAxis.length
  const positions = new Float32Array(width * depth * 3)
  let cursor = 0
  for (const worldZ of zAxis) {
    for (const worldX of xAxis) {
      const point = evaluateTerrainPoint(worldX, worldZ, seed, profile, modifiers)
      positions[cursor] = point.x - region.originX
      positions[cursor + 1] = point.y
      positions[cursor + 2] = point.z - region.originZ
      cursor += 3
    }
  }

  // Alternating the quad diagonal stops a sculpted slope reading as a corduroy
  // of parallel creases, which one fixed diagonal produces on any regular grid.
  const indices = new Uint32Array((width - 1) * (depth - 1) * 6)
  let indexCursor = 0
  for (let z = 0; z < depth - 1; z += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = z * width + x
      const b = a + 1
      const c = a + width
      const d = c + 1
      if ((x + z) % 2 === 0) {
        indices[indexCursor] = a
        indices[indexCursor + 1] = c
        indices[indexCursor + 2] = b
        indices[indexCursor + 3] = b
        indices[indexCursor + 4] = c
        indices[indexCursor + 5] = d
      } else {
        indices[indexCursor] = a
        indices[indexCursor + 1] = c
        indices[indexCursor + 2] = d
        indices[indexCursor + 3] = a
        indices[indexCursor + 4] = d
        indices[indexCursor + 5] = b
      }
      indexCursor += 6
    }
  }

  return {
    positions,
    normals: calculateNormals(positions, indices),
    indices,
    interiorVertices: new Uint8Array(width * depth),
  }
}

/**
 * Grid lines along one axis, densified inside remesh/tessellate spheres.
 *
 * Ported from upstream's `createAdaptiveAxis`. Refining the axis rather than
 * the cells keeps the grid a clean tensor product, so the quad triangulation
 * above stays valid with no T-junctions to weld.
 */
function createAdaptiveAxis(
  origin: number,
  size: number,
  resolution: number,
  modifiers: readonly (RemeshModifier | TessellateModifier)[],
  axis: 'x' | 'z',
): number[] {
  const coordinates = new Set<number>()
  const divisions = Math.max(1, resolution - 1)
  for (let index = 0; index <= divisions; index += 1) {
    coordinates.add(roundCoordinate(origin + (index / divisions) * size))
  }
  for (const modifier of modifiers) {
    const center = modifier.center[axis]
    const minimum = Math.max(origin, center - modifier.radius)
    const maximum = Math.min(origin + size, center + modifier.radius)
    if (maximum <= minimum) continue
    const spacing = clamp(modifier.targetEdgeLength, size / 256, size / 6)
    const lineCount = Math.max(1, Math.min(48, Math.ceil((maximum - minimum) / spacing)))
    for (let line = 0; line <= lineCount; line += 1) {
      coordinates.add(roundCoordinate(minimum + ((maximum - minimum) * line) / lineCount))
    }
  }
  return [...coordinates].sort((a, b) => a - b)
}

function densityModifierOverlapsRegion(
  modifier: RemeshModifier | TessellateModifier,
  region: MeshTerrainRegion,
): boolean {
  const nearestX = clamp(modifier.center.x, region.originX, region.originX + region.size)
  const nearestZ = clamp(modifier.center.z, region.originZ, region.originZ + region.size)
  return (
    Math.hypot(modifier.center.x - nearestX, modifier.center.z - nearestZ) < modifier.radius
  )
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

// --- CSG ---------------------------------------------------------------------

/**
 * Arbitrary topology is authored through bounded modifiers only.
 *
 * Keeping cutters in the stack is what makes the height-derived base cheap and
 * preserves non-destructive build order. Nothing here may inject a Boolean the
 * document did not ask for.
 */
function collectBooleanOperations(
  modifiers: readonly TerrainModifier[],
): MeshBooleanOperation[] {
  const operations: MeshBooleanOperation[] = []
  for (const modifier of modifiers) {
    if (!modifier.enabled) continue
    if (modifier.type === 'boolean-subtract') {
      operations.push({ operation: 'subtract', cutters: tunnelCutterVolumes(modifier) })
    } else if (modifier.type === 'boolean-volume') {
      operations.push({
        operation: modifier.operation ?? 'subtract',
        cutters: modifier.volumes,
      })
    }
  }
  return operations
}

// --- vertex attributes -------------------------------------------------------

function calculateNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3
    const b = indices[index + 1] * 3
    const c = indices[index + 2] * 3
    const abx = positions[b] - positions[a]
    const aby = positions[b + 1] - positions[a + 1]
    const abz = positions[b + 2] - positions[a + 2]
    const acx = positions[c] - positions[a]
    const acy = positions[c + 1] - positions[a + 1]
    const acz = positions[c + 2] - positions[a + 2]
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    normals[a] += nx
    normals[a + 1] += ny
    normals[a + 2] += nz
    normals[b] += nx
    normals[b + 1] += ny
    normals[b + 2] += nz
    normals[c] += nx
    normals[c + 1] += ny
    normals[c + 2] += nz
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1
    normals[index] /= length
    normals[index + 1] /= length
    normals[index + 2] /= length
  }
  return normals
}

function buildUvs(positions: Float32Array, region: MeshTerrainRegion): Float32Array {
  const vertexCount = positions.length / 3
  const uvs = new Float32Array(vertexCount * 2)
  const inverseSize = 1 / Math.max(1e-6, region.size)
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    uvs[vertex * 2] = positions[vertex * 3] * inverseSize
    uvs[vertex * 2 + 1] = positions[vertex * 3 + 2] * inverseSize
  }
  return uvs
}

/**
 * Four normalized channel weights per vertex.
 *
 * Painted strokes are authoritative where they exist. Where they do not, the
 * channels are still worth filling in: an unpainted terrain would otherwise
 * render as one flat colour, and the slope-and-altitude classification below is
 * the same reading a user would paint by hand first anyway -- rock on the steep
 * ground, snow on the tops, grass on the flats. Painting simply displaces it.
 */
function calculatePaintWeights(
  positions: Float32Array,
  normals: Float32Array,
  interiorVertices: Uint8Array,
  region: MeshTerrainRegion,
  modifiers: readonly TerrainModifier[],
): Float32Array {
  const vertexCount = positions.length / 3
  const weights = new Float32Array(vertexCount * 4)
  const painted = new Float32Array(vertexCount)

  const strokes = modifiers.filter(
    (modifier): modifier is WeightPaintModifier =>
      modifier.enabled && modifier.type === 'weight-paint',
  )
  for (const stroke of strokes) {
    const channel = paintChannelIndex(stroke.channel)
    const direction = stroke.mode === 'subtract' ? -1 : 1
    const exponent = 1 + clamp(stroke.falloff, 0, 1) * 4
    const radius = Math.max(0.001, stroke.radius)
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const worldX = region.originX + positions[offset]
      const worldY = positions[offset + 1]
      const worldZ = region.originZ + positions[offset + 2]
      let influence = 0
      for (const sample of stroke.points) {
        const distance = Math.hypot(worldX - sample.x, worldY - sample.y, worldZ - sample.z)
        if (distance >= radius) continue
        influence += Math.pow(smoothstep(0, 1, 1 - distance / radius), exponent) * sample.weight
      }
      if (influence <= 0) continue
      const target = vertex * 4 + channel
      weights[target] = clamp(weights[target] + direction * influence * stroke.strength, 0, 1)
      painted[vertex] = Math.max(painted[vertex], Math.min(1, influence * stroke.strength))
    }
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 4
    const automatic = classifyVertex(positions, normals, interiorVertices, vertex)
    const paintedShare = clamp(painted[vertex], 0, 1)
    let total = 0
    for (let channel = 0; channel < 4; channel += 1) {
      const value =
        weights[offset + channel] * paintedShare + automatic[channel] * (1 - paintedShare)
      weights[offset + channel] = value
      total += value
    }
    if (total <= 1e-6) {
      weights[offset] = 1
      continue
    }
    for (let channel = 0; channel < 4; channel += 1) weights[offset + channel] /= total
  }
  return weights
}

const automaticWeights = new Float32Array(4)

/**
 * Slope/altitude classification into the four channels.
 *
 * Channel order follows the default palette -- grass, rock, soil, snow -- which
 * is what `createDefaultMeshTerrainState` writes and what a renamed palette is
 * still indexed by.
 */
function classifyVertex(
  positions: Float32Array,
  normals: Float32Array,
  interiorVertices: Uint8Array,
  vertex: number,
): Float32Array {
  const offset = vertex * 3
  automaticWeights.fill(0)
  if (interiorVertices[vertex] > 0) {
    // A face the user cut into the terrain is bare rock, not the meadow that
    // happened to be growing above it.
    automaticWeights[1] = 1
    return automaticWeights
  }
  const slope = 1 - Math.abs(normals[offset + 1])
  const altitude = smoothstep(120, 420, positions[offset + 1])
  const rock = smoothstep(0.2, 0.72, slope)
  const snow = altitude * (1 - rock * 0.55)
  const soil = (1 - rock) * smoothstep(0.08, 0.28, slope) * 0.6
  const grass = Math.max(0, 1 - rock - snow - soil)
  automaticWeights[0] = grass
  automaticWeights[1] = rock
  automaticWeights[2] = soil
  automaticWeights[3] = snow
  return automaticWeights
}

/**
 * Bakes the palette into vertex colours.
 *
 * Per-vertex colour rather than a splat shader is a deliberate limitation: the
 * editor runs both a WebGL and a WebGPU renderer, and a hand-written
 * `ShaderMaterial` compiles on only one of them. A weighted colour costs one
 * standard attribute, works identically on both, and the four weights are
 * returned alongside so a node-material splat can replace this later without
 * re-evaluating anything.
 */
function shadeVertices(
  paintWeights: Float32Array,
  interiorVertices: Uint8Array,
  settings: TerrainMaterialSettings,
): { colors: Float32Array; averageRoughness: number } {
  const vertexCount = paintWeights.length / 4
  const colors = new Float32Array(vertexCount * 3)
  const channelColors = settings.channels.map((channel) => ({
    r: srgbToLinear(((channel.color >> 16) & 0xff) / 255),
    g: srgbToLinear(((channel.color >> 8) & 0xff) / 255),
    b: srgbToLinear((channel.color & 0xff) / 255),
  }))
  let roughnessTotal = 0

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const weightOffset = vertex * 4
    const colorOffset = vertex * 3
    let r = 0
    let g = 0
    let b = 0
    let roughness = 0
    for (let channel = 0; channel < 4; channel += 1) {
      const weight = paintWeights[weightOffset + channel]
      if (weight <= 0) continue
      r += channelColors[channel].r * weight
      g += channelColors[channel].g * weight
      b += channelColors[channel].b * weight
      roughness += settings.channels[channel].roughness * weight
    }
    // Interior faces sit inside the rock and never see the sky, so they read as
    // flat and papery at the same albedo as the surface above them.
    const shade = interiorVertices[vertex] > 0 ? 0.55 : 1
    colors[colorOffset] = r * shade
    colors[colorOffset + 1] = g * shade
    colors[colorOffset + 2] = b * shade
    roughnessTotal += roughness
  }

  return {
    colors,
    averageRoughness: vertexCount > 0 ? clamp(roughnessTotal / vertexCount, 0.05, 1) : 0.9,
  }
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function worldBounds(positions: Float32Array, region: MeshTerrainRegion): AABB {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (positions[offset] < minX) minX = positions[offset]
    if (positions[offset] > maxX) maxX = positions[offset]
    if (positions[offset + 1] < minY) minY = positions[offset + 1]
    if (positions[offset + 1] > maxY) maxY = positions[offset + 1]
    if (positions[offset + 2] < minZ) minZ = positions[offset + 2]
    if (positions[offset + 2] > maxZ) maxZ = positions[offset + 2]
  }
  if (!Number.isFinite(minX)) {
    return {
      min: { x: region.originX, y: 0, z: region.originZ },
      max: { x: region.originX + region.size, y: 0, z: region.originZ + region.size },
    }
  }
  return {
    min: { x: region.originX + minX, y: minY, z: region.originZ + minZ },
    max: { x: region.originX + maxX, y: maxY, z: region.originZ + maxZ },
  }
}

/**
 * Whether an evaluated region can still be reused for a changed stack.
 *
 * Cheap enough to call per render: it compares regions rather than geometry, so
 * a caller can skip re-evaluating when a change lands outside what is on
 * screen.
 */
export function regionCoversBounds(region: MeshTerrainRegion, bounds: AABB): boolean {
  return intersects(
    {
      min: { x: region.originX, y: -Infinity, z: region.originZ },
      max: {
        x: region.originX + region.size,
        y: Infinity,
        z: region.originZ + region.size,
      },
    },
    bounds,
  )
}

/**
 * A stable key for one evaluation's inputs.
 *
 * Evaluation is pure, so identical inputs give identical output and a caller
 * can memoize on this instead of re-running the stack. Modifiers contribute
 * their identity, order and revision-bearing fields rather than a deep hash of
 * every dab: a stroke's points never change after it is committed, and a live
 * stroke's do change but its `points.length` changes with them.
 */
export function meshTerrainEvaluationKey(
  state: MeshTerrainState,
  options: MeshTerrainEvaluateOptions = {},
): string {
  const parts: string[] = [
    `v${state.version}`,
    `seed:${state.seed}`,
    `profile:${state.profile}`,
    `world:${state.worldSize}`,
    `section:${state.sectionSize}`,
    `res:${options.resolution ?? DEFAULT_RESOLUTION}`,
    `csg:${options.applyBooleans === false ? 0 : 1}`,
    `detail:${options.booleanDetail ?? 1}`,
    `region:${options.region?.originX ?? 'auto'}:${options.region?.originZ ?? 'auto'}:${options.region?.size ?? 'auto'}`,
  ]
  for (const modifier of state.modifiers ?? []) {
    parts.push(
      `${modifier.id}|${modifier.type}|${modifier.enabled ? 1 : 0}|${modifier.priority}|${modifier.sequence ?? -1}|${modifierRevisionHint(modifier)}`,
    )
  }
  for (const channel of state.materialSettings?.channels ?? []) {
    parts.push(`${channel.id}:${channel.color}:${channel.roughness}`)
  }
  return parts.join(';')
}

function modifierRevisionHint(modifier: TerrainModifier): string {
  switch (modifier.type) {
    case 'brush-stroke':
    case 'weight-paint':
      return `${modifier.points.length}:${modifier.radius}:${modifier.strength}:${modifier.falloff}`
    case 'boolean-subtract':
      return `${modifier.radius}:${modifier.depth}:${modifier.noise}:${modifier.carves?.length ?? 0}`
    case 'boolean-volume':
      return `${modifier.operation}:${modifier.volumes.length}`
    case 'noise':
      return `${modifier.amplitude}:${modifier.frequency}:${modifier.seed}`
    case 'field-displacement':
      return `${modifier.fieldId}:${modifier.scale}`
    case 'remesh':
    case 'tessellate':
      return `${modifier.radius}:${modifier.targetEdgeLength}`
    case 'sculpt-layer':
      return `${modifier.opacity}`
    case 'material-settings':
      return modifier.settings.channels.map((channel) => channel.color).join(',')
  }
}

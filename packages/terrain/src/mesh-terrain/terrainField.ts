/**
 * The non-destructive field stack: what a modifier does to a point in space.
 *
 * Ported from upstream's `compiler/TerrainField.ts`. This is the layer that
 * turns the base field into the authored surface -- it is deliberately
 * point-wise and stateless, so a caller can evaluate any world position at any
 * resolution, in any order, and get the same answer.
 *
 * Two upstream behaviours are intentionally absent:
 *
 *  - `BrushSampleIndex`, the per-stroke spatial index that lets a heightfield
 *    stroke test only its nearby dabs, was not part of the authoring port. Its
 *    absence is a performance difference and not a correctness one: without it
 *    every dab in a stroke is visited, which is exactly what the index was
 *    accelerating. The AABB reject below still removes the common case.
 *  - `evaluateEditableTerrainPoint`, which replays the stack over an arbitrary
 *    source mesh rather than a height-derived grid. Nothing here compiles from
 *    a stored `TerrainMesh` snapshot yet, so it would be dead code.
 */

import { clamp, lerp, smoothstep } from './core/bounds'
import type { Vec3Like } from './core/types'
import { sampleBaseHeight, type MeshTerrainProfile } from './baseField'
import type { TerrainApron } from './modifiers/boolean/CutterVolume'
import {
  applyBrushDab,
  maximumDabDisplacement,
  type BrushKernelParams,
  type BrushKernelSample,
} from './modifiers/brushKernel'
import type { BrushStrokeModifier, TerrainModifier } from './modifiers/types'

/**
 * Elevation at a world column, after every height-domain modifier.
 *
 * Strokes are not applied here: a stroke can move a point laterally, which a
 * function of (x, z) cannot express. `evaluateTerrainPoint` is what applies
 * them, and it is what meshing calls.
 */
export function evaluateHeight(
  worldX: number,
  worldZ: number,
  seed: number,
  profile: MeshTerrainProfile,
  modifiers: readonly TerrainModifier[],
): number {
  let height = sampleBaseHeight(worldX, worldZ, seed, profile)

  for (const modifier of modifiers) {
    if (!modifier.enabled) continue
    switch (modifier.type) {
      case 'noise': {
        const noise = valueNoise(
          worldX * modifier.frequency,
          worldZ * modifier.frequency,
          modifier.seed,
        )
        height += (noise * 2 - 1) * modifier.amplitude
        break
      }
      case 'field-displacement':
        height +=
          Math.sin(worldX * 0.018 + worldZ * 0.011) * modifier.scale * 0.5
        break
      default:
        break
    }
  }
  return height
}

/** Maps a procedural surface coordinate into an authored point in 3D space. */
export function evaluateTerrainPoint(
  worldX: number,
  worldZ: number,
  seed: number,
  profile: MeshTerrainProfile,
  modifiers: readonly TerrainModifier[],
): Vec3Like {
  const point = {
    x: worldX,
    y: evaluateHeight(worldX, worldZ, seed, profile, modifiers),
    z: worldZ,
  }

  // Grow the cheap source surface into additive mesh patches before exact CSG.
  // The Boolean still owns every overhang and opening; this only supplies a
  // broad, low-frequency geological root on the terrain side of the join.
  let apronLift = 0
  for (const modifier of modifiers) {
    if (
      !modifier.enabled ||
      modifier.type !== 'boolean-volume' ||
      modifier.operation !== 'add'
    ) {
      continue
    }
    for (const volume of modifier.volumes) {
      if (!volume.terrainApron) continue
      apronLift = Math.max(
        apronLift,
        terrainApronLift(worldX, worldZ, volume.terrainApron),
      )
    }
  }
  point.y += apronLift

  for (const modifier of modifiers) {
    if (!modifier.enabled || modifier.type !== 'brush-stroke') continue
    applyBrushToPoint(point, modifier)
  }
  return point
}

/** Smooth radial distance to an oriented ellipse, with a metre-space falloff. */
export function terrainApronLift(
  worldX: number,
  worldZ: number,
  apron: TerrainApron,
): number {
  const forwardLength = Math.hypot(apron.forward.x, apron.forward.z) || 1
  const forwardX = apron.forward.x / forwardLength
  const forwardZ = apron.forward.z / forwardLength
  const sideX = -forwardZ
  const sideZ = forwardX
  const dx = worldX - apron.center.x
  const dz = worldZ - apron.center.z
  const along = dx * forwardX + dz * forwardZ
  const across = dx * sideX + dz * sideZ
  const distance = Math.hypot(along, across)
  const halfLength = Math.max(0.25, apron.halfLength)
  const halfWidth = Math.max(0.25, apron.halfWidth)

  // Radius of the core ellipse in the direction of this sample. This avoids
  // an AABB-shaped mound around oblique sheets while keeping evaluation O(1).
  let coreRadius = Math.min(halfLength, halfWidth)
  if (distance > 1e-6) {
    const directionX = along / distance
    const directionZ = across / distance
    coreRadius =
      1 /
      Math.sqrt(
        (directionX * directionX) / (halfLength * halfLength) +
          (directionZ * directionZ) / (halfWidth * halfWidth),
      )
  }
  const falloff = Math.max(0.25, apron.falloff)
  if (distance >= coreRadius + falloff) return 0
  const influence =
    distance <= coreRadius
      ? 1
      : 1 - smoothstep(coreRadius, coreRadius + falloff, distance)

  // A tiny continuous warp prevents the apron edge becoming a mathematically
  // perfect contour, without adding another modifier or any random state.
  const geologicalVariation =
    0.9 +
    Math.sin(worldX * 0.037 + worldZ * 0.051) * 0.065 +
    Math.sin(worldX * 0.091 - worldZ * 0.043) * 0.035
  return Math.max(0, apron.lift) * influence * geologicalVariation
}

/** True when any stroke pushes into X/Z, so the result is no longer a height field. */
export function hasLateralDisplacement(
  modifiers: readonly TerrainModifier[],
): boolean {
  return modifiers.some(
    (modifier) =>
      modifier.type === 'brush-stroke' &&
      modifier.points.some(
        (point) => Math.hypot(point.normal?.x ?? 0, point.normal?.z ?? 0) > 0.01,
      ),
  )
}

function applyBrushToPoint(
  point: Vec3Like,
  modifier: BrushStrokeModifier,
): void {
  // Most vertices handed to an evaluation sit outside the stroke. One box test
  // rejects them before any per-dab work, which matters most for mesh-domain
  // strokes: those would otherwise pay the full O(vertices x dabs) sweep.
  const params = brushParams(modifier)
  const slack = maximumDabDisplacement(params)
  const bounds = modifier.bounds
  if (
    point.x < bounds.min.x - slack ||
    point.x > bounds.max.x + slack ||
    point.z < bounds.min.z - slack ||
    point.z > bounds.max.z + slack ||
    (modifier.domain !== 'heightfield' &&
      (point.y < bounds.min.y - slack || point.y > bounds.max.y + slack))
  ) {
    return
  }

  // The position this stroke found the point at. Every dab is bounded against
  // it, so the limit applies to the stroke and not to each dab in turn.
  anchor.x = point.x
  anchor.y = point.y
  anchor.z = point.z
  for (const sample of modifier.points) {
    const normal = sample.normal ?? { x: 0, y: 1, z: 0 }
    const length = Math.hypot(normal.x, normal.y, normal.z) || 1
    kernelSample.x = sample.x
    kernelSample.y = sample.y
    kernelSample.z = sample.z
    kernelSample.normalX = normal.x / length
    kernelSample.normalY = normal.y / length
    kernelSample.normalZ = normal.z / length
    kernelSample.weight = sample.weight ?? 1
    applyBrushDab(point, params, kernelSample, anchor)
  }
}

const anchor = { x: 0, y: 0, z: 0 }

/** Reused across the vertex loop; the kernel never retains either object. */
const kernelSample: BrushKernelSample = {
  x: 0,
  y: 0,
  z: 0,
  normalX: 0,
  normalY: 1,
  normalZ: 0,
  weight: 1,
}

function brushParams(modifier: BrushStrokeModifier): BrushKernelParams {
  return {
    mode: modifier.mode,
    domain: modifier.domain,
    radius: modifier.radius,
    strength: modifier.strength,
    falloff: modifier.falloff,
    targetY: modifier.targetY,
    terraceStep: modifier.terraceStep,
    noiseScale: modifier.noiseScale,
    noiseSeed: modifier.noiseSeed,
    accumulate: modifier.accumulate,
  }
}

/**
 * The `noise` modifier's own value noise.
 *
 * Deliberately not the quintic-interpolated one in `baseField`: upstream's
 * modifier noise used a smoothstep fraction, and a saved world's noise
 * modifiers were authored against that curve.
 */
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = smoothstep(0, 1, x - x0)
  const tz = smoothstep(0, 1, z - z0)
  const a = hash2(x0, z0, seed)
  const b = hash2(x0 + 1, z0, seed)
  const c = hash2(x0, z0 + 1, seed)
  const d = hash2(x0 + 1, z0 + 1, seed)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz)
}

function hash2(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374_761_393) + Math.imul(z, 668_265_263)
  value = (value ^ (value >>> 13)) + Math.imul(seed, 1_443_053)
  value = Math.imul(value ^ (value >>> 16), 1_274_126_177)
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295
}

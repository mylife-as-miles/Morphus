/**
 * The base elevation a mesh terrain starts from, before any modifier runs.
 *
 * Ported down from upstream's `compiler/heightField.ts`. The upstream file is
 * the demo world's full geological model -- strata, dunes, an authored hero
 * river, a showcase basin, climate and drainage fields feeding its material
 * system. None of that belongs in an editor's base surface: a user who drops a
 * terrain node has not asked for someone else's landscape, and the extra fields
 * exist to drive a renderer we did not port.
 *
 * What is kept is the part that makes the surface *worth sculpting on* -- a
 * continent mask, a domain-warped ridged massif, billowed foothills, and carved
 * drainage -- plus the flat profile, which is what "start from nothing" has to
 * mean for an editor.
 *
 * Every stage is a closed-form function of (x, z, seed): no module state, no
 * caches, no ordering. Two calls with the same arguments always agree, which is
 * what lets `evaluateMeshTerrain` be pure.
 */

import { clamp, lerp, smoothstep } from './core/bounds'

/** Base elevation model. Mirrors `MeshTerrainProfile` in the document types. */
export type MeshTerrainProfile = 'natural' | 'flat'

const MOUNTAIN_AMPLITUDE = 470
const FOOTHILL_AMPLITUDE = 62
const PLAIN_AMPLITUDE = 16
const SEA_LEVEL = -8

/** Where standing water sits, in metres. Upstream's `climate.WATER_LEVEL`. */
export const MESH_TERRAIN_WATER_LEVEL = 25

/** The flat profile's ground plane: above water, so a new world starts dry. */
export const FLAT_GROUND_LEVEL = MESH_TERRAIN_WATER_LEVEL + 12

export interface BaseFieldSample {
  height: number
  /** 0 on plains, 1 in the high massif. */
  massif: number
  /** 0..1 proximity to a carved drainage line. */
  valley: number
}

/**
 * Samples the base field at one world position.
 *
 * `profile` is a parameter rather than the module-level `setWorldProfile()`
 * upstream uses. Upstream could afford world-lifetime state because one process
 * served one world; an editor can hold several terrain nodes with different
 * profiles in the same document and must not have them interfere.
 */
export function sampleBaseField(
  x: number,
  z: number,
  seed: number,
  profile: MeshTerrainProfile,
): BaseFieldSample {
  return profile === 'flat'
    ? sampleFlatField(x, z, seed)
    : sampleNaturalField(x, z, seed)
}

/** Elevation only, for callers that do not need the classification fields. */
export function sampleBaseHeight(
  x: number,
  z: number,
  seed: number,
  profile: MeshTerrainProfile,
): number {
  return sampleBaseField(x, z, seed, profile).height
}

function sampleFlatField(x: number, z: number, seed: number): BaseFieldSample {
  // A couple of metres of very broad undulation plus centimetre grain. Without
  // it the plain shades as one flat colour and neither the sun angle nor an
  // early brush stroke is legible against it.
  const swell = fbm(x * 0.0009, z * 0.0009, seed + 61, 2, 2.1, 0.5) * 2.4
  const grain = fbm(x * 0.021, z * 0.021, seed + 67, 2, 2.1, 0.5) * 0.35
  return { height: FLAT_GROUND_LEVEL + swell + grain, massif: 0, valley: 0 }
}

function sampleNaturalField(
  x: number,
  z: number,
  seed: number,
): BaseFieldSample {
  // --- 1. where mountains live -----------------------------------------
  // Two very low frequency fields: one selects the massif, one tilts the whole
  // region so the range has a dominant strike direction like a real orogeny.
  const strike = 0.42
  const along = x * Math.cos(strike) + z * Math.sin(strike)
  const across = z * Math.cos(strike) - x * Math.sin(strike)

  const spine = Math.exp(-((across - 120) ** 2) / (2 * 620 ** 2))
  const regional = fbm(x * 0.00028, z * 0.00028, seed + 11, 3, 2.1, 0.5)
  const massif = clamp(
    smoothstep(0.18, 0.78, spine * 0.75 + regional * 0.55 + 0.08),
    0,
    1,
  )

  // --- 2. the massif ----------------------------------------------------
  // Warping the sample point before the ridge stack is what produces bent,
  // interlocking ridgelines instead of a regular grid of cones.
  const warpX = fbm(x * 0.0011, z * 0.0011, seed + 71, 3, 2.2, 0.5) * 240
  const warpZ =
    fbm(x * 0.0011 + 5.7, z * 0.0011 - 3.1, seed + 73, 3, 2.2, 0.5) * 240
  const ridge = ridgedMultifractal(
    (x + warpX) * 0.00085,
    (z + warpZ) * 0.00085,
    seed + 101,
    9,
  )
  // Sharpening the ridge profile raises the peaks and flattens the basins,
  // which reads as glacial relief rather than as noise.
  const mountains = Math.pow(ridge, 1.55) * MOUNTAIN_AMPLITUDE * massif

  // --- 3. foothills and plains -----------------------------------------
  const foothills =
    billow(x * 0.0034, z * 0.0034, seed + 211, 4) *
    FOOTHILL_AMPLITUDE *
    (0.35 + massif * 0.9)
  const plains =
    fbm(x * 0.0062, z * 0.0062, seed + 307, 4, 2.15, 0.52) * PLAIN_AMPLITUDE

  let height = SEA_LEVEL + mountains + foothills + plains + along * 0.004

  // --- 4. valleys -------------------------------------------------------
  // A second ridge field, inverted, used as a drainage network. Its channels
  // cut deepest where the terrain is highest, mimicking headward erosion.
  const drainage = ridgedMultifractal(
    (x - warpZ * 0.4) * 0.00062,
    (z + warpX * 0.4) * 0.00062,
    seed + 401,
    5,
  )
  const valley = clamp(smoothstep(0.62, 0.98, 1 - drainage), 0, 1)
  height -= (26 + massif * 120) * valley

  // Flatten the valley floor so rivers and meadows have somewhere to sit.
  const floor = SEA_LEVEL + 6 + massif * 40
  if (valley > 0.55) {
    const flatten = smoothstep(0.55, 0.95, valley) * 0.65
    height = lerp(height, Math.min(height, floor + valley * 12), flatten)
  }

  return { height, massif, valley }
}

// --- noise primitives --------------------------------------------------------
// Kept byte-for-byte from upstream so a world authored against Mesh Terrain Lab
// lands on the same surface here. Changing any constant below silently moves
// every saved stroke relative to the ground it was drawn on.

function ridgedMultifractal(
  x: number,
  z: number,
  seed: number,
  octaves: number,
): number {
  let sum = 0
  let amplitude = 0.52
  let frequency = 1
  let weight = 1
  let total = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    let signal =
      1 -
      Math.abs(valueNoise(x * frequency, z * frequency, seed + octave * 37) * 2 - 1)
    signal *= signal
    // Weighting each octave by the previous one concentrates detail on the
    // ridges and leaves the flanks smooth -- the defining trait of the form.
    signal *= weight
    weight = clamp(signal * 2.2, 0, 1)
    sum += signal * amplitude
    total += amplitude
    amplitude *= 0.52
    frequency *= 2.07
  }
  return clamp(sum / total, 0, 1)
}

function billow(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    const signal = Math.abs(
      valueNoise(x * frequency, z * frequency, seed + octave * 53) * 2 - 1,
    )
    sum += signal * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return sum / total
}

function fbm(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    sum +=
      (valueNoise(x * frequency, z * frequency, seed + octave * 17) * 2 - 1) *
      amplitude
    total += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }
  return sum / total
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = smoothFraction(x - x0)
  const tz = smoothFraction(z - z0)
  const a = hash2(x0, z0, seed)
  const b = hash2(x0 + 1, z0, seed)
  const c = hash2(x0, z0 + 1, seed)
  const d = hash2(x0 + 1, z0 + 1, seed)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz)
}

function smoothFraction(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function hash2(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374_761_393) + Math.imul(z, 668_265_263)
  value = (value ^ (value >>> 13)) + Math.imul(seed, 1_443_053)
  value = Math.imul(value ^ (value >>> 16), 1_274_126_177)
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295
}

/**
 * Extrudes lots into building volumes.
 *
 * This is the stage the reference footage shows as flat-coloured boxes before
 * any facade exists, and it is worth having as its own step rather than as a
 * hidden phase of a building generator. Massing is where a city's silhouette is
 * decided -- the skyline, the street wall, where the towers cluster -- and all
 * of that is legible in untextured boxes. A facade pass can only decorate what
 * massing has already got right.
 *
 * Heights come from a seeded field rather than per-lot noise, so neighbours
 * agree: real blocks rise and fall together, and independently random heights
 * produce a sawtooth no real city has.
 */

import { mulberry32, type Lot } from '../blocks/lots'
import type { Point2 } from '../blocks/blockPolygons'

export interface MassingOptions {
  lots: readonly Lot[]
  /** Ground height sampler, so volumes sit on terrain. */
  groundHeight?: (x: number, z: number) => number
  seed?: number
  /** Storey height in metres. Heights are quantised to it. */
  storeyHeight?: number
  minStoreys?: number
  maxStoreys?: number
  /**
   * Where the tall buildings are, in world metres, and how far the falloff
   * reaches. Without a centre a generated city is uniformly tall, which reads
   * as a housing estate rather than as a downtown.
   */
  centerX?: number
  centerZ?: number
  falloffRadius?: number
}

export interface MassingVolume {
  lotId: string
  storeys: number
  height: number
  /** Base corners, counter-clockwise. */
  footprint: Point2[]
  /** Flat colour for the massing view, one per volume. */
  color: [number, number, number]
}

export interface MassingMeshData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
  vertexCount: number
}

export function buildMassing({
  centerX = 0,
  centerZ = 0,
  falloffRadius = 400,
  groundHeight,
  lots,
  maxStoreys = 12,
  minStoreys = 2,
  seed = 1,
  storeyHeight = 3.4
}: MassingOptions): MassingVolume[] {
  // Ground is resolved when the mesh is built, not here: a volume is a
  // footprint and a height, and where it sits vertically is the mesh builder's
  // problem. Keeping it out of this function is what lets massing be recomputed
  // on a height tweak without re-sampling terrain.
  void groundHeight
  const random = mulberry32(seed)
  const volumes: MassingVolume[] = []

  for (const lot of lots) {
    const distance = Math.hypot(lot.frontage.x - centerX, lot.frontage.z - centerZ)
    // Smooth, not linear: a linear falloff puts a visible cone over the city.
    const centrality = 1 / (1 + (distance / Math.max(1, falloffRadius)) ** 2)

    // A narrow lot cannot carry a tower. Tying height to frontage is most of
    // what stops the massing reading as boxes scattered on a grid: the tall
    // ones end up on the wide corner parcels, which is where they are in life.
    const frontageFactor = Math.min(1, lot.frontageWidth / 25)

    const span = maxStoreys - minStoreys
    const storeys = Math.max(
      1,
      Math.round(minStoreys + span * centrality * frontageFactor * (0.55 + random() * 0.65))
    )

    volumes.push({
      color: massingColour(random),
      footprint: lot.points,
      height: storeys * storeyHeight,
      lotId: lot.id,
      storeys
    })
  }

  return volumes
}

/**
 * Turns volumes into a drawable mesh.
 *
 * Walls and a flat roof per volume, flat-shaded. Deliberately no floors: a box
 * standing on the ground never shows its underside, and skipping it is a fifth
 * of the geometry across a whole downtown.
 */
export function buildMassingMesh(
  volumes: readonly MassingVolume[],
  groundHeight?: (x: number, z: number) => number
): MassingMeshData {
  const height = groundHeight ?? (() => 0)
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (const volume of volumes) {
    const footprint = volume.footprint
    if (footprint.length < 3) continue

    // One base height for the whole volume, taken from the footprint centroid.
    // Buildings are level; following the terrain per corner would shear them.
    let cx = 0
    let cz = 0
    for (const point of footprint) {
      cx += point.x
      cz += point.z
    }
    cx /= footprint.length
    cz /= footprint.length

    // The lowest corner, so a building on a slope is buried rather than
    // floating on its downhill side. Cut and fill belongs to the terrain stack.
    let base = Infinity
    for (const point of footprint) base = Math.min(base, height(point.x, point.z))
    if (!Number.isFinite(base)) base = height(cx, cz)

    const top = base + volume.height
    const [r, g, b] = volume.color

    for (let index = 0; index < footprint.length; index += 1) {
      const a = footprint[index]!
      const c = footprint[(index + 1) % footprint.length]!

      const dx = c.x - a.x
      const dz = c.z - a.z
      const length = Math.hypot(dx, dz) || 1
      const nx = dz / length
      const nz = -dx / length

      const start = positions.length / 3
      positions.push(a.x, base, a.z, c.x, base, c.z, c.x, top, c.z, a.x, top, a.z)
      for (let corner = 0; corner < 4; corner += 1) {
        normals.push(nx, 0, nz)
        colors.push(r, g, b)
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
    }

    // Roof as a fan from the centroid. Correct for the convex quads
    // subdivision produces, and cheaper than triangulating properly.
    const roofCentre = positions.length / 3
    positions.push(cx, top, cz)
    normals.push(0, 1, 0)
    colors.push(r * 1.08, g * 1.08, b * 1.08)

    const rim: number[] = []
    for (const point of footprint) {
      rim.push(positions.length / 3)
      positions.push(point.x, top, point.z)
      normals.push(0, 1, 0)
      colors.push(r * 1.08, g * 1.08, b * 1.08)
    }

    for (let index = 0; index < rim.length; index += 1) {
      indices.push(roofCentre, rim[index]!, rim[(index + 1) % rim.length]!)
    }
  }

  return {
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    normals: Float32Array.from(normals),
    positions: Float32Array.from(positions),
    vertexCount: positions.length / 3
  }
}

/**
 * A flat colour per volume for the massing view.
 *
 * Saturated and arbitrary on purpose. Massing is a diagram, not a render: the
 * job of the colour is to make one volume distinguishable from the one behind
 * it, and anything approaching brick or concrete makes adjacent boxes merge
 * into a single grey mass exactly when the silhouette is what you are judging.
 */
function massingColour(random: () => number): [number, number, number] {
  const hue = random()
  const saturation = 0.55 + random() * 0.3
  const lightness = 0.55 + random() * 0.2
  return hslToRgb(hue, saturation, lightness)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

/**
 * Turns a massing volume into an actual building.
 *
 * The massing pass decides a city's silhouette in flat coloured boxes; this is
 * the pass that gives those boxes facades. It drives the vendored
 * procedural-bank grammar, which generates early-twentieth-century American
 * commercial architecture -- limestone banks, zoning-setback towers, corner
 * headquarters.
 *
 * That vocabulary is narrower than a whole city needs. It has no brownstones,
 * no tenements, no warehouses, so building every lot with it produces a
 * downtown where every address is a bank. It is used here for the lots that
 * earn it -- the tall, wide, central ones the massing pass already singled out
 * -- and everything else stays as massing until a residential grammar exists.
 * `coverage` is what an author moves to decide how much of the city that is.
 */

import type { Lot } from '../blocks/lots'
import type { MassingVolume } from '../massing/massing'
import { mulberry32 } from '../blocks/lots'
import { generateFinancialBuilding } from './vendor/kit/building/building-generator'
import { BAY_WIDTH, FLOOR_HEIGHT } from './vendor/grammar/mass-grammar'
import type {
  BuildingSettings,
  BuildingVariant,
  GeneratedBuilding,
  MaterialVariant
} from './vendor/kit/kit-types'

export interface BuildingInstance {
  lotId: string
  /** World position of the footprint centre. */
  x: number
  z: number
  /** Base height, taken from the terrain under the footprint. */
  y: number
  /** Rotation about Y so the facade faces its street, in radians. */
  rotation: number
  variant: BuildingVariant
  generated: GeneratedBuilding
}

export interface BuildBuildingsOptions {
  lots: readonly Lot[]
  volumes: readonly MassingVolume[]
  groundHeight?: (x: number, z: number) => number
  seed?: number
  /**
   * Fraction of lots that become real buildings, tallest first.
   *
   * Not a random sample: the massing pass already ranked lots by centrality and
   * frontage, so taking the top slice puts the architecture where the grammar
   * suits it and leaves the periphery as massing.
   *
   * Kept small by default, and the reason is measured rather than cautious --
   * see `maxBuildings`.
   */
  coverage?: number
  /**
   * Hard cap on generated buildings.
   *
   * This grammar builds one showcase building, not a city of them. Measured on
   * a 7x8 bay, 8 floor block: 142,552 triangles from 478 kit modules, in about
   * 300ms. Turning every knob down -- no ornament, no colonnade, no crown, no
   * roof equipment -- reaches 117,660, a saving of 17%, because the cost is in
   * the modules themselves rather than in the decoration. Even a small 4x4 bay,
   * 4 floor building is 61,508.
   *
   * So the whole city cannot be built this way: the 444 volumes a modest grid
   * produces would be about 62 million triangles and over two minutes of
   * blocking work. A few dozen landmarks among massing boxes is what the
   * grammar is actually for, and that reads correctly anyway -- a downtown has
   * a handful of monuments, not four hundred.
   */
  maxBuildings?: number
}

/**
 * The smallest lot worth a facade, in bays.
 *
 * Below three bays the grammar has no room for an entrance and a rhythm either
 * side of it, and produces something that reads as a wall rather than a
 * building. Those lots keep their massing box.
 */
const MIN_BAYS = 3

export function buildBuildings({
  coverage = 0.08,
  groundHeight,
  lots,
  maxBuildings = 24,
  seed = 1,
  volumes
}: BuildBuildingsOptions): BuildingInstance[] {
  const height = groundHeight ?? (() => 0)
  const byLot = new Map(lots.map((lot) => [lot.id, lot]))

  // Tallest first, so a budget that runs out leaves the skyline intact and
  // drops the buildings nobody was looking at.
  const ranked = [...volumes].sort((a, b) => b.storeys - a.storeys)
  const wanted = Math.min(maxBuildings, Math.floor(ranked.length * clamp01(coverage)))

  const random = mulberry32(seed)
  const buildings: BuildingInstance[] = []

  for (const volume of ranked) {
    if (buildings.length >= wanted) break

    const lot = byLot.get(volume.lotId)
    if (!lot) continue

    const widthBays = Math.round(lot.frontageWidth / BAY_WIDTH)
    const depthBays = Math.round(lot.depth / BAY_WIDTH)
    if (widthBays < MIN_BAYS || depthBays < MIN_BAYS) continue

    const centre = centroid(lot)

    buildings.push({
      generated: generateFinancialBuilding(
        settingsFor(volume, widthBays, depthBays, random, seed + buildings.length)
      ),
      lotId: lot.id,
      // Lowest corner, so a building on a slope is buried rather than left
      // floating on its downhill side. Cut and fill belongs to the terrain.
      y: lowestCorner(lot, height),
      rotation: facingAngle(lot),
      variant: variantFor(volume, widthBays),
      x: centre.x,
      z: centre.z
    })
  }

  return buildings
}

/**
 * Which archetype a lot gets.
 *
 * Driven by the massing rather than by chance. A tall slender lot reads as a
 * setback tower, a broad low one as a classic bank, and the widest of the tall
 * ones as a corner headquarters -- so the grammar's three variants land where
 * their proportions already make sense instead of being scattered.
 */
function variantFor(volume: MassingVolume, widthBays: number): BuildingVariant {
  if (volume.storeys >= 9) return widthBays >= 8 ? 'corner-hq' : 'setback-tower'
  return 'classic-bank'
}

/**
 * Upstream's own defaults, copied from its editor state.
 *
 * Every generated building starts here and overrides only what the lot decides.
 * That is not laziness -- `BuildingSettings` types most of its fields as
 * optional but reads them as numbers, so a setting left out arrives as
 * `undefined`, flows into the mesher's arithmetic, and produces a geometry
 * whose positions are NaN. The failure is silent until three tries to compute a
 * bounding sphere. Starting from a known-complete set makes that impossible
 * rather than merely unlikely.
 */
const UPSTREAM_DEFAULTS = {
  seed: 1042,
  variant: 'setback-tower',
  widthBays: 9,
  depthBays: 7,
  floors: 17,
  podiumFloors: 3,
  setbackFloors: 2,
  towerScale: 0.82,
  ornamentDensity: 0.72,
  colonnade: true,
  cornerEntrance: true,
  crown: true,
  materialVariant: 'light-limestone',
  debugMode: 'beauty',
  activeTab: 'building',
  selectedModuleId: 'round-column',
  podiumStyle: 'colonnade',
  entranceType: 'center-revolving',
  shaftRhythm: 'chicago-grid',
  crownStyle: 'windowed-crown',
  roofEquipmentDensity: 0.7,
  massingPattern: 'single-tower',
  footprintStyle: 'rectangle',
  secondaryFootprintStyle: 'rectangle',
  footprintHeightMode: 'full-height',
  hardInsetSide: 'none',
  hardInsetAmount: 0,
  // These read as fractions of the footprint rather than metres.
  innerCourtWidth: 0.38,
  innerCourtDepth: 0.42,
  innerCourtOffsetX: 0,
  innerCourtOffsetZ: 0,
  skybridgeEnabled: false,
  skybridgeFloor: 8,
  buildingArchetype: 'board-of-trade-tower',
  roofStyle: 'statue-tower',
  porticoProjection: 1.8,
  centralAxisBays: 3,
  cornerTreatment: 'rounded-piers',
  crownDecorationStyle: 'classical',
  crownDecorationDensity: 0.6,
  crownFinialRhythm: 'edge-regular',
  crownFinialDensity: 0.55
} satisfies BuildingSettings

function settingsFor(
  volume: MassingVolume,
  widthBays: number,
  depthBays: number,
  random: () => number,
  seed: number
): BuildingSettings {
  const variant = variantFor(volume, widthBays)
  const floors = Math.max(2, volume.storeys)

  // A podium taller than the building is not a podium. Two floors is the
  // grammar's own minimum for a colonnade to read at street level.
  const podiumFloors = Math.min(2, Math.max(1, floors - 1))

  const materials: MaterialVariant[] = ['light-limestone', 'dark-granite', 'aged-terra-cotta']

  return {
    ...UPSTREAM_DEFAULTS,

    // Everything below is what this lot decides.
    seed,
    variant,
    widthBays,
    depthBays,
    floors,
    podiumFloors,
    setbackFloors: variant === 'setback-tower' ? Math.max(2, Math.round(floors * 0.35)) : 0,
    towerScale: 0.7 + random() * 0.2,
    ornamentDensity: 0.4 + random() * 0.4,
    colonnade: variant === 'classic-bank',
    cornerEntrance: variant === 'corner-hq',
    crown: floors >= 6,
    materialVariant: materials[Math.floor(random() * materials.length)] ?? 'light-limestone',
    podiumStyle: variant === 'corner-hq' ? 'corner-entrance' : 'colonnade',
    entranceType: variant === 'corner-hq' ? 'corner-bank' : 'center-revolving',
    shaftRhythm: widthBays >= 8 ? 'chicago-grid' : 'regular',
    crownStyle: floors >= 9 ? 'windowed-crown' : 'flat-parapet',
    roofEquipmentDensity: 0.3 + random() * 0.4,
    massingPattern: 'single-tower',
    footprintStyle: 'rectangle',
    secondaryFootprintStyle: 'rectangle'
  }
}

/** Storey height the grammar assumes, exported so massing can agree with it. */
export const BUILDING_FLOOR_HEIGHT = FLOOR_HEIGHT

function centroid(lot: Lot): { x: number; z: number } {
  let x = 0
  let z = 0
  for (const point of lot.points) {
    x += point.x
    z += point.z
  }
  return { x: x / lot.points.length, z: z / lot.points.length }
}

function lowestCorner(lot: Lot, height: (x: number, z: number) => number): number {
  let lowest = Infinity
  for (const point of lot.points) lowest = Math.min(lowest, height(point.x, point.z))
  return Number.isFinite(lowest) ? lowest : 0
}

/** Rotation that turns the generated building's front toward its street. */
function facingAngle(lot: Lot): number {
  return Math.atan2(lot.facing.x, lot.facing.z)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

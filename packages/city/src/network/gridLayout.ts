/**
 * Lays out a street grid.
 *
 * A grid is the cheapest network that reads as a city, and it is what the
 * reference footage is built on: long avenues with shorter cross streets, the
 * blocks between them longer than they are wide. It is a starting point an
 * author edits, not the only shape the network supports -- everything
 * downstream reads the graph, not this function.
 *
 * The block proportion matters more than the block size. Manhattan's blocks run
 * roughly 80m by 275m, and that 1:3 ratio is most of why a gridded city reads
 * as a city rather than as graph paper, so it is the default here.
 */

import {
  ROAD_CLASS_DEFAULTS,
  type RoadClass,
  type RoadNetwork,
  type RoadSegment
} from './roadNetwork'

export interface GridLayoutOptions {
  /** Blocks along x and z. */
  columns: number
  rows: number
  /** Block interior size in metres, before street width is added. */
  blockWidth: number
  blockDepth: number
  /** Grid centre in world metres. */
  centerX?: number
  centerZ?: number
  /**
   * Every nth avenue is an arterial, counted along x. Zero disables them.
   *
   * Real grids are not uniform: a wider street every few blocks is what breaks
   * the repetition and gives a city a spine.
   */
  arterialEvery?: number
  /** Rotation of the whole grid about its centre, in radians. */
  rotation?: number
}

export interface GridLayoutResult {
  network: RoadNetwork
  /** Corner node ids per block, row-major, for the block-polygon pass. */
  blockCorners: string[][]
}

export function generateGridNetwork(options: GridLayoutOptions): GridLayoutResult {
  const {
    arterialEvery = 4,
    blockDepth,
    blockWidth,
    centerX = 0,
    centerZ = 0,
    columns,
    rotation = 0,
    rows
  } = options

  const network: RoadNetwork = { nodes: {}, segments: {} }

  // Street widths have to be known before positions, because a street occupies
  // real ground: laying nodes out on a naive `column * blockWidth` lattice puts
  // the carriageway *inside* the block and every building ends up in the road.
  const columnWidths: number[] = []
  for (let column = 0; column <= columns; column += 1) {
    const isArterial = arterialEvery > 0 && column % arterialEvery === 0
    columnWidths.push(widthFor(isArterial ? 'arterial' : 'street'))
  }
  const rowWidths: number[] = []
  for (let row = 0; row <= rows; row += 1) rowWidths.push(widthFor('street'))

  const xs: number[] = []
  let cursorX = 0
  for (let column = 0; column <= columns; column += 1) {
    cursorX += columnWidths[column]! / 2
    xs.push(cursorX)
    cursorX += columnWidths[column]! / 2 + blockWidth
  }

  const zs: number[] = []
  let cursorZ = 0
  for (let row = 0; row <= rows; row += 1) {
    cursorZ += rowWidths[row]! / 2
    zs.push(cursorZ)
    cursorZ += rowWidths[row]! / 2 + blockDepth
  }

  // Centre the lattice on the requested point rather than growing from a
  // corner, so a generated city sits where the author asked for it.
  const spanX = xs[xs.length - 1]! - xs[0]!
  const spanZ = zs[zs.length - 1]! - zs[0]!
  const originX = -spanX / 2
  const originZ = -spanZ / 2

  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const nodeId = (column: number, row: number) => `n_${column}_${row}`

  for (let column = 0; column <= columns; column += 1) {
    for (let row = 0; row <= rows; row += 1) {
      const localX = originX + (xs[column]! - xs[0]!)
      const localZ = originZ + (zs[row]! - zs[0]!)
      network.nodes[nodeId(column, row)] = {
        id: nodeId(column, row),
        x: centerX + localX * cos - localZ * sin,
        z: centerZ + localX * sin + localZ * cos
      }
    }
  }

  const push = (segment: RoadSegment) => {
    network.segments[segment.id] = segment
  }

  // Avenues run along z, cross streets along x. Both are split at every
  // crossing rather than run end to end, because a segment that passes through
  // an intersection cannot carry its own markings or be widened independently.
  for (let column = 0; column <= columns; column += 1) {
    const isArterial = arterialEvery > 0 && column % arterialEvery === 0
    const roadClass: RoadClass = isArterial ? 'arterial' : 'street'
    for (let row = 0; row < rows; row += 1) {
      push({
        ...ROAD_CLASS_DEFAULTS[roadClass],
        from: nodeId(column, row),
        id: `s_v_${column}_${row}`,
        roadClass,
        to: nodeId(column, row + 1)
      })
    }
  }

  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      push({
        ...ROAD_CLASS_DEFAULTS.street,
        from: nodeId(column, row),
        id: `s_h_${column}_${row}`,
        roadClass: 'street',
        to: nodeId(column + 1, row)
      })
    }
  }

  const blockCorners: string[][] = []
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      blockCorners.push([
        nodeId(column, row),
        nodeId(column + 1, row),
        nodeId(column + 1, row + 1),
        nodeId(column, row + 1)
      ])
    }
  }

  return { blockCorners, network }
}

function widthFor(roadClass: RoadClass): number {
  const defaults = ROAD_CLASS_DEFAULTS[roadClass]
  return defaults.width + defaults.sidewalkWidth * 2
}

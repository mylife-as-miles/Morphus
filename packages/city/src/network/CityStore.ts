/**
 * The editor's street network, as an external store.
 *
 * Same shape as `ForestFieldStore` and for the same reason: one immutable
 * snapshot per change, which is exactly what `useSyncExternalStore` wants, and
 * a dirty flag so the expensive rebuild is explicit rather than triggered on
 * every keystroke. Building a road mesh walks every segment in the network, so
 * it must not run on each edit of a single one.
 */

import {
  emptyRoadNetwork,
  type RoadClass,
  type RoadNetwork,
  type RoadSegment
} from './roadNetwork'
import { ROAD_CLASS_DEFAULTS } from './roadNetwork'

export interface CitySnapshot {
  network: RoadNetwork
  /** Set when the network changed and the mesh no longer matches it. */
  needsRebuild: boolean
  /** Bumped on every rebuild, so viewers can key off a generation. */
  generation: number
  /** Human-readable state for the status line. */
  status: string
  /** Corner node ids per block, from the last grid layout. */
  blockCorners: string[][]
}

type Listener = () => void

export class CityStore {
  private listeners = new Set<Listener>()

  private state: CitySnapshot = {
    blockCorners: [],
    generation: 0,
    needsRebuild: false,
    network: emptyRoadNetwork(),
    status: 'No streets yet'
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): CitySnapshot => this.state

  private emit(next: Partial<CitySnapshot>): void {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  /** Replaces the whole network, as a generated layout does. */
  setNetwork(network: RoadNetwork, blockCorners: string[][] = []): void {
    const segments = Object.keys(network.segments).length
    const nodes = Object.keys(network.nodes).length
    this.emit({
      blockCorners,
      needsRebuild: true,
      network,
      status: `${segments} streets, ${nodes} junctions`
    })
  }

  clear(): void {
    this.emit({
      blockCorners: [],
      needsRebuild: true,
      network: emptyRoadNetwork(),
      status: 'No streets yet'
    })
  }

  /**
   * An existing junction within `tolerance` metres, if there is one.
   *
   * Streets are authored by coordinate, not by node id, so two streets meant to
   * meet arrive with endpoints a fraction of a metre apart. Snapping them to
   * one junction is the difference between a connected network -- which blocks
   * and traffic both need -- and a pile of segments that merely look joined.
   */
  nodeNear(x: number, z: number, tolerance = 1): string | undefined {
    let bestId: string | undefined
    let bestDistance = tolerance
    for (const node of Object.values(this.state.network.nodes)) {
      const distance = Math.hypot(node.x - x, node.z - z)
      if (distance <= bestDistance) {
        bestDistance = distance
        bestId = node.id
      }
    }
    return bestId
  }

  /** Adds a junction at a point and returns its generated id. */
  createNode(x: number, z: number): string {
    const id = `n_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`
    this.addNode(id, x, z)
    return id
  }

  addNode(id: string, x: number, z: number): void {
    const network: RoadNetwork = {
      nodes: { ...this.state.network.nodes, [id]: { id, x, z } },
      segments: this.state.network.segments
    }
    this.emit({ needsRebuild: true, network })
  }

  /**
   * Joins two existing junctions.
   *
   * Refuses rather than inventing endpoints: a segment pointing at a node that
   * does not exist produces no geometry and no error, which is the kind of
   * silence that takes an hour to trace back to a typo in a tool call.
   */
  connect(
    id: string,
    from: string,
    to: string,
    options: { roadClass?: RoadClass; width?: number; sidewalkWidth?: number; lanes?: number } = {}
  ): boolean {
    if (!this.state.network.nodes[from] || !this.state.network.nodes[to]) return false

    const roadClass = options.roadClass ?? 'street'
    const segment: RoadSegment = {
      ...ROAD_CLASS_DEFAULTS[roadClass],
      ...options,
      from,
      id,
      roadClass,
      to
    }

    const network: RoadNetwork = {
      nodes: this.state.network.nodes,
      segments: { ...this.state.network.segments, [id]: segment }
    }
    this.emit({ needsRebuild: true, network })
    return true
  }

  patchSegment(id: string, values: Partial<RoadSegment>): boolean {
    const existing = this.state.network.segments[id]
    if (!existing) return false

    const network: RoadNetwork = {
      nodes: this.state.network.nodes,
      segments: { ...this.state.network.segments, [id]: { ...existing, ...values, id } }
    }
    this.emit({ needsRebuild: true, network })
    return true
  }

  /** Called by the viewport once it has rebuilt the mesh for this network. */
  markRebuilt(): void {
    this.emit({ generation: this.state.generation + 1, needsRebuild: false })
  }
}

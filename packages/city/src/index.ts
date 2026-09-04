/**
 * Procedural cities: street networks, the blocks between them, and what stands
 * on those blocks.
 *
 * The pipeline mirrors the forest package deliberately. A forest is a spline
 * field that places tree prototypes on terrain; a city is a street network that
 * places building prototypes on lots.
 *
 * The network, block, lot and massing stages are renderer-free and return typed
 * arrays, so they can move to a worker unchanged. The building grammar under
 * `buildings/vendor` is the exception: it builds `BufferGeometry` directly and
 * so has to run on the main thread. That is one reason only a few landmarks are
 * generated rather than a whole city of them -- see `buildingFromLot.ts` for
 * the measured cost.
 */

export * from './network/roadNetwork'
export * from './network/gridLayout'
export * from './network/CityStore'
export * from './geometry/threeRoads'
export * from './blocks/blockPolygons'
export * from './blocks/lots'
export * from './massing/massing'
export * from './buildings'

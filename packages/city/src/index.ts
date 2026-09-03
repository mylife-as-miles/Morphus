/**
 * Procedural cities: street networks, the blocks between them, and what stands
 * on those blocks.
 *
 * The pipeline mirrors the forest package deliberately. A forest is a spline
 * field that places tree prototypes on terrain; a city is a street network that
 * places building prototypes on lots. The generators are renderer-free, return
 * typed arrays, and are meant to be compiled in a worker and drawn instanced --
 * so the expensive parts already have a home.
 */

export * from './network/roadNetwork'
export * from './network/gridLayout'
export * from './network/CityStore'
export * from './geometry/roadMesh'
export * from './blocks/blockPolygons'
export * from './blocks/lots'
export * from './massing/massing'

/**
 * Constants shared between tree *generation* and tree *materials*.
 *
 * Upstream these live in `proceduralTreeTextures`, alongside the WebGPU texture
 * bakers. The wood UV compiler in `generator/woodMesher` needs the tile size,
 * and it has no business pulling a bark/leaf baking chain in to read one
 * number -- so the boundary constants sit here, and the material layer imports
 * them from here rather than declaring a second copy that could drift.
 */

/** World size of one bark tile, in metres. Shared with the wood UV compiler. */
export const BARK_TILE_METRES = 1.6;

/**
 * Alpha-test threshold the foliage material uses.
 *
 * The mip builder needs it to know which texels the shader will keep, so the
 * two must not drift apart.
 */
export const LEAF_ALPHA_TEST = 0.3;

/**
 * Prints the vertex colours a compiled tree actually carries.
 *
 * The forest renders white in the viewport even though `barkColor` generates
 * per-vertex colour and `optimizeTreeMesh` remaps it through simplification.
 * Rather than guess which stage flattens it, this runs the same compile the
 * viewport's worker runs and reports the buffers, so the answer comes from the
 * data instead of from reading the code.
 *
 * Run with `npx tsx scripts/probe-tree-colours.mts`.
 */

import {
  compileProceduralTree,
  parametersForTreeVariation,
  type TreeSpecies
} from "../packages/forest/src/index";

/** Min, max and mean of one channel, to tell "all white" from "all black". */
function channelStats(data: Float32Array, stride: number, offset: number) {
  if (data.length === 0) return { min: NaN, max: NaN, mean: NaN };
  let min = Infinity;
  let max = -Infinity;
  let total = 0;
  let count = 0;
  for (let i = offset; i < data.length; i += stride) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
    total += value;
    count += 1;
  }
  return { min, max, mean: total / count };
}

const round = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(3)) : n);

const species: TreeSpecies[] = ["european-beech" as TreeSpecies];

for (const name of species) {
  const parameters = parametersForTreeVariation(name, 0);
  const asset = compileProceduralTree(parameters);

  console.log(`\n=== ${name} variation 0 ===`);
  console.log(`LODs: ${asset.lods.length}`);

  asset.lods.forEach((lod, index) => {
    const wood = lod.wood;
    const foliage = lod.foliage;

    const woodColours = wood.colors as Float32Array | undefined;
    const foliageColours = foliage.colors as Float32Array | undefined;

    console.log(`\n  LOD ${index}`);
    console.log(
      `    wood: ${wood.positions.length / 3} verts, colours ${
        woodColours ? `${woodColours.length / 3} entries` : "ABSENT"
      }`
    );
    if (woodColours && woodColours.length) {
      const r = channelStats(woodColours, 3, 0);
      const g = channelStats(woodColours, 3, 1);
      const b = channelStats(woodColours, 3, 2);
      console.log(
        `      r ${round(r.min)}..${round(r.max)} mean ${round(r.mean)}  ` +
          `g ${round(g.min)}..${round(g.max)} mean ${round(g.mean)}  ` +
          `b ${round(b.min)}..${round(b.max)} mean ${round(b.mean)}`
      );
      console.log(`      first 4 verts: ${Array.from(woodColours.slice(0, 12)).map(round).join(", ")}`);
    }

    console.log(
      `    foliage: ${foliage.count} cards, colours ${
        foliageColours ? `${foliageColours.length / 3} entries` : "ABSENT"
      }`
    );
    if (foliageColours && foliageColours.length) {
      const r = channelStats(foliageColours, 3, 0);
      const g = channelStats(foliageColours, 3, 1);
      const b = channelStats(foliageColours, 3, 2);
      console.log(
        `      r ${round(r.min)}..${round(r.max)} mean ${round(r.mean)}  ` +
          `g ${round(g.min)}..${round(g.max)} mean ${round(g.mean)}  ` +
          `b ${round(b.min)}..${round(b.max)} mean ${round(b.mean)}`
      );
      console.log(`      first 4 cards: ${Array.from(foliageColours.slice(0, 12)).map(round).join(", ")}`);
    }
  });
}

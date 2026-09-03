"""Adds the block/lot/massing tools."""

import io
from pathlib import Path

DECL = Path("src/lib/copilot/tool-declarations.ts")
EXEC = Path("src/lib/copilot/tool-executor.ts")

decl = io.open(DECL, encoding="utf-8").read()
if "generate_city_massing" in decl:
    print("already added")
    raise SystemExit

TOOLS = '''  {
    name: "generate_city_massing",
    description:
      "Fills the street grid's blocks with building volumes. Divides each block into lots with street frontage, then extrudes each lot to a height, so buildings stand shoulder to shoulder along the street with a shared interior behind. This is the stage that decides a city's silhouette -- skyline, street wall, where the towers cluster -- and it renders as flat coloured boxes rather than finished facades. Requires a street network; run generate_street_grid first.",
    parameters: {
      type: "object",
      properties: {
        lotWidth: { type: "number", description: "Target street frontage per building in meters. Defaults to 18. Smaller reads as townhouses, larger as apartment blocks." },
        lotDepth: { type: "number", description: "How far back from the street a building reaches, in meters. Defaults to 24. Clamped so two rows on a shallow block cannot overlap." },
        minStoreys: { type: "number", description: "Fewest storeys for a building at the edge of the city. Defaults to 2." },
        maxStoreys: { type: "number", description: "Most storeys for a building at the centre. Defaults to 12." },
        storeyHeight: { type: "number", description: "Floor-to-floor height in meters. Defaults to 3.4." },
        centerX: { type: "number", description: "Where the tall buildings cluster, x in world meters. Defaults to 0." },
        centerZ: { type: "number", description: "Where the tall buildings cluster, z in world meters. Defaults to 0." },
        falloffRadius: { type: "number", description: "How far from the centre height falls off, in meters. Defaults to 400. Large values make the city uniformly tall." },
        setback: { type: "number", description: "Extra gap between the footway and the building line, in meters. 0 (default) is a dense downtown; larger values suburbanise it." },
        seed: { type: "number", description: "Seed for lot widths and heights. The same seed rebuilds the same city." }
      }
    }
  },
  {
    name: "clear_city_massing",
    description: "Removes every building volume, leaving the street network in place.",
    parameters: { type: "object", properties: {} }
  },
'''

ANCHOR = "  // -- Forests -------------------------------------------------------------"
assert ANCHOR in decl
decl = decl.replace(ANCHOR, TOOLS + ANCHOR, 1)
io.open(DECL, "w", encoding="utf-8", newline="").write(decl)

src = io.open(EXEC, encoding="utf-8").read()

CASES = '''    case "generate_city_massing": {
      const snapshot = cityStore.getSnapshot();
      if (Object.keys(snapshot.network.segments).length === 0) {
        return fail("There are no streets yet. Run generate_street_grid first.");
      }
      if (snapshot.blockCorners.length === 0) {
        return fail(
          "The network has no blocks recorded. Massing currently needs a grid from generate_street_grid."
        );
      }

      const blocks = buildBlockPolygons({
        blockCorners: snapshot.blockCorners,
        network: snapshot.network,
        setback: num(args, "setback", 0)
      });

      const seed = Math.round(num(args, "seed", 1));
      const lotWidth = num(args, "lotWidth", 18);
      const lotDepth = num(args, "lotDepth", 24);

      const lots = blocks.flatMap((block, index) =>
        subdivideBlock({
          blockId: block.id,
          lotDepth,
          lotWidth,
          polygon: block.points,
          // Offsetting per block keeps neighbouring blocks from receiving the
          // identical run of lot widths, which reads as a repeat at a glance.
          seed: seed + index * 7919
        })
      );

      if (lots.length === 0) {
        return fail("The blocks were too small to divide into lots. Try a smaller lotWidth.");
      }

      const volumes = buildMassing({
        centerX: num(args, "centerX", 0),
        centerZ: num(args, "centerZ", 0),
        falloffRadius: num(args, "falloffRadius", 400),
        lots,
        maxStoreys: Math.round(num(args, "maxStoreys", 12)),
        minStoreys: Math.round(num(args, "minStoreys", 2)),
        seed,
        storeyHeight: num(args, "storeyHeight", 3.4)
      });

      let tallest = 0;
      for (const volume of volumes) tallest = Math.max(tallest, volume.storeys);

      cityStore.setMassing(volumes, {
        blocks: blocks.length,
        lots: lots.length,
        tallestStoreys: tallest,
        volumes: volumes.length
      });

      return ok({
        blocks: blocks.length,
        buildings: volumes.length,
        note: "Massing volumes only -- facades, windows and roofs are not generated yet.",
        tallestStoreys: tallest
      });
    }

    case "clear_city_massing": {
      cityStore.clearMassing();
      return ok({ cleared: true });
    }

'''

EXEC_ANCHOR = '    case "create_forest_field": {'
assert EXEC_ANCHOR in src
src = src.replace(EXEC_ANCHOR, CASES + EXEC_ANCHOR, 1)

src = src.replace(
    'import { generateGridNetwork } from "@blud/city";',
    'import { buildBlockPolygons, buildMassing, generateGridNetwork, subdivideBlock } from "@blud/city";',
    1,
)

io.open(EXEC, "w", encoding="utf-8", newline="").write(src)
print("massing tools added")

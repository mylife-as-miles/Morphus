"""Adds the landmark-building tools."""

import io
from pathlib import Path


def sub(text: str, old: str, new: str, what: str) -> str:
    assert old in text, f"anchor missing: {what}"
    return text.replace(old, new, 1)


DECL = Path("src/lib/copilot/tool-declarations.ts")
EXEC = Path("src/lib/copilot/tool-executor.ts")

decl = io.open(DECL, encoding="utf-8").read()
if "generate_city_buildings" in decl:
    print("already added")
    raise SystemExit

TOOLS = '''  {
    name: "generate_city_buildings",
    description:
      "Replaces the tallest massing volumes with real buildings: limestone banks, setback towers and corner headquarters, with colonnades, windows, cornices and roof equipment. Only a few dozen are generated because each costs around 140,000 triangles, so they stand as landmarks among the massing boxes rather than replacing all of them -- which is what a downtown looks like anyway. Requires massing; run generate_city_massing first.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "How many landmarks to generate, tallest lots first. Defaults to 12. Above about 40 the viewport slows noticeably." },
        coverage: { type: "number", description: "Fraction of lots to build instead of a fixed count, 0 to 1. Whichever of this and `count` is smaller wins. Defaults to 0.08." },
        seed: { type: "number", description: "Seed for materials and proportions. The same seed rebuilds the same buildings." }
      }
    }
  },
  {
    name: "clear_city_buildings",
    description: "Removes the generated landmark buildings. The massing boxes they replaced come back, and streets are untouched.",
    parameters: { type: "object", properties: {} }
  },
'''

decl = sub(decl, "  // -- Forests ---", TOOLS + "  // -- Forests ---", "forest section")
io.open(DECL, "w", encoding="utf-8", newline="").write(decl)

src = io.open(EXEC, encoding="utf-8").read()

CASES = '''    case "generate_city_buildings": {
      const snapshot = cityStore.getSnapshot();
      if (snapshot.massing.length === 0) {
        return fail("There are no massing volumes yet. Run generate_city_massing first.");
      }
      if (snapshot.blockCorners.length === 0) {
        return fail("The network has no blocks recorded. Run generate_street_grid first.");
      }

      // The lots are rebuilt rather than stored, because massing keeps only the
      // volumes and a building needs its lot's frontage and facing to sit on
      // the street. Same inputs and same seeds, so the same lots come back.
      const blocks = buildBlockPolygons({
        blockCorners: snapshot.blockCorners,
        network: snapshot.network
      });
      const seed = Math.round(num(args, "seed", 1));
      const lots = blocks.flatMap((block, index) =>
        subdivideBlock({
          blockId: block.id,
          polygon: block.points,
          seed: seed + index * 7919
        })
      );

      const count = Math.max(0, Math.round(num(args, "count", 12)));
      // Each building is real geometry generated on the main thread at roughly
      // 300ms, so an unbounded count is a frozen tab rather than a big city.
      if (count > 60) {
        return fail(`${count} buildings is too many; keep it at 60 or fewer.`);
      }

      const buildings = buildBuildings({
        coverage: num(args, "coverage", 0.08),
        lots,
        maxBuildings: count,
        seed,
        volumes: snapshot.massing
      });

      if (buildings.length === 0) {
        return fail(
          "No lot was large enough for a building. Try a larger lotWidth in generate_city_massing."
        );
      }

      cityStore.setBuildings(buildings);

      let triangles = 0;
      const variants: Record<string, number> = {};
      for (const building of buildings) {
        triangles += building.generated.triangleCount;
        variants[building.variant] = (variants[building.variant] ?? 0) + 1;
      }

      return ok({
        buildings: buildings.length,
        massingRemaining: snapshot.massing.length - buildings.length,
        note: "Landmarks only. The rest of the city is still massing volumes.",
        triangles,
        variants
      });
    }

    case "clear_city_buildings": {
      cityStore.clearBuildings();
      return ok({ cleared: true });
    }

'''

src = sub(src, '    case "create_forest_field": {', CASES + '    case "create_forest_field": {', "executor anchor")

src = sub(
    src,
    "import { buildBlockPolygons, buildMassing, generateGridNetwork, subdivideBlock } from \"@blud/city\";",
    "import {\n"
    "  buildBlockPolygons,\n"
    "  buildBuildings,\n"
    "  buildMassing,\n"
    "  generateGridNetwork,\n"
    "  subdivideBlock\n"
    "} from \"@blud/city\";",
    "city imports",
)

io.open(EXEC, "w", encoding="utf-8", newline="").write(src)
print("building tools added")

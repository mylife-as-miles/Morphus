"""Adds the first street-network tools to the Copilot surface."""

import io
from pathlib import Path

DECL = Path("src/lib/copilot/tool-declarations.ts")
EXEC = Path("src/lib/copilot/tool-executor.ts")

decl = io.open(DECL, encoding="utf-8").read()
if "generate_street_grid" in decl:
    print("already added")
    raise SystemExit

TOOLS = '''  // -- Cities --------------------------------------------------------------
  {
    name: "generate_street_grid",
    description:
      "Lays out a street grid: avenues, cross streets, junctions, kerbs and footways, conformed to the terrain. This is the ground a city stands on -- blocks and buildings are derived from it, so run this before either. Block proportion matters more than block size; the default 80m by 275m is roughly Manhattan, and long thin blocks are most of what makes a grid read as a city rather than as graph paper. Replaces any existing network.",
    parameters: {
      type: "object",
      properties: {
        columns: { type: "number", description: "Blocks along x. 4 to 12 is a neighbourhood; above 20 gets heavy." },
        rows: { type: "number", description: "Blocks along z." },
        blockWidth: { type: "number", description: "Block interior width in meters, across the short side. Defaults to 80." },
        blockDepth: { type: "number", description: "Block interior depth in meters, along the long side. Defaults to 275." },
        centerX: { type: "number", description: "Grid centre x in world meters. Defaults to 0." },
        centerZ: { type: "number", description: "Grid centre z in world meters. Defaults to 0." },
        arterialEvery: { type: "number", description: "Every nth avenue is a wide arterial. Defaults to 4; 0 makes every street the same width, which reads flatter." },
        rotation: { type: "number", description: "Rotation of the whole grid in degrees, so it need not align to the world axes." }
      },
      required: ["columns", "rows"]
    }
  },
  {
    name: "get_street_network",
    description:
      "Reports the street network: how many junctions and segments exist, the bounding extent, and a sample of segments with their widths and classes. Call before editing so changes are made against what is actually there.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "add_street",
    description:
      "Joins two junctions with a new street, creating either junction if it does not exist yet. Use it to extend a generated grid, cut a diagonal avenue across it, or build a network by hand. The road class sets width and footways unless overridden.",
    parameters: {
      type: "object",
      properties: {
        fromX: { type: "number", description: "Start junction x in world meters." },
        fromZ: { type: "number", description: "Start junction z in world meters." },
        toX: { type: "number", description: "End junction x in world meters." },
        toZ: { type: "number", description: "End junction z in world meters." },
        roadClass: { type: "string", enum: ["arterial", "street", "alley"], description: "arterial is a wide multi-lane avenue, street is the ordinary case, alley is narrow with no footways. Defaults to street." },
        width: { type: "number", description: "Carriageway width in meters, kerb to kerb, overriding the class default." },
        sidewalkWidth: { type: "number", description: "Footway width in meters per side. 0 removes footways." }
      },
      required: ["fromX", "fromZ", "toX", "toZ"]
    }
  },
  {
    name: "clear_street_network",
    description: "Removes every street and junction. The terrain and everything else in the scene are untouched.",
    parameters: { type: "object", properties: {} }
  },
'''

ANCHOR = "  // -- Forests -------------------------------------------------------------"
assert ANCHOR in decl, "forest section anchor missing"
decl = decl.replace(ANCHOR, TOOLS + ANCHOR, 1)
io.open(DECL, "w", encoding="utf-8", newline="").write(decl)

# ---- executor ------------------------------------------------------------
src = io.open(EXEC, encoding="utf-8").read()

CASES = '''    case "generate_street_grid": {
      const columns = Math.round(num(args, "columns", 6));
      const rows = Math.round(num(args, "rows", 4));
      if (columns < 1 || rows < 1) return fail("columns and rows must both be at least 1.");
      // A 40x40 grid is 3,200 segments and several million triangles of flat
      // grey ground. Refusing is kinder than building it and hanging the tab.
      if (columns * rows > 400) {
        return fail(`${columns} by ${rows} is ${columns * rows} blocks; keep it under 400.`);
      }

      const { blockCorners, network } = generateGridNetwork({
        arterialEvery: Math.max(0, Math.round(num(args, "arterialEvery", 4))),
        blockDepth: num(args, "blockDepth", 275),
        blockWidth: num(args, "blockWidth", 80),
        centerX: num(args, "centerX", 0),
        centerZ: num(args, "centerZ", 0),
        columns,
        rotation: (num(args, "rotation", 0) * Math.PI) / 180,
        rows
      });

      cityStore.setNetwork(network, blockCorners);

      return ok({
        blocks: blockCorners.length,
        junctions: Object.keys(network.nodes).length,
        note: "Streets are laid. Blocks and buildings are not generated yet.",
        segments: Object.keys(network.segments).length
      });
    }

    case "get_street_network": {
      const { network } = cityStore.getSnapshot();
      const segments = Object.values(network.segments);
      const nodes = Object.values(network.nodes);
      if (nodes.length === 0) return ok({ junctions: 0, segments: 0, status: "No streets yet." });

      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const node of nodes) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minZ = Math.min(minZ, node.z);
        maxZ = Math.max(maxZ, node.z);
      }

      return ok({
        extentMeters: {
          maxX: Math.round(maxX),
          maxZ: Math.round(maxZ),
          minX: Math.round(minX),
          minZ: Math.round(minZ)
        },
        junctions: nodes.length,
        sample: segments.slice(0, 8).map((segment) => ({
          id: segment.id,
          roadClass: segment.roadClass,
          sidewalkWidth: segment.sidewalkWidth,
          width: segment.width
        })),
        segments: segments.length
      });
    }

    case "add_street": {
      const fromX = num(args, "fromX", 0);
      const fromZ = num(args, "fromZ", 0);
      const toX = num(args, "toX", 0);
      const toZ = num(args, "toZ", 0);
      if (fromX === toX && fromZ === toZ) return fail("A street needs two different endpoints.");

      const roadClass = str(args, "roadClass", "street");
      if (roadClass !== "arterial" && roadClass !== "street" && roadClass !== "alley") {
        return fail("roadClass must be arterial, street or alley.");
      }

      // Endpoints are given as coordinates rather than ids because that is how
      // an agent thinks about a map. Reusing a junction within a metre keeps a
      // hand-built network connected instead of leaving two nodes a hair apart.
      const fromId = cityStore.nodeNear(fromX, fromZ) ?? cityStore.createNode(fromX, fromZ);
      const toId = cityStore.nodeNear(toX, toZ) ?? cityStore.createNode(toX, toZ);

      const overrides: { width?: number; sidewalkWidth?: number } = {};
      const width = optionalNum(args, "width");
      if (width !== undefined) overrides.width = width;
      const sidewalkWidth = optionalNum(args, "sidewalkWidth");
      if (sidewalkWidth !== undefined) overrides.sidewalkWidth = sidewalkWidth;

      const id = `s_${Date.now().toString(36)}`;
      if (!cityStore.connect(id, fromId, toId, { roadClass, ...overrides })) {
        return fail("Could not connect those junctions.");
      }

      return ok({ from: fromId, roadClass, segmentId: id, to: toId });
    }

    case "clear_street_network": {
      cityStore.clear();
      return ok({ cleared: true });
    }

'''

EXEC_ANCHOR = '    case "create_forest_field": {'
assert EXEC_ANCHOR in src, "executor anchor missing"
src = src.replace(EXEC_ANCHOR, CASES + EXEC_ANCHOR, 1)

# Imports.
IMPORT_ANCHOR = 'import { forestStore } from "@/state/forest-store";'
assert IMPORT_ANCHOR in src, "forest store import missing"
src = src.replace(
    IMPORT_ANCHOR,
    'import { generateGridNetwork } from "@blud/city";\n'
    'import { cityStore } from "@/state/city-store";\n' + IMPORT_ANCHOR,
    1,
)

io.open(EXEC, "w", encoding="utf-8", newline="").write(src)
print("city tools added")

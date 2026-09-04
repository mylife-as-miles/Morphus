"""Brings the README up to date with the city pipeline and the real tool count.

Three kinds of rot: counts that predate the full-surface change and the city
tools, a whole section describing the Morphus workspace that was deleted, and a
source map pointing at files that no longer exist.
"""

import io
import re
from pathlib import Path


def sub(text: str, old: str, new: str, what: str) -> str:
    assert old in text, f"anchor missing: {what}"
    return text.replace(old, new, 1)


P = Path("README.md")
s = io.open(P, encoding="utf-8").read()

# ---- 1. Tool counts -------------------------------------------------------
s = sub(
    s,
    "Morphus registers all 145 of the editor's own tools with the browser via",
    "Morphus registers all 154 of the editor's own tools with the browser via",
    "intro count",
)
s = sub(
    s,
    "The editor already described everything it can do to its own Copilot -- 145",
    "The editor already described everything it can do to its own Copilot -- 154",
    "copilot count",
)
s = sub(
    s,
    "**All 145, ordered.** An earlier version exposed a curated twenty, on the",
    "**All 154, ordered.** An earlier version exposed a curated twenty, on the",
    "ordered heading",
)
s = sub(
    s,
    "the editor's real capability *is* the 145, and an agent that cannot inset a",
    "the editor's real capability *is* the 154, and an agent that cannot inset a",
    "capability line",
)
s = sub(
    s,
    "hand-kept set of 25 beside 145 declarations goes stale the first time someone",
    "hand-kept set of 25 beside 154 declarations goes stale the first time someone",
    "stale-set line",
)
s = sub(
    s,
    "await window.__webmcp.list();                    // all 145 registered names",
    "await window.__webmcp.list();                    // all 154 registered names",
    "stub example",
)

# ---- 2. A section for the city pipeline ----------------------------------
CITY = """## Procedural cities

A city is generated in four passes, each its own tool, because each decides
something the next one needs and an author will want to stop between them.

| Pass | Tool | What it decides |
| --- | --- | --- |
| Streets | `generate_street_grid` | Avenues, cross streets, junctions, kerbs and footways, conformed to terrain |
| Blocks and lots | `generate_city_massing` | The buildable ground between streets, divided into lots that front them |
| Massing | *(same call)* | The skyline, as flat coloured volumes |
| Facades | `generate_city_buildings` | Real architecture on the lots that earn it |

The pipeline deliberately mirrors `@blud/forest`. A forest is a spline field
that places tree prototypes on terrain; a city is a street network that places
building prototypes on lots. The expensive machinery is the same either way.

**Streets are meshed by [`three-roads`](https://github.com/vibe-stack/three-roads)**,
an OpenDRIVE-style model with real lanes, kerb returns and paint. The two
representations disagree about topology, which is what `geometry/threeRoads.ts`
exists to reconcile: this repository stores one segment per block edge, because
blocks and lots need that identity, while three-roads only produces a proper
intersection when the uninterrupted avenue arrives as a single stroke.

**Buildings come from [`procedural-bank`](https://github.com/vibe-stack/procedural-bank)**,
vendored under `packages/city/src/buildings/vendor` because upstream is an
application with nothing published. Only a few dozen are generated, and that is
measured rather than timid: about 142,000 triangles per building, of which
turning off every ornament, colonnade and crown saves 17%. Building a whole grid
would be tens of millions of triangles and minutes of blocking work, so
landmarks stand among massing boxes instead. Its vocabulary is limestone banks
and setback towers, with no brownstones or tenements, which is the other reason
the periphery stays as massing.

**Everything placed on the ground resolves its height through
`src/viewport/ground-height.ts`.** The viewport draws two different terrains
depending on renderer backend and they differ by about thirty metres, so a
system that samples its own answer eventually places itself underground and
reports success. One function means forests, streets and buildings can only ever
be wrong together.

## LAAS Procedural Worlds"""

s = sub(s, "## LAAS Procedural Worlds", CITY, "city section")

# ---- 3. Tool surface table ------------------------------------------------
OLD_SURFACE = """In the submitted editor slice, Dream Studio exposes `112` AI tools.

| Tool group | Count | Purpose |
| --- | ---: | --- |
| Copilot editor tools | 104 | Live 3D scene authoring, inspection, mesh editing, gameplay, behavior, surfaces, screenshots |
| Morphus game tools | 8 | Standalone game registration and file workspace operations |
"""
NEW_SURFACE = """Dream Studio exposes `154` AI tools. Every one of them is registered with the
browser over WebMCP by the same declarations, so the agent surface and the
in-app Copilot's surface are the same list by construction.

| Tool group | Count | Purpose |
| --- | ---: | --- |
| Scene authoring and inspection | 145 | Terrain, forests, meshes, primitives, materials, gameplay, behaviour, surfaces, screenshots |
| Procedural cities | 9 | Street networks, crosswalks, block massing, landmark buildings |

`node scripts/webmcp-budget.mjs` reports the live count and fails if any name,
description or parameter is over Chrome's budgets.
"""
s = sub(s, OLD_SURFACE, NEW_SURFACE, "tool surface")

# ---- 4. The deleted Morphus workspace ------------------------------------
OLD_WORKSPACES = "The editor has two AI workspaces.\n\n### Copilot\n\n"
s = sub(s, OLD_WORKSPACES, "### Copilot\n\n", "workspace preamble")

# Drop the whole `### Morphus` block, which describes a workspace that no
# longer exists in this repository.
s = re.sub(r"\n### Morphus\n.*?(?=\n## Gemma 4 architecture)", "\n", s, flags=re.S)

# Copilot's own capability list predates the city work.
s = sub(
    s,
    "- Push authored scenes into connected game projects when sync is configured.",
    "- Lay street networks, divide blocks into lots, raise massing, and generate landmark buildings.\n"
    "- Push authored scenes into connected game projects when sync is configured.",
    "copilot bullet",
)

# ---- 5. Source map rows pointing at deleted files -------------------------
s = sub(
    s,
    "| Morphus UI | `src/components/editor-shell/MorphusWorkspace.tsx` |\n"
    "| Morphus memory | `src/lib/copilot/morphus-memory.ts` |\n",
    "| WebMCP bridge | `src/lib/webmcp/tools.ts`, `src/lib/webmcp/useWebMcp.ts`, `src/lib/webmcp/stub.ts` |\n"
    "| City pipeline | `packages/city/src/` |\n"
    "| Ground height | `src/viewport/ground-height.ts` |\n",
    "source map rows",
)

s = sub(
    s,
    "| Game-code memory | `src/components/morphus-rag/RagIngestionUI.tsx`, `api/rag/upsert-game-code.ts`, `../../src/rag` |\n",
    "| Game-code memory | `api/rag/upsert-game-code.ts`, `src/rag` |\n",
    "source map rag row",
)

# ---- 6. Game-code memory section -----------------------------------------
OLD_RAG = "- `src/components/morphus-rag/RagIngestionUI.tsx` exposes the admin ingestion UI.\n"
s = sub(s, OLD_RAG, "", "rag ui bullet")

s = sub(
    s,
    "This subsystem is currently best described as an admin/dev memory pipeline. The next planned step is exposing retrieval as a first-class Morphus tool so Gemma 4 can autonomously search examples before generating or debugging games.",
    "This subsystem is currently best described as an admin/dev memory pipeline. The next planned step is exposing retrieval as a first-class Copilot tool, so the model can search examples before generating or debugging.",
    "rag closing",
)

# ---- 7. Tech stack --------------------------------------------------------
s = sub(
    s,
    "- Custom `@blud/*` editor, geometry, runtime, render, shared, and worker packages",
    "- `@three-roads/core` and `@three-roads/mesher` for road geometry\n"
    "- `procedural-bank` shape grammar, vendored, for landmark buildings\n"
    "- Custom `@blud/*` editor, city, forest, terrain, geometry, runtime, render, shared, and worker packages",
    "tech stack",
)

# ---- 8. Licence attribution ----------------------------------------------
s = sub(
    s,
    "## Licence\n\nMIT -- see [LICENSE](LICENSE).",
    "## Licence\n\nMIT -- see [LICENSE](LICENSE).\n\n"
    "Third-party code, both MIT:\n\n"
    "- [`three-roads`](https://github.com/vibe-stack/three-roads), an npm dependency.\n"
    "- [`procedural-bank`](https://github.com/vibe-stack/procedural-bank), vendored\n"
    "  unmodified under `packages/city/src/buildings/vendor` with its licence alongside.",
    "licence",
)

io.open(P, "w", encoding="utf-8", newline="").write(s)

# Report anything still pointing at a file that is gone.
missing = []
for link in re.findall(r"`([a-zA-Z0-9_./-]+\.(?:ts|tsx|mjs|md|json))`", s):
    if link.startswith(("../", "http")):
        continue
    if not Path(link).exists():
        missing.append(link)

print("README updated.")
if missing:
    print(f"  {len(missing)} referenced path(s) not found:")
    for path in sorted(set(missing)):
        print(f"    {path}")
else:
    print("  every referenced source path exists")

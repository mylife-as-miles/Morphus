"""Updates the README now that the whole tool surface is bridged."""

import io
from pathlib import Path

P = Path("README.md")
s = io.open(P, encoding="utf-8").read()
before = s

s = s.replace(
    "Morphus registers 20 of the editor's own tools with the browser via",
    "Morphus registers all 145 of the editor's own tools with the browser via",
    1,
)

# The old section argued for curation. The tradeoff is real, so the replacement
# states what changed and why rather than quietly deleting the argument.
OLD = """**Twenty tools, not 145.** A tool list is a prompt. Every entry spends the
agent's attention, and putting `offset_brush_face` beside `create_mesh_terrain`
makes the capabilities that matter harder to find. The twenty are chosen to
answer one question well -- *can a person and an agent build a 3D world
together?* -- and the list leads with read tools (`list_nodes`,
`get_terrain_state`, `capture_viewport_screenshot`) so an agent can act on what
is actually in the scene rather than on what it assumed."""

NEW = """**All 145, ordered.** An earlier version exposed a curated twenty, on the
theory that a tool list is a prompt and every entry spends the agent's
attention. That holds for a short catalogue, but it cuts the other way here:
the editor's real capability *is* the 145, and an agent that cannot inset a
face or rebuild a navmesh is operating a demo of the editor rather than the
editor. Curation became the agent's job, so the bridge does two things to make
that job possible -- it leads the list with the read and world-building tools
(`list_nodes`, `get_terrain_state`, `create_mesh_terrain`) because agents read
a catalogue top-down, and it annotates every entry so read-only tools are
callable speculatively and mutations are not.

Read-only is derived from the tool name rather than hand-listed, because a
hand-kept set of 25 beside 145 declarations goes stale the first time someone
adds a `get_`. The one tool whose name lies about what it does
(`capture_mesh_modeling_base` writes a modelling stack) is named as an
exception in the source."""

assert OLD in s, "curation section not found"
s = s.replace(OLD, NEW, 1)

s = s.replace(
    "await window.__webmcp.list();                    // the 20 registered names",
    "await window.__webmcp.list();                    // all 145 registered names",
    1,
)

# The budget section named two overrides; there are three now, plus aliases.
s = s.replace(
    """description, 150 per parameter, 1.5K per result. Two descriptions ran over and
are replaced with purpose-written text rather than truncated""",
    """description, 150 per parameter, 30 per name, 1.5K per result. Three
descriptions ran over and are replaced with purpose-written text rather than
truncated""",
    1,
)

assert s != before, "no changes applied"
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("README updated for the full tool surface.")

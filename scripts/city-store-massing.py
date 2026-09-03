"""Adds massing state to the city store."""

import io
from pathlib import Path

P = Path("packages/city/src/network/CityStore.ts")
s = io.open(P, encoding="utf-8").read()

if "setMassing" in s:
    print("already applied")
    raise SystemExit

s = s.replace(
    "import {\n  emptyRoadNetwork,",
    "import type { MassingVolume } from '../massing/massing'\nimport {\n  emptyRoadNetwork,",
    1,
)

# Seed the new fields in the initial state.
OLD_STATE = """  private state: CitySnapshot = {
    blockCorners: [],
    generation: 0,
    needsRebuild: false,
    network: emptyRoadNetwork(),
    status: 'No streets yet'
  }"""
NEW_STATE = """  private state: CitySnapshot = {
    blockCorners: [],
    generation: 0,
    massing: [],
    needsRebuild: false,
    network: emptyRoadNetwork(),
    status: 'No streets yet'
  }"""
assert OLD_STATE in s, "initial state anchor missing"
s = s.replace(OLD_STATE, NEW_STATE, 1)

# A new network invalidates massing derived from the old one.
OLD_SET = """    this.emit({
      blockCorners,
      needsRebuild: true,
      network,
      status: `${segments} streets, ${nodes} junctions`
    })"""
NEW_SET = """    // Massing is derived from the blocks this network encloses, so a new
    // network makes the old volumes wrong rather than stale. Keeping them would
    // leave buildings standing in the middle of the new streets.
    this.emit({
      blockCorners,
      massing: [],
      massingSummary: undefined,
      needsRebuild: true,
      network,
      status: `${segments} streets, ${nodes} junctions`
    })"""
assert OLD_SET in s, "setNetwork anchor missing"
s = s.replace(OLD_SET, NEW_SET, 1)

OLD_CLEAR = """    this.emit({
      blockCorners: [],
      needsRebuild: true,
      network: emptyRoadNetwork(),
      status: 'No streets yet'
    })"""
NEW_CLEAR = """    this.emit({
      blockCorners: [],
      massing: [],
      massingSummary: undefined,
      needsRebuild: true,
      network: emptyRoadNetwork(),
      status: 'No streets yet'
    })"""
assert OLD_CLEAR in s, "clear anchor missing"
s = s.replace(OLD_CLEAR, NEW_CLEAR, 1)

# The setter.
ANCHOR = "  /** Called by the viewport once it has rebuilt the mesh for this network. */"
SETTER = """  /** Replaces the building volumes, as a massing run does. */
  setMassing(massing: MassingVolume[], summary: CitySnapshot['massingSummary']): void {
    const tallest = summary?.tallestStoreys ?? 0
    this.emit({
      massing,
      massingSummary: summary,
      needsRebuild: true,
      status: `${massing.length} buildings, tallest ${tallest} storeys`
    })
  }

  clearMassing(): void {
    this.emit({ massing: [], massingSummary: undefined, needsRebuild: true })
  }

"""
assert ANCHOR in s, "markRebuilt anchor missing"
s = s.replace(ANCHOR, SETTER + ANCHOR, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("city store massing added")

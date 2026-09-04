"""Adds generated-building state to the city store."""

import io
from pathlib import Path


def sub(text: str, old: str, new: str, what: str) -> str:
    assert old in text, f"anchor missing: {what}"
    return text.replace(old, new, 1)


P = Path("packages/city/src/network/CityStore.ts")
s = io.open(P, encoding="utf-8").read()

if "setBuildings" in s:
    print("already applied")
    raise SystemExit

s = sub(
    s,
    "import type { MassingVolume } from '../massing/massing'",
    "import type { MassingVolume } from '../massing/massing'\n"
    "import type { BuildingInstance } from '../buildings/buildingFromLot'",
    "massing import",
)

s = sub(
    s,
    "  /** How the massing was last built, for reporting and for re-running it. */",
    """  /**
   * Generated landmark buildings, empty until the facade pass has run.
   *
   * A subset of `massing`, never all of it: the grammar costs about 140k
   * triangles per building, so a few dozen stand among the boxes rather than
   * replacing them. `builtLotIds` is what the massing layer reads to stop
   * drawing a box where a real building now stands.
   */
  buildings: BuildingInstance[]
  builtLotIds: ReadonlySet<string>
  /** How the massing was last built, for reporting and for re-running it. */""",
    "snapshot fields",
)

s = sub(
    s,
    """  private state: CitySnapshot = {
    blockCorners: [],
    crosswalks: [],""",
    """  private state: CitySnapshot = {
    blockCorners: [],
    buildings: [],
    builtLotIds: new Set<string>(),
    crosswalks: [],""",
    "initial state",
)

# Buildings derive from massing, which derives from the network, so both
# upstream changes invalidate them.
s = sub(
    s,
    """      blockCorners,
      crosswalks: [],
      massing: [],""",
    """      blockCorners,
      buildings: [],
      builtLotIds: new Set<string>(),
      crosswalks: [],
      massing: [],""",
    "setNetwork invalidation",
)

s = sub(
    s,
    """      blockCorners: [],
      crosswalks: [],
      massing: [],""",
    """      blockCorners: [],
      buildings: [],
      builtLotIds: new Set<string>(),
      crosswalks: [],
      massing: [],""",
    "clear invalidation",
)

s = sub(
    s,
    "  clearMassing(): void {\n    this.emit({ massing: [], massingSummary: undefined, needsRebuild: true })\n  }",
    """  clearMassing(): void {
    this.emit({
      buildings: [],
      builtLotIds: new Set<string>(),
      massing: [],
      massingSummary: undefined,
      needsRebuild: true
    })
  }

  /** Replaces the generated landmarks, as a facade run does. */
  setBuildings(buildings: BuildingInstance[]): void {
    this.emit({
      buildings,
      builtLotIds: new Set(buildings.map((building) => building.lotId)),
      needsRebuild: true,
      status: `${buildings.length} buildings among ${this.state.massing.length} volumes`
    })
  }

  clearBuildings(): void {
    this.emit({ buildings: [], builtLotIds: new Set<string>(), needsRebuild: true })
  }""",
    "clearMassing",
)

# A massing re-run replaces the volumes the landmarks were generated from.
s = sub(
    s,
    """    this.emit({
      massing,
      massingSummary: summary,""",
    """    // New massing means the landmarks generated from the old volumes now stand
    // on lots that may no longer exist, so they go with it.
    this.emit({
      buildings: [],
      builtLotIds: new Set<string>(),
      massing,
      massingSummary: summary,""",
    "setMassing invalidation",
)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("city store buildings added")

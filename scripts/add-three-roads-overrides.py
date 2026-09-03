"""Rewrites three-roads' unresolvable workspace: dependency specs.

`@three-roads/mesher` and `@three-roads/dressing` are published to npm with
`workspace:*` in their dependencies, a protocol npm cannot resolve, so a plain
install of either fails with EUNSUPPORTEDPROTOCOL. That is an upstream
packaging bug rather than anything about this project.

An npm `overrides` entry replaces those specs with the real published versions.
It keeps the packages as ordinary dependencies -- upgradeable, lockfile-tracked,
and removable the moment upstream republishes -- which vendoring their source
would not.
"""

import io
from pathlib import Path

P = Path("package.json")
s = io.open(P, encoding="utf-8").read()

if '"overrides"' in s:
    print("overrides already present")
    raise SystemExit

BLOCK = '''  "overrides": {
    "@three-roads/mesher": {
      "@three-roads/core": "0.1.0",
      "@three-roads/cdt": "0.1.0"
    },
    "@three-roads/dressing": {
      "@three-roads/core": "0.1.0"
    }
  },
'''

ANCHOR = '  "dependencies": {'
assert ANCHOR in s, "dependencies anchor missing"
s = s.replace(ANCHOR, BLOCK + ANCHOR, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("overrides added")

# Vendored: procedural-bank

The shape-grammar building generator from
[vibe-stack/procedural-bank](https://github.com/vibe-stack/procedural-bank),
MIT licensed (see `LICENSE` alongside this file). Copied at the `grammar/` and
`kit/` directories, unmodified.

## Why vendored rather than depended on

Upstream is an application, not a library: it has no package entry point and is
not published to npm. There is nothing to install.

Vendoring is unusually safe here. `grammar/` and `kit/` reach outside themselves
for exactly one thing -- `three/webgpu` -- and use exactly two symbols from it,
`BufferGeometry` and `Float32BufferAttribute`, both of which have been stable
for many releases. Upstream targets three 0.184 and this project is on 0.185,
and that gap touches nothing here. No app state, no React, no renderer setup.

## What it generates

Early-twentieth-century American commercial architecture: limestone banks,
zoning-setback towers, corner headquarters. Three building variants
(`classic-bank`, `setback-tower`, `corner-hq`), three masonry materials, and
six footprint styles including L, T, U and courtyard blocks.

That range is narrower than a whole city needs -- it has no brownstones, no
tenements, no warehouses -- so it is driven here as the *downtown* vocabulary
rather than as the only one. `buildingFromLot.ts` is where that choice is made.

## Dimensions worth knowing

`BAY_WIDTH` is 3.2m and `FLOOR_HEIGHT` is 3.35m (podium floors are 4.45m), so a
lot's frontage and depth convert to bay counts by division, and the massing
pass's storey count maps straight onto `floors`.

## Local changes

None. Keeping it byte-identical means a later upstream fix can be re-copied
rather than merged. Anything Morphus-specific belongs in the adapter one
directory up.

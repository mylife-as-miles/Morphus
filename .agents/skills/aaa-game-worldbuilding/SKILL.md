---
name: aaa-game-worldbuilding
description: >
  Create, evaluate, refine, and optimize ambitious AAA-style 3D game worlds
  and levels in Dream Studio using procedural terrain, vegetation, lighting,
  atmosphere, water, motion, post-processing, gameplay, visual verification,
  and performance tools. Use for UE5-class, cinematic, open-world, realistic,
  highly detailed, next-generation, showcase-quality, large-scale, forest,
  mountain, river, biome, environment-art, level-design, and AAA game requests.
license: MIT
compatibility: Requires Dream Studio editor tools. Advanced procedural worlds require WebGPU.
metadata:
  priority: high
  modes:
    - copilot
  capabilities:
    - procedural-world
    - environment-art
    - level-design
    - visual-verification
    - gameplay
    - optimization
---

# AAA Game Worldbuilding

## Activation

Use this skill for ambitious game worlds, environment-art work, cinematic or
high-fidelity levels, and explicitly requested AAA or UE5-class visual targets.
Do not activate it for isolated micro-edits such as moving a cube, recoloring a
wall, or listing scene data. "UE5-class" is a visual target for Dream Studio's
browser/WebGPU implementation, never a guarantee of Unreal Engine parity.

## Quality pillars

1. Build readable geometry and silhouettes, not flat texture-only illusion.
2. Preserve skylight, bounce, and environmental color in shadows. Do not use
   darkness or fog to hide unfinished work.
3. Dress every surface class intentionally: terrain, stream margins, tree
   bases, roads, ruins, snow transitions, and distant terrain.
4. Make distance, composition, landmarks, color, and motion serve gameplay.
5. Retain the world identity when optimizing; reduce targeted costs first.

## Discovery and production sequence

1. Infer genre, player fantasy, traversal, scale, route, landmarks, quality
   target, and whether this is a greybox, slice, or showcase. Choose useful
   defaults instead of asking avoidable questions.
2. Inspect cheaply first: scene settings, nodes, procedural world, performance,
   entities, and paths as relevant. Reuse returned IDs.
3. Compose the route, foreground, midground subject, horizon landmark, biome
   regions, water flow, spawn, and showcase bookmark before detail.
4. Use a procedural world for natural foundations when WebGPU is available;
   use authored scene tools for settlements, roads, ruins, interiors, props,
   gameplay spaces, and hand-made landmarks.
5. Build continuous traversal, a valid spawn, readable sightlines, crossings,
   collision, and intentional points of interest.
6. Dress, light, grade, and add restrained wind, water, cloud, or particle
   motion. Use the selected quality preset deliberately.
7. Capture a viewport screenshot, compare it to the quality pillars, fix the
   three largest deltas, then capture again before declaring completion.
8. Inspect performance before increasing density and tune resolution, range,
   density, or samples without deleting whole systems as a first response.

## Tool rules

- Inspect an existing procedural world before editing it. Create one only when
  a natural large-scale foundation is appropriate and absent.
- Use `configure_procedural_*` tools for terrain, vegetation, lighting,
  atmosphere, water, motion, and post. Regenerate only after changes that need
  generation; do not regenerate for a minor time, bookmark, or post change.
- Set a playable spawn and author landmarks with standard scene tools. A
  procedural world is a foundation, not level design by itself.
- Use `capture_world_verification_screenshot` for major visual work and
  `inspect_world_performance` before high density or ultra-showcase claims.
- Never claim generation, visual quality, GPU timing, or a feature succeeded
  without a corresponding tool result or inspected screenshot.

## Definition of done

The world has a coherent route and composition, dressed near and distant
spaces, readable lighting, intentional motion and atmosphere, suitable
performance, and at least one visual verification pass. State WebGPU or
hardware limitations plainly.

## References

Read deeper material only when it helps the current task:

- `PROJECT_LAAS_v2`: showcase-quality operating doctrine.
- `procedural-world-tool-playbook`: real Dream Studio tool sequencing.
- `environment-production-workflow`: natural-world and level workflow.
- `composition-and-art-direction`: camera, landmark, color, and reference loop.
- `gameplay-and-exploration`: routes, spawn, traversal, and specialized worlds.
- `performance-and-scalability`: low, high, and ultra decision rules.
- `verification-battery`: screenshot and performance quality gates.
- `failure-modes`: common low-quality and false-completion outcomes.

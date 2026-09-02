# Procedural World Tool Playbook

## Capability first

Use `inspect_procedural_world` for an existing world and
`inspect_world_performance` before raising density. A procedural world is
WebGPU-only; do not silently replace it with a primitive forest or flat water
when advanced systems are available. If WebGPU is unavailable, explain the
limitation and use an explicitly appropriate authored fallback.

## New natural world

1. Inspect scene settings, nodes, existing world, and performance as relevant.
2. `create_procedural_world` only when no suitable world exists.
3. Configure terrain, then vegetation, lighting, atmosphere, water, motion,
   and post with the corresponding `configure_procedural_*` tools.
4. `regenerate_procedural_world` after changes that affect generated world
   data. Wait for the viewport status; a queued update is not a completed render.
5. Set exploration mode, place spawn and authored landmarks, create a
   bookmark, capture a verification screenshot, inspect performance, then fix
   the highest-impact deltas.

## Intent map

| Intent | Tool sequence |
| --- | --- |
| Large natural world | inspect -> create/reuse -> configure systems -> regenerate -> screenshot -> performance |
| New seed | inspect -> `set_procedural_world_seed` -> regenerate -> screenshot |
| Rivers or lakes | inspect -> terrain hydrology + water -> regenerate if required -> screenshot |
| Denser forest | inspect performance -> vegetation -> regenerate if required -> performance |
| Golden-hour capture | time of day -> lighting/atmosphere/post -> bookmark -> screenshot |
| Weather pass | weather + atmosphere/motion -> screenshot; regenerate only when required |
| Exploration | exploration mode -> spawn -> authored routes/landmarks -> bookmark -> verify traversal |
| Optimization | inspect performance -> reduce targeted range, density, resolution, or quality -> screenshot |

## Targeted regeneration

Minor time-of-day, weather, bookmark, exploration, and post changes should not
trigger an unnecessary complete-world regeneration. Respect the runtime's
actual capabilities and use its viewport feedback as authority.

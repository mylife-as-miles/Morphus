# Performance and Scalability

Inspect the active world and performance before raising visible range or
scatter density. Maintain the visual identity of the scene while tuning the
specific cost that dominates.

## Low

For integrated GPUs and basic previews, retain the major systems but reduce
resolution, density, range, froxel/sample cost, shadow quality, and particle
budget. Do not replace systems with unrelated placeholders.

## High

Use the full balanced visual stack for capable systems: strong terrain range,
vegetation, lighting, atmosphere, water, motion, and post while preserving
editor responsiveness.

## Ultra

Reserve for explicit maximum-quality, showcase, benchmark, or final-capture
requests on a capable GPU. Pursue the highest supported terrain resolution,
visible range, vegetation counts, shadows, volumetrics, GI, water, particles,
and post stack. Do not enable ultra automatically for every request.

## Optimization order

1. Inspect timings and counts.
2. Fix the dominant pass, range, density, resolution, or sample count.
3. Preserve landmark silhouettes, near-field dressing, and traversal.
4. Re-capture and re-inspect after the targeted change.

Live GPU timing requires the active WebGPU viewport. Persisted presets and
expected counts are useful planning data, not substitute timing measurements.

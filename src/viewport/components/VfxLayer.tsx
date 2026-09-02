/**
 * Runs the combat VFX abilities inside the viewport.
 *
 * The shared services -- light pool, particle engine, decals, bursts, shake,
 * flash -- are built once and handed to every ability, which is what lets twenty
 * casts of the same element share one ember buffer and one set of dynamic lights
 * rather than each allocating its own.
 *
 * Note the renderer: these abilities are hand-written GLSL on raw
 * `ShaderMaterial`, so they draw on the WebGL backend and would render nothing
 * under WebGPU. The layer mounts regardless and simply never produces anything
 * visible on a WebGPU canvas -- a deliberate silence rather than a crash.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import {
  AbilityManager,
  BurstSystem,
  CameraShake,
  DecalSystem,
  LightPool,
  ParticleEngine,
  ScreenFlash,
  updateFrameUniforms,
  type AbilityContext
} from "@blud/vfx";
import { drainVfxCasts, setVfxViewportReady } from "@/state/vfx-runtime";

/** Where camera shake accumulates. Read by whoever wants to apply it. */
export type VfxShakeState = { shakeOffset: Vector3; shakeRoll: number };

export function VfxLayer({ enabled = true }: { enabled?: boolean }) {
  const scene = useThree((state) => state.scene);
  const rootRef = useRef<Group | null>(null);

  const shakeTarget = useMemo<VfxShakeState>(
    () => ({ shakeOffset: new Vector3(), shakeRoll: 0 }),
    []
  );

  const runtime = useMemo(() => {
    const root = new Group();
    root.name = "CombatVfx";
    // `matrixAutoUpdate` off: abilities place everything in world space, so the
    // root never moves and re-deriving its identity matrix every frame is waste.
    root.matrixAutoUpdate = false;

    const context: AbilityContext = {
      scene: root,
      lights: new LightPool(root),
      particles: new ParticleEngine(root),
      decals: new DecalSystem(root),
      bursts: new BurstSystem(root),
      shake: new CameraShake(shakeTarget),
      flash: new ScreenFlash(),
      environment: { registerShadowCasterWithPatch: (mesh) => mesh }
    };

    return { root, context, manager: new AbilityManager(context) };
  }, [shakeTarget]);

  useEffect(() => {
    if (!enabled) return;
    scene.add(runtime.root);
    setVfxViewportReady(true);

    return () => {
      setVfxViewportReady(false);
      scene.remove(runtime.root);
    };
  }, [enabled, runtime, scene]);

  useFrame((_, delta) => {
    if (!enabled) return;

    // Clamped: a tab that was backgrounded for a minute must not advance every
    // live cast by sixty seconds in one step.
    const dt = Math.min(delta, 1 / 20);

    for (const request of drainVfxCasts()) {
      const origin = new Vector3(request.origin.x, request.origin.y, request.origin.z);
      const direction = new Vector3(request.direction.x, 0, request.direction.z);
      if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
      runtime.manager.cast(origin, direction.normalize(), request.distance, request.element);
    }

    updateFrameUniforms(dt);
    runtime.manager.update(dt);
    runtime.context.lights.update(dt);
    runtime.context.decals.update(dt);
    runtime.context.bursts.update(dt);
    runtime.context.shake.update(dt);
    runtime.context.flash.update(dt);
    // One upload per frame for every system, after all abilities have emitted.
    runtime.context.particles.flush();
  });

  return <group ref={rootRef} name="CombatVfxAnchor" />;
}

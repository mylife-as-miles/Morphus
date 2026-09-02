import { Group, Vector3, Color } from "three";
import { settings } from "../config/settings";
import { saturate, Easing } from "../utils/math";
import { getColor } from "../utils/color";
import { LAYER } from "../core/Layers";
import type { AbilityContext } from "./AbilityContext";
import type { LightHandle } from "../effects/LightPool";

export const AbilityPhase = Object.freeze({
  IDLE: "idle",
  TRAVEL: "travel",
  IMPACT: "impact",
  FADE: "fade",
  DONE: "done"
});

export type AbilityPhaseId = (typeof AbilityPhase)[keyof typeof AbilityPhase];

/** One ability's tuning block. Read live, never copied at spawn. */
type AbilityConfig = {
  speed: number;
  lightColor: string;
  lightIntensity: number;
  lightRadius: number;
};

const _up = new Vector3(0, 1, 0);

/**
 * Abstract base for a linear skillshot.
 *
 * The sandbox used to cast along a freehand spline; it now casts along a **line**
 * chosen with the aim indicator, so this base is correspondingly small. What it
 * still owns, because every ability wants it and none of them should re-derive
 * it:
 *
 *   - the phase machine (travel -> impact -> fade -> done)
 *   - a front that advances along the line at a constant metres-per-second,
 *     frame-rate independent and eased off a standstill
 *   - the local frame (`direction`, `side`) every effect places itself in
 *   - dynamic light bookkeeping, including a decaying impact punch
 *   - the pooling contract: `spawn` must fully reset state, `destroy` must
 *     release, and neither may allocate
 *
 * Subclasses implement: `createShaders`, `createParticles`, `onSpawn`,
 * `onTravel`, `onImpact`, `onFade`, `onDestroy`.
 *
 * A second ability is therefore one new file plus a settings block -- nothing
 * else in the project changes.
 */
export class Ability {
  readonly element: string;
  readonly ctx: AbilityContext;
  readonly group: Group;

  phase: AbilityPhaseId = AbilityPhase.IDLE;

  /** Where the cast came from, on the floor. */
  readonly origin = new Vector3();
  /** Unit heading, flat. */
  readonly direction = new Vector3(0, 0, 1);
  /** Unit lateral, `direction` cross up. */
  readonly side = new Vector3(1, 0, 0);
  /** How far the cast reaches, metres. */
  length = 1;

  /** Metres the fracture front has travelled. */
  front = 0;
  /** That front as a fraction of `length`. */
  u = 0;
  /** World position of the front -- what the camera frames. */
  readonly position = new Vector3();

  age = 0;
  impactTime = 0;
  fadeTime = 0;

  light: LightHandle | null = null;
  readonly lightColor = new Color();
  /** Transient additive light punch (impacts). Decays on its own. */
  lightBoost = 0;

  /**
   * @param element key into `settings`
   * @param context shared systems
   */
  constructor(element: string, context: AbilityContext) {
    this.element = element;
    this.ctx = context;

    this.group = new Group();
    this.group.name = `Ability:${element}`;
    this.group.layers.set(LAYER.VFX);
    this.group.matrixAutoUpdate = false;

    this.createShaders();
    this.createParticles();
  }

  /** Live settings block for this element. */
  get config(): AbilityConfig {
    return (settings as unknown as Record<string, AbilityConfig>)[this.element];
  }

  get isActive(): boolean {
    return this.phase !== AbilityPhase.IDLE && this.phase !== AbilityPhase.DONE;
  }

  get isFinished(): boolean {
    return this.phase === AbilityPhase.DONE;
  }

  /**
   * Whether this cast stands until something dismisses it.
   *
   * A persistent cast has no natural end: it is not retired to make room for
   * newer casts, and the manager allows only one of its element at a time --
   * raising a second one asks the first to wind itself up (see `dismiss`).
   */
  get isPersistent(): boolean {
    return false;
  }

  /**
   * Whether the camera should still be framing this cast.
   *
   * Ordinary casts want it for as long as they are running. A persistent one
   * wants it while it is being *made* and then gives it back, because a gate
   * that has been standing for a minute is scenery, not an event.
   */
  get wantsCamera(): boolean {
    return this.isActive;
  }

  /**
   * Ask a persistent cast to end. A no-op for everything else.
   *
   * Not the same as `destroy`: this begins whatever the ability does to come
   * apart, and the phase machine retires it once that has played out.
   */
  dismiss(): void {}

  /** Instanced geometry this cast is currently drawing. HUD readout only. */
  get instanceCount(): number {
    return 0;
  }

  /* ------------------------------------------------------------------ */
  /* Subclass hooks                                                      */
  /* ------------------------------------------------------------------ */

  /** Build materials/meshes once, at construction. */
  createShaders(): void {}

  /** Register the shared particle systems this element needs. */
  createParticles(): void {}

  /** Called at the start of every cast, after the base state was reset. */
  onSpawn(): void {}

  /** Per-frame while the front is still travelling. */
  onTravel(_dt: number): void {}

  /** One-shot when the front reaches the end of the line. */
  onImpact(): void {}

  /**
   * Per-frame after the impact.
   * @param t 0..1 through the impact phase, then 1..2 through the fade.
   */
  onFade(_dt: number, _t: number): void {}

  /** Release any per-cast resources. */
  onDestroy(): void {}

  /** How long the impact and fade phases last. Overridable per element. */
  get impactDuration(): number {
    return 1.1;
  }

  get fadeDuration(): number {
    return 1.2;
  }

  /**
   * Per-frame multiplier on the dynamic light's intensity.
   *
   * The default is a slow shimmer rather than a flicker: ice glints, it does not
   * gutter. Elements that *should* gutter override this.
   */
  lightShimmer(): number {
    return 0.9 + 0.1 * Math.sin(this.age * 9.3) * Math.sin(this.age * 3.7);
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Begin a cast.
   *
   * @param origin    on the floor
   * @param direction unit, flat
   * @param distance  metres
   */
  spawn(origin: Vector3, direction: Vector3, distance: number): void {
    this.origin.set(origin.x, 0, origin.z);
    this.direction.copy(direction).setY(0).normalize();
    this.side.crossVectors(this.direction, _up).normalize();
    this.length = Math.max(0.1, distance);

    this.front = 0;
    this.u = 0;
    this.age = 0;
    this.impactTime = 0;
    this.fadeTime = 0;
    this.lightBoost = 0;
    this.phase = AbilityPhase.TRAVEL;

    this.position.copy(this.origin);
    this.light = this.ctx.lights.acquire();

    this.group.visible = true;
    this.onSpawn();
  }

  /** A point on the cast line. `s` is 0..1 along it. */
  pointAt(s: number, out: Vector3): Vector3 {
    return out.copy(this.origin).addScaledVector(this.direction, s * this.length);
  }

  /**
   * Advance the front. Delta-time driven, so the eruption travels at a constant
   * metres-per-second regardless of frame rate or how long the cast is.
   *
   * @returns true on the frame the front reaches the end
   */
  advance(dt: number): boolean {
    const speed = this.config.speed * settings.global.speed;
    // Ease off the standstill so the front has weight. Keyed off elapsed time
    // rather than progress: keying it off `u` would multiply the very first step
    // by zero and the front could never leave the caster.
    const easeIn = Easing.outQuad(saturate(this.age / 0.08));

    this.front += speed * easeIn * dt;
    const previousU = this.u;
    this.u = saturate(this.front / this.length);
    this.pointAt(this.u, this.position);

    return this.u >= 1 && previousU < 1;
  }

  update(dt: number): void {
    if (!this.isActive) return;
    this.age += dt;

    switch (this.phase) {
      case AbilityPhase.TRAVEL: {
        const reachedEnd = this.advance(dt);
        this.onTravel(dt);
        this.updateLight(dt, 1);
        if (reachedEnd) {
          this.phase = AbilityPhase.IMPACT;
          this.impactTime = 0;
          this.onImpact();
        }
        break;
      }

      case AbilityPhase.IMPACT: {
        this.impactTime += dt;
        const t = saturate(this.impactTime / this.impactDuration);
        this.onFade(dt, t);
        this.updateLight(dt, 1 - Easing.inQuad(t) * 0.45);
        if (t >= 1) {
          this.phase = AbilityPhase.FADE;
          this.fadeTime = 0;
        }
        break;
      }

      case AbilityPhase.FADE: {
        this.fadeTime += dt;
        const t = saturate(this.fadeTime / this.fadeDuration);
        this.onFade(dt, 1 + t);
        this.updateLight(dt, (1 - t) * 0.35);
        if (t >= 1) this.phase = AbilityPhase.DONE;
        break;
      }

      default:
        break;
    }
  }

  private updateLight(dt: number, scale: number): void {
    if (!this.light) return;
    const cfg = this.config;
    this.lightColor.copy(getColor(cfg.lightColor));
    const shimmer = this.lightShimmer();
    this.ctx.lights.set(
      this.light,
      this.position,
      this.lightColor,
      cfg.lightIntensity * scale * shimmer + this.lightBoost,
      cfg.lightRadius * (1 + this.lightBoost * 0.02),
      dt
    );
    this.lightBoost = Math.max(0, this.lightBoost - this.lightBoost * 4.5 * dt - 0.5 * dt);
  }

  /** Return to the pool. Must leave the instance reusable. */
  destroy(): void {
    this.onDestroy();
    this.ctx.lights.release(this.light);
    this.light = null;
    this.group.visible = false;
    this.phase = AbilityPhase.IDLE;
  }

  /** Free GPU resources (app teardown only -- not part of pooling). */
  dispose(): void {
    this.group.parent?.remove(this.group);
  }
}

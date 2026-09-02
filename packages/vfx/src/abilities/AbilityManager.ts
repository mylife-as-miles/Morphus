import { PyreAbility } from './PyreAbility';
import { KrakenAbility } from './KrakenAbility';
import { ElectricalSphereAbility } from './ElectricalSphereAbility';
import { EarthAbility } from './EarthAbility';
import { PortalAbility } from './PortalAbility';
import { AetherRingAbility } from './AetherRingAbility';
import { FirePortalAbility } from './FirePortalAbility';
import { ELEMENTS, type ElementId } from '../config/settings';
import { ObjectPool } from '../utils/ObjectPool';
import type { Vector3 } from 'three';
import type { Ability } from './Ability';
import type { AbilityContext } from './AbilityContext';

/** Registry: adding an ability means adding one line here. */
const ABILITY_TYPES: Record<ElementId, new (ctx: AbilityContext) => Ability> = {
  pyre: PyreAbility,
  kraken: KrakenAbility,
  electrical: ElectricalSphereAbility,
  earth: EarthAbility,
  portal: PortalAbility,
  aether: AetherRingAbility,
  firePortal: FirePortalAbility
};

const MAX_CONCURRENT = 4;

/**
 * Spawns, updates and recycles abilities.
 *
 * Instances are pooled per type: casting fifty times constructs at most a
 * handful of objects per ability, and every one of them keeps its meshes and
 * materials for the lifetime of the app. Nothing is built during a cast.
 *
 * `MAX_CONCURRENT` is shared across types, so mixing abilities retires the
 * oldest cast whichever element it was — with one exception. A **persistent**
 * cast (`Ability#isPersistent`) has no natural end, so it is never the one
 * retired to make room; instead only one of its element may stand at a time,
 * and casting it again asks the standing one to come apart. That is the whole
 * of "the gate stays open until you build another one", and it lives here
 * rather than in the ability because it is a question about the *set* of live
 * casts.
 */
export class AbilityManager {
  private readonly ctx: AbilityContext;
  private readonly pools = new Map<ElementId, ObjectPool<Ability>>();
  private readonly active: Ability[] = [];
  private selected: ElementId;

  /**
   * @param {object} context shared systems handed to every ability:
   *   { scene, camera, environment, particles, lights, decals, bursts, shake, flash }
   */
  constructor(context: AbilityContext) {
    this.ctx = context;
    this.selected = ELEMENTS[0];

    for (const [element, Type] of Object.entries(ABILITY_TYPES) as Array<[ElementId, new (ctx: AbilityContext) => Ability]>) {
      this.pools.set(
        element,
        new ObjectPool(() => {
          const ability = new Type(this.ctx);
          this.ctx.scene.add(ability.group);
          ability.group.visible = false;
          return ability;
        })
      );
    }
  }

  select(element: ElementId): void {
    if (!ABILITY_TYPES[element]) return;
    this.selected = element;
  }

  /**
   * Cast the selected ability along a line.
   *
   * A far cast takes the same three arguments and simply works from the far end
   * of that line — which is why adding zone targeting needed nothing here.
   *
   * @param {THREE.Vector3} origin     on the floor
   * @param {THREE.Vector3} direction  unit, flat
   * @param {number} distance          metres
   * @returns {import('./Ability.js').Ability|null}
   */
  cast(origin: Vector3, direction: Vector3, distance: number, element: ElementId = this.selected): Ability | null {
    if (!ABILITY_TYPES[element]) return null;

    // One standing structure per element: the one already up is asked to wind
    // itself up *before* the new one is spawned, so the two never overlap in
    // the pool and the old one still gets to play its collapse.
    for (const ability of this.active) {
      if (ability.element === element && ability.isPersistent) ability.dismiss();
    }

    // Retire the oldest cast rather than letting the scene grow without bound.
    // A persistent cast is skipped: a gate that four fireballs can delete is
    // not a gate that stays open.
    if (this.active.length >= MAX_CONCURRENT) {
      const index = this.active.findIndex((candidate) => !candidate.isPersistent);
      if (index >= 0) {
        const [oldest] = this.active.splice(index, 1);
        oldest.destroy();
        this.pools.get(oldest.element as ElementId)?.release(oldest);
      }
    }

    const pool = this.pools.get(element);
    if (!pool) return null;
    const ability = pool.acquire();
    ability.spawn(origin, direction, distance);
    this.active.push(ability);
    return ability;
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ability = this.active[i];
      ability.update(dt);
      if (ability.isFinished) {
        this.active.splice(i, 1);
        ability.destroy();
        this.pools.get(ability.element as ElementId)?.release(ability);
      }
    }
  }

  /** Cancel everything currently in flight. */
  clear(): void {
    for (const ability of this.active) {
      ability.destroy();
      this.pools.get(ability.element as ElementId)?.release(ability);
    }
    this.active.length = 0;
  }

  /**
   * The most recent cast still worth framing.
   *
   * Not simply the most recent live one: a standing gate is live for as long as
   * it is open, and pinning the camera to it forever would make every later
   * cast unwatchable. It hands the camera back once it is built (see
   * `Ability#wantsCamera`).
   */
  get focus(): Ability | null {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].isActive && this.active[i].wantsCamera) return this.active[i];
    }
    return null;
  }

  dispose(): void {
    this.clear();
    for (const pool of this.pools.values()) pool.dispose((ability: Ability) => ability.dispose());
    this.pools.clear();
  }
}

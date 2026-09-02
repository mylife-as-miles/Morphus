import type * as THREE from "three";
import type {
  PhysicsBackend,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
  PhysicsJointHandle,
  RigidBodyDescriptor,
  ColliderDescriptor,
  ColliderShape,
  JointDescriptor,
  PhysicsTransform,
  RaycastResult,
  ShapecastResult,
  PhysicsDebugData,
  CharacterControllerConfig,
  PhysicsCharacterController,
} from "./types.js";

/**
 * RapierPhysicsBackend
 *
 * Wraps @dimforge/rapier3d-compat (the same engine used by @react-three/rapier).
 *
 * STATUS: Scaffolded. The editor already uses Rapier via @react-three/rapier's
 * React component API (Physics, RigidBody, Collider). That path is untouched.
 *
 * This imperative adapter is for:
 *   1. The runtime (packages/runtime-physics-rapier replaces this over time).
 *   2. Editor-tool physics queries (snapping raycasts, prop placement).
 *   3. Giving the factory a concrete default to return.
 *
 * ─── Migration Note ──────────────────────────────────────────────────────────
 * packages/runtime-physics-rapier already has the Rapier world lifecycle.
 * Once the PhysicsBackend interface is stable, that package should implement
 * it directly, removing the need for this adapter in the runtime.
 */
export class RapierPhysicsBackend implements PhysicsBackend {
  readonly backend = "rapier" as const;

  private _RAPIER: RapierModule | null = null;
  private _world: RapierWorld | null = null;
  private _bodies = new Map<number, RapierRigidBody>();
  private _colliders = new Map<number, RapierCollider>();
  private _nextId = 1;

  async init(gravity: THREE.Vector3Like = { x: 0, y: -9.81, z: 0 }): Promise<void> {
    const RAPIER = await loadRapier();
    this._RAPIER = RAPIER;
    this._world = new RAPIER.World({ x: gravity.x, y: gravity.y, z: gravity.z });
  }

  step(delta: number): void {
    if (!this._world) return;
    this._world.timestep = delta;
    this._world.step();
  }

  createRigidBody(desc: RigidBodyDescriptor): PhysicsBodyHandle {
    const R = this._assertReady();
    const rbDesc = this._buildRigidBodyDesc(R, desc);
    const body = R.world.createRigidBody(rbDesc);
    const id = this._nextId++;
    this._bodies.set(id, body);
    return { __tag: "PhysicsBodyHandle", id } as PhysicsBodyHandle;
  }

  createCollider(desc: ColliderDescriptor, bodyHandle: PhysicsBodyHandle): PhysicsColliderHandle {
    const R = this._assertReady();
    const body = this._getBody(bodyHandle);
    const colliderDesc = this._buildColliderDesc(R.RAPIER, desc);
    const collider = R.world.createCollider(colliderDesc, body);
    const id = this._nextId++;
    this._colliders.set(id, collider);
    return { __tag: "PhysicsColliderHandle", id } as PhysicsColliderHandle;
  }

  removeBody(handle: PhysicsBodyHandle): void {
    const R = this._assertReady();
    const body = this._getBody(handle);
    R.world.removeRigidBody(body);
    this._bodies.delete(handle.id);
  }

  setTransform(handle: PhysicsBodyHandle, transform: PhysicsTransform): void {
    const body = this._getBody(handle);
    body.setTranslation(transform.position, true);
    body.setRotation(transform.quaternion as RapierQuaternion, true);
  }

  getTransform(handle: PhysicsBodyHandle): PhysicsTransform | null {
    const body = this._bodies.get(handle.id);
    if (!body) return null;
    const t = body.translation();
    const r = body.rotation();
    return {
      position: { x: t.x, y: t.y, z: t.z },
      quaternion: { x: r.x, y: r.y, z: r.z, w: r.w },
    };
  }

  setKinematicTarget(handle: PhysicsBodyHandle, transform: PhysicsTransform): void {
    const body = this._getBody(handle);
    body.setNextKinematicTranslation(transform.position);
    body.setNextKinematicRotation(transform.quaternion as RapierQuaternion);
  }

  addImpulse(handle: PhysicsBodyHandle, impulse: THREE.Vector3Like): void {
    const body = this._getBody(handle);
    body.applyImpulse(impulse, true);
  }

  raycast(
    origin: THREE.Vector3Like,
    direction: THREE.Vector3Like,
    maxToi: number,
    _excludeBody?: PhysicsBodyHandle
  ): RaycastResult | null {
    const R = this._assertReady();
    const ray = new R.RAPIER.Ray(origin, direction);
    const hit = R.world.castRay(ray, maxToi, true);
    if (!hit) return null;

    const point = {
      x: origin.x + direction.x * hit.timeOfImpact,
      y: origin.y + direction.y * hit.timeOfImpact,
      z: origin.z + direction.z * hit.timeOfImpact,
    };

    const bodyId = [...this._bodies.entries()].find(
      ([, b]) => b.handle === hit.collider.parent()?.handle
    )?.[0] ?? -1;

    return {
      bodyHandle: { __tag: "PhysicsBodyHandle", id: bodyId } as PhysicsBodyHandle,
      point: point as THREE.Vector3,
      normal: { x: 0, y: 1, z: 0 } as THREE.Vector3,
      toi: hit.timeOfImpact,
    };
  }

  shapecast(
    _shape: ColliderShape,
    _startTransform: PhysicsTransform,
    _direction: THREE.Vector3Like,
    _maxToi: number
  ): ShapecastResult | null {
    return null;
  }

  createJoint(_desc: JointDescriptor): PhysicsJointHandle {
    return { __tag: "PhysicsJointHandle", id: this._nextId++ } as PhysicsJointHandle;
  }

  removeJoint(_handle: PhysicsJointHandle): void {}

  createCharacterController(_config: CharacterControllerConfig): PhysicsCharacterController {
    return {
      computeMovement: (_bodyHandle, desiredTranslation, _delta) => {
        const THREE_Vec3 = { x: desiredTranslation.x, y: desiredTranslation.y, z: desiredTranslation.z };
        return THREE_Vec3 as THREE.Vector3;
      },
      dispose: () => {},
    };
  }

  getDebugData(): PhysicsDebugData {
    const R = this._assertReady();
    const debug = R.world.debugRender();
    return { vertices: debug.vertices, colors: debug.colors };
  }

  supportsFeature(feature: string): boolean {
    const supported = ["rigid-bodies", "trimesh", "ccd", "character-controller", "joints"];
    return supported.includes(feature);
  }

  dispose(): void {
    this._world?.free();
    this._world = null;
    this._RAPIER = null;
    this._bodies.clear();
    this._colliders.clear();
  }

  private _assertReady(): { RAPIER: RapierModule; world: RapierWorld } {
    if (!this._RAPIER || !this._world) {
      throw new Error("[RapierPhysicsBackend] Not initialised. Call init() first.");
    }
    return { RAPIER: this._RAPIER, world: this._world };
  }

  private _getBody(handle: PhysicsBodyHandle): RapierRigidBody {
    const body = this._bodies.get(handle.id);
    if (!body) throw new Error(`[RapierPhysicsBackend] No body with id ${handle.id}`);
    return body;
  }

  private _buildRigidBodyDesc(
    R: { RAPIER: RapierModule },
    desc: RigidBodyDescriptor
  ): RapierRigidBodyDesc {
    const RAPIER = R.RAPIER;
    let rbDesc: RapierRigidBodyDesc;
    switch (desc.type) {
      case "dynamic": rbDesc = RAPIER.RigidBodyDesc.dynamic(); break;
      case "fixed": rbDesc = RAPIER.RigidBodyDesc.fixed(); break;
      case "kinematic-position": rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased(); break;
      case "kinematic-velocity": rbDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased(); break;
    }
    rbDesc.setTranslation(desc.transform.position.x, desc.transform.position.y, desc.transform.position.z);
    if (desc.linearDamping !== undefined) rbDesc.setLinearDamping(desc.linearDamping);
    if (desc.angularDamping !== undefined) rbDesc.setAngularDamping(desc.angularDamping);
    if (desc.gravityScale !== undefined) rbDesc.setGravityScale(desc.gravityScale);
    return rbDesc;
  }

  private _buildColliderDesc(RAPIER: RapierModule, desc: ColliderDescriptor): RapierColliderDesc {
    const shape = desc.shape;
    let cd: RapierColliderDesc;
    switch (shape.kind) {
      case "box": cd = RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z); break;
      case "sphere": cd = RAPIER.ColliderDesc.ball(shape.radius); break;
      case "capsule": cd = RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius); break;
      case "cylinder": cd = RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius); break;
      case "cone": cd = RAPIER.ColliderDesc.cone(shape.halfHeight, shape.radius); break;
      case "trimesh": cd = RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices); break;
      case "convex-hull": cd = RAPIER.ColliderDesc.convexHull(shape.vertices) ?? RAPIER.ColliderDesc.ball(0.5); break;
    }
    if (desc.restitution !== undefined) cd.setRestitution(desc.restitution);
    if (desc.friction !== undefined) cd.setFriction(desc.friction);
    if (desc.density !== undefined) cd.setDensity(desc.density);
    if (desc.isSensor !== undefined) cd.setSensor(desc.isSensor);
    return cd;
  }
}

async function loadRapier(): Promise<RapierModule> {
  const mod = await import("@dimforge/rapier3d-compat");
  await mod.init();
  return mod as unknown as RapierModule;
}

type RapierVector3 = { x: number; y: number; z: number };
type RapierQuaternion = { x: number; y: number; z: number; w: number };

interface RapierRigidBodyDesc {
  setTranslation(x: number, y: number, z: number): this;
  setLinearDamping(v: number): this;
  setAngularDamping(v: number): this;
  setGravityScale(v: number): this;
}

interface RapierColliderDesc {
  setRestitution(v: number): this;
  setFriction(v: number): this;
  setDensity(v: number): this;
  setSensor(v: boolean): this;
}

interface RapierRigidBody {
  handle: number;
  translation(): RapierVector3;
  rotation(): RapierQuaternion;
  setTranslation(v: RapierVector3, wake: boolean): void;
  setRotation(q: RapierQuaternion, wake: boolean): void;
  setNextKinematicTranslation(v: RapierVector3Like): void;
  setNextKinematicRotation(q: RapierVector3Like): void;
  applyImpulse(v: RapierVector3Like, wake: boolean): void;
}

type RapierVector3Like = { x: number; y: number; z: number };

interface RapierCollider {
  handle: number;
  parent(): RapierRigidBody | null;
}

interface RapierRay {
  new(origin: RapierVector3Like, direction: RapierVector3Like): RapierRay;
}

interface RapierCastRayResult {
  collider: RapierCollider;
  timeOfImpact: number;
}

interface RapierWorld {
  timestep: number;
  createRigidBody(desc: RapierRigidBodyDesc): RapierRigidBody;
  createCollider(desc: RapierColliderDesc, body: RapierRigidBody): RapierCollider;
  removeRigidBody(body: RapierRigidBody): void;
  castRay(ray: RapierRay, maxToi: number, solid: boolean): RapierCastRayResult | null;
  debugRender(): { vertices: Float32Array; colors: Float32Array };
  step(): void;
  free(): void;
}

interface RapierModule {
  init(): Promise<void>;
  World: new (gravity: RapierVector3) => RapierWorld;
  Ray: new (origin: RapierVector3Like, direction: RapierVector3Like) => RapierRay;
  RigidBodyDesc: {
    dynamic(): RapierRigidBodyDesc;
    fixed(): RapierRigidBodyDesc;
    kinematicPositionBased(): RapierRigidBodyDesc;
    kinematicVelocityBased(): RapierRigidBodyDesc;
  };
  ColliderDesc: {
    cuboid(hx: number, hy: number, hz: number): RapierColliderDesc;
    ball(r: number): RapierColliderDesc;
    capsule(hh: number, r: number): RapierColliderDesc;
    cylinder(hh: number, r: number): RapierColliderDesc;
    cone(hh: number, r: number): RapierColliderDesc;
    trimesh(v: Float32Array, i: Uint32Array): RapierColliderDesc;
    convexHull(v: Float32Array): RapierColliderDesc | null;
  };
}

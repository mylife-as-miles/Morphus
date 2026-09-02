import type * as THREE from "three";

// ─── Backend Enum ──────────────────────────────────────────────────────────────

export type PhysicsBackendType = "rapier" | "jolt";

// ─── Transform ────────────────────────────────────────────────────────────────

export interface PhysicsTransform {
  position: THREE.Vector3Like;
  quaternion: THREE.QuaternionLike;
}

// ─── Body / Collider Descriptors ──────────────────────────────────────────────

export type RigidBodyType = "dynamic" | "fixed" | "kinematic-position" | "kinematic-velocity";

export interface RigidBodyDescriptor {
  type: RigidBodyType;
  transform: PhysicsTransform;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  ccdEnabled?: boolean;
}

export type ColliderShape =
  | { kind: "box"; halfExtents: THREE.Vector3Like }
  | { kind: "sphere"; radius: number }
  | { kind: "capsule"; halfHeight: number; radius: number }
  | { kind: "cylinder"; halfHeight: number; radius: number }
  | { kind: "cone"; halfHeight: number; radius: number }
  | { kind: "trimesh"; vertices: Float32Array; indices: Uint32Array }
  | { kind: "convex-hull"; vertices: Float32Array };

export interface ColliderDescriptor {
  shape: ColliderShape;
  restitution?: number;
  friction?: number;
  density?: number;
  isSensor?: boolean;
}

// ─── Joint Descriptors ────────────────────────────────────────────────────────

export interface FixedJointDescriptor {
  type: "fixed";
  bodyA: PhysicsBodyHandle;
  bodyB: PhysicsBodyHandle;
  frameA: PhysicsTransform;
  frameB: PhysicsTransform;
}

export type JointDescriptor = FixedJointDescriptor;

// ─── Opaque Handles ───────────────────────────────────────────────────────────

/** Opaque handle to a rigid body in the simulation. */
export type PhysicsBodyHandle = { readonly __tag: "PhysicsBodyHandle" } & { id: number };

/** Opaque handle to a collider. */
export type PhysicsColliderHandle = { readonly __tag: "PhysicsColliderHandle" } & { id: number };

/** Opaque handle to a joint. */
export type PhysicsJointHandle = { readonly __tag: "PhysicsJointHandle" } & { id: number };

// ─── Raycast / Shapecast ──────────────────────────────────────────────────────

export interface RaycastResult {
  bodyHandle: PhysicsBodyHandle;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  toi: number;
}

export interface ShapecastResult {
  bodyHandle: PhysicsBodyHandle;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  toi: number;
}

// ─── Debug Data ───────────────────────────────────────────────────────────────

export interface PhysicsDebugData {
  vertices: Float32Array;
  colors: Float32Array;
}

// ─── Character Controller ─────────────────────────────────────────────────────

export interface CharacterControllerConfig {
  offset: number;
  slopeLimit: number;
  stepHeight: number;
}

export interface PhysicsCharacterController {
  computeMovement(
    bodyHandle: PhysicsBodyHandle,
    desiredTranslation: THREE.Vector3Like,
    delta: number
  ): THREE.Vector3;
  dispose(): void;
}

// ─── Core Interface ───────────────────────────────────────────────────────────

/**
 * PhysicsBackend — the single seam between editor systems and the physics engine.
 *
 * Implementations:
 *   - RapierPhysicsBackend  (wraps @dimforge/rapier3d-compat — existing dep)
 *   - JoltPhysicsBackend    (wraps jolt-physics — optional, feature-flagged)
 *
 * The editor's authoring physics (ScenePreview + @react-three/rapier) does NOT
 * use this interface. That React-component physics layer stays as-is for the
 * editor play mode. This interface is for:
 *   1. The runtime (packages/runtime-physics-*)
 *   2. Future editor-tool physics queries (raycast for placement snapping, etc.)
 *   3. Jolt sandbox / benchmark mode
 */
export interface PhysicsBackend {
  readonly backend: PhysicsBackendType;

  /** Async init: loads WASM, creates world, sets gravity. */
  init(gravity?: THREE.Vector3Like): Promise<void>;

  /** Advance the simulation by `delta` seconds. */
  step(delta: number): void;

  /** Create a rigid body. Returns an opaque handle. */
  createRigidBody(desc: RigidBodyDescriptor): PhysicsBodyHandle;

  /** Attach a collider to a body. */
  createCollider(desc: ColliderDescriptor, bodyHandle: PhysicsBodyHandle): PhysicsColliderHandle;

  /** Remove a body and all its colliders. */
  removeBody(handle: PhysicsBodyHandle): void;

  /** Teleport a body to a new transform. */
  setTransform(handle: PhysicsBodyHandle, transform: PhysicsTransform): void;

  /** Read current simulated transform. */
  getTransform(handle: PhysicsBodyHandle): PhysicsTransform | null;

  /** For kinematic bodies: set the target transform for the next step. */
  setKinematicTarget(handle: PhysicsBodyHandle, transform: PhysicsTransform): void;

  /** Apply a world-space impulse at the body's centre of mass. */
  addImpulse(handle: PhysicsBodyHandle, impulse: THREE.Vector3Like): void;

  /** Raycast from origin along direction, up to maxToi. Returns first hit or null. */
  raycast(
    origin: THREE.Vector3Like,
    direction: THREE.Vector3Like,
    maxToi: number,
    excludeBody?: PhysicsBodyHandle
  ): RaycastResult | null;

  /** Shapecast (sweep test). */
  shapecast(
    shape: ColliderShape,
    startTransform: PhysicsTransform,
    direction: THREE.Vector3Like,
    maxToi: number
  ): ShapecastResult | null;

  /** Create a constraint between two bodies. */
  createJoint(desc: JointDescriptor): PhysicsJointHandle;

  /** Remove a constraint. */
  removeJoint(handle: PhysicsJointHandle): void;

  /** Create a character controller for capsule-based movement. */
  createCharacterController(config: CharacterControllerConfig): PhysicsCharacterController;

  /** Raw wire-frame debug geometry for visualizing colliders. */
  getDebugData(): PhysicsDebugData;

  /** Check whether a specific feature is supported. */
  supportsFeature(feature: string): boolean;

  /** Tear down the world and free WASM memory. */
  dispose(): void;
}

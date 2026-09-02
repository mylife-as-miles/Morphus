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
 * JoltPhysicsBackend — Feature-flagged alternate physics backend.
 *
 * STATUS: SCAFFOLDED STUB — not production-ready.
 *
 * Jolt Physics (https://github.com/nicktindall/jolt-physics-js) is a
 * high-performance rigid-body engine with deterministic simulation,
 * advanced constraints, and large-world support.
 *
 * ─── Architectural Contract ──────────────────────────────────────────────────
 * Jolt is NEVER co-active with Rapier in the default editor scene.
 * It is only activated when:
 *   - ENABLE_JOLT_BACKEND flag is on AND
 *   - The PhysicsFactory explicitly requests it (e.g., sandbox/benchmark mode)
 *
 * The editor's authoring physics (ScenePreview + @react-three/rapier) is
 * NEVER replaced by Jolt. Jolt is a runtime backend option only.
 *
 * ─── Integration Steps (when implementing) ───────────────────────────────────
 * 1. npm install jolt-physics (or the WASM distribution of your choice).
 * 2. Implement each method below by mapping to the Jolt WASM API.
 * 3. The PhysicsFactory already routes to this class when the flag is on —
 *    no changes to editor code needed.
 * 4. Add "jolt" to PhysicsBackendType and update the factory.
 *
 * ─── Risk Note ───────────────────────────────────────────────────────────────
 * Jolt's WASM binary is ~1.5 MB. Use dynamic import() for code splitting.
 * Do NOT include it in the main bundle.
 */
export class JoltPhysicsBackend implements PhysicsBackend {
  readonly backend = "jolt" as const;

  async init(_gravity?: THREE.Vector3Like): Promise<void> {
    throw new JoltNotImplementedError("init");
  }

  step(_delta: number): void {
    throw new JoltNotImplementedError("step");
  }

  createRigidBody(_desc: RigidBodyDescriptor): PhysicsBodyHandle {
    throw new JoltNotImplementedError("createRigidBody");
  }

  createCollider(
    _desc: ColliderDescriptor,
    _bodyHandle: PhysicsBodyHandle
  ): PhysicsColliderHandle {
    throw new JoltNotImplementedError("createCollider");
  }

  removeBody(_handle: PhysicsBodyHandle): void {
    throw new JoltNotImplementedError("removeBody");
  }

  setTransform(_handle: PhysicsBodyHandle, _transform: PhysicsTransform): void {
    throw new JoltNotImplementedError("setTransform");
  }

  getTransform(_handle: PhysicsBodyHandle): PhysicsTransform | null {
    throw new JoltNotImplementedError("getTransform");
  }

  setKinematicTarget(_handle: PhysicsBodyHandle, _transform: PhysicsTransform): void {
    throw new JoltNotImplementedError("setKinematicTarget");
  }

  addImpulse(_handle: PhysicsBodyHandle, _impulse: THREE.Vector3Like): void {
    throw new JoltNotImplementedError("addImpulse");
  }

  raycast(
    _origin: THREE.Vector3Like,
    _direction: THREE.Vector3Like,
    _maxToi: number,
    _excludeBody?: PhysicsBodyHandle
  ): RaycastResult | null {
    throw new JoltNotImplementedError("raycast");
  }

  shapecast(
    _shape: ColliderShape,
    _startTransform: PhysicsTransform,
    _direction: THREE.Vector3Like,
    _maxToi: number
  ): ShapecastResult | null {
    throw new JoltNotImplementedError("shapecast");
  }

  createJoint(_desc: JointDescriptor): PhysicsJointHandle {
    throw new JoltNotImplementedError("createJoint");
  }

  removeJoint(_handle: PhysicsJointHandle): void {
    throw new JoltNotImplementedError("removeJoint");
  }

  createCharacterController(
    _config: CharacterControllerConfig
  ): PhysicsCharacterController {
    throw new JoltNotImplementedError("createCharacterController");
  }

  getDebugData(): PhysicsDebugData {
    return { vertices: new Float32Array(), colors: new Float32Array() };
  }

  supportsFeature(feature: string): boolean {
    const planned: string[] = [
      "rigid-bodies",
      "trimesh",
      "character-controller",
      "deterministic",
      "large-world",
      "soft-bodies",
    ];
    return planned.includes(feature);
  }

  dispose(): void {}
}

class JoltNotImplementedError extends Error {
  constructor(method: string) {
    super(
      `[JoltPhysicsBackend] ${method}() is not yet implemented. ` +
      `Jolt backend is scaffolded only. Set ENABLE_JOLT_BACKEND=false to use Rapier.`
    );
    this.name = "JoltNotImplementedError";
  }
}

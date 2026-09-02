export type {
  PhysicsBackendType,
  PhysicsBackend,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
  PhysicsJointHandle,
  PhysicsTransform,
  RigidBodyDescriptor,
  RigidBodyType,
  ColliderDescriptor,
  ColliderShape,
  JointDescriptor,
  FixedJointDescriptor,
  RaycastResult,
  ShapecastResult,
  PhysicsDebugData,
  CharacterControllerConfig,
  PhysicsCharacterController,
} from "./types.js";

export { RapierPhysicsBackend } from "./rapier-adapter.js";
export { JoltPhysicsBackend } from "./jolt-adapter.js";
export { createPhysicsBackend, type PhysicsFactoryOptions } from "./factory.js";

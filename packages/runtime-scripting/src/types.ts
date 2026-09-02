import type { Entity, GeometryNode, GameplayValue, SceneHook, Transform, Vec3 } from "@blud/shared";

export type CustomScriptCapability =
  | "assets"
  | "events"
  | "input"
  | "logging"
  | "overlay"
  | "physics"
  | "scene";

export type CustomScriptLogLevel = "debug" | "error" | "info" | "warn";

export type CustomScriptEventInput = {
  event: string;
  payload?: GameplayValue | Record<string, unknown> | unknown;
  targetId?: string;
};

export type CustomScriptEventFilter = {
  event?: string | string[];
  sourceId?: string;
  targetId?: string;
};

export type CustomScriptEventRecord = CustomScriptEventInput & {
  sourceId: string;
};

export type CustomScriptAssetServices = {
  resolve?: (path: string) => Promise<string> | string;
};

export type CustomScriptInputServices = {
  isKeyDown: (key: string) => boolean;
};

export type CustomScriptOverlayServices = {
  show?: (message: string, payload?: unknown) => void;
};

export type CustomScriptPhysicsServices = {
  rapier?: unknown;
  world?: unknown;
};

export type CustomScriptNodeApi = {
  getChildByName: (name: string) => CustomScriptNodeApi | undefined;
  getLocalPosition: () => Vec3;
  getName: () => string;
  getWorldPosition: () => Vec3;
  getWorldRotation: () => { w: number; x: number; y: number; z: number };
  id: string;
  kind: "entity" | "node";
  setLocalPosition: (x: number, y: number, z: number) => void;
  setLocalRotation: (x: number, y: number, z: number, w?: number) => void;
  setWorldPosition: (x: number, y: number, z: number) => void;
  setWorldRotation: (x: number, y: number, z: number, w?: number) => void;
};

export type CustomScriptEngineApi = {
  assets?: CustomScriptAssetServices;
  events: {
    emit: (input: CustomScriptEventInput) => void;
    on: (filter: CustomScriptEventFilter, listener: (event: CustomScriptEventRecord) => void) => () => void;
  };
  input?: CustomScriptInputServices;
  log?: (level: CustomScriptLogLevel, message: string, data?: unknown) => void;
  overlay?: CustomScriptOverlayServices;
  physics?: CustomScriptPhysicsServices;
  scene: {
    getNode: (id: string) => CustomScriptNodeApi | undefined;
  };
};

export type CustomScriptInstance = {
  onDispose?: () => void;
  onInit?: (node: CustomScriptNodeApi, engine: CustomScriptEngineApi) => void;
  onTick?: (deltaSeconds: number) => void;
};

export type CustomScriptModule = {
  default?: CustomScriptInstance | (new () => CustomScriptInstance);
};

export type CustomScriptHookConfig = {
  capabilities?: CustomScriptCapability[];
  diagnostics?: Array<Record<string, GameplayValue>>;
  origin?: Record<string, GameplayValue>;
  runtime?: string;
  source?: string;
};

export type CustomScriptHostServices = {
  assets?: CustomScriptAssetServices;
  emitEvent?: (input: CustomScriptEventInput & { sourceId: string }) => void;
  entities: Entity[];
  getLocalTransform: (targetId: string) => Transform | undefined;
  getWorldTransform: (targetId: string) => Transform | undefined;
  input?: CustomScriptInputServices;
  log?: (level: CustomScriptLogLevel, message: string, data?: unknown) => void;
  nodes: GeometryNode[];
  onEvent?: (filter: CustomScriptEventFilter, listener: (event: CustomScriptEventRecord) => void) => () => void;
  overlay?: CustomScriptOverlayServices;
  physics?: CustomScriptPhysicsServices;
  setLocalTransform: (targetId: string, transform: Transform) => void;
  setWorldTransform: (targetId: string, transform: Transform) => void;
};

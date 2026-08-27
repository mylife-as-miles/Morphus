import { createWaypointPath } from "@blud/gameplay-runtime";
import type { Entity, GameplayObject, ScenePathDefinition, Vec3 } from "@blud/shared";
import { useFrame } from "@react-three/fiber";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Object3D } from "three";

type PathMotionState = {
  active: boolean;
  direction: 1 | -1;
  paused: boolean;
  progress: number;
};

type WaypointPath = ReturnType<typeof createWaypointPath>;

function readNumber(config: GameplayObject, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(config: GameplayObject, key: string, fallback: boolean) {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function readString(config: GameplayObject, key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function wrapProgress(value: number) {
  return ((value % 1) + 1) % 1;
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function createInitialPathState(config: GameplayObject): PathMotionState {
  const reverse = readBoolean(config, "reverse", false);
  const loop = readBoolean(config, "loop", false);

  return {
    active: readBoolean(config, "active", false),
    direction: reverse && !loop ? -1 : 1,
    paused: false,
    progress: reverse && !loop ? 1 : 0
  };
}

export function buildPathPreviewMap(paths: ScenePathDefinition[] | undefined): Map<string, WaypointPath> {
  const map = new Map<string, WaypointPath>();

  for (const definition of paths ?? []) {
    const id = definition.id?.trim();
    if (!id) {
      continue;
    }

    map.set(id, createWaypointPath(definition.points ?? [], definition.loop ?? false));
  }

  return map;
}

export function getEntityPathMoverHook(entity: Entity) {
  return (entity.hooks ?? []).find((hook) => hook.type === "path_mover" && hook.enabled !== false);
}

export function entityUsesViewportPathMotion(entity: Entity): boolean {
  const hook = getEntityPathMoverHook(entity);
  return Boolean(hook && readString(hook.config, "pathId", "").trim().length > 0);
}

type RegisterPathInner = (entityId: string, object: Object3D | null) => void;

export const PathMotionInnerRegisterContext = createContext<RegisterPathInner>(() => {});

export function ViewportNpcPathMotionRoot({
  children,
  entities,
  pathDefinitions,
  physicsPlayback,
  previewStepTick
}: {
  children: ReactNode;
  entities: Entity[];
  pathDefinitions: ScenePathDefinition[] | undefined;
  physicsPlayback: "paused" | "running" | "stopped";
  previewStepTick: number;
}) {
  const innerTargetsRef = useRef(new Map<string, Object3D>());
  const pathStatesRef = useRef(new Map<string, PathMotionState>());
  const previousPlaybackRef = useRef(physicsPlayback);
  const previousStepTickRef = useRef(previewStepTick);

  const pathMap = useMemo(() => buildPathPreviewMap(pathDefinitions), [pathDefinitions]);

  const registerInnerTarget = useCallback<RegisterPathInner>((entityId, object) => {
    if (object) {
      innerTargetsRef.current.set(entityId, object);
    } else {
      innerTargetsRef.current.delete(entityId);
    }
  }, []);

  useEffect(() => {
    if (previousPlaybackRef.current !== "stopped" && physicsPlayback === "stopped") {
      pathStatesRef.current.clear();
      innerTargetsRef.current.forEach((obj) => {
        obj.position.set(0, 0, 0);
      });
    }

    previousPlaybackRef.current = physicsPlayback;
  }, [physicsPlayback]);

  useFrame((_, delta) => {
    if (physicsPlayback === "stopped") {
      return;
    }

    let deltaSeconds: number;

    if (physicsPlayback === "running") {
      deltaSeconds = delta;
    } else {
      if (previousStepTickRef.current === previewStepTick) {
        return;
      }

      previousStepTickRef.current = previewStepTick;
      deltaSeconds = 1 / 60;
    }

    for (const entity of entities) {
      if (!entityUsesViewportPathMotion(entity)) {
        continue;
      }

      const hook = getEntityPathMoverHook(entity)!;
      const pathId = readString(hook.config, "pathId", "").trim();
      const path = pathMap.get(pathId);
      const motionRoot = innerTargetsRef.current.get(entity.id);

      if (!path || !motionRoot) {
        continue;
      }

      let state = pathStatesRef.current.get(entity.id);
      if (!state) {
        state = createInitialPathState(hook.config as GameplayObject);
        pathStatesRef.current.set(entity.id, state);
      }

      const applyOffsetForProgress = (progressValue: number) => {
        const origin = path.sample(0);
        const sample = path.sample(clampProgress(progressValue));
        const offset = subVec3(sample, origin);
        motionRoot.position.set(offset.x, offset.y, offset.z);
      };

      if (!state.active || state.paused) {
        applyOffsetForProgress(state.progress);
        continue;
      }

      const speed = Math.max(0.001, readNumber(hook.config, "speed", 0.1));
      const pathLength = Math.max(0.000001, path.length ?? 1);
      const loopEnabled = readBoolean(hook.config, "loop", path.loop ?? false);
      const pingPong = loopEnabled && readBoolean(hook.config, "reverse", false);
      state.progress += (deltaSeconds * speed * state.direction) / pathLength;

      if (pingPong) {
        if (state.progress >= 1) {
          state.progress = 1;
          state.direction = -1;
        } else if (state.progress <= 0) {
          state.progress = 0;
          state.direction = 1;
        }
      } else if (loopEnabled) {
        state.progress = wrapProgress(state.progress);
      } else if (state.progress >= 1 || state.progress <= 0) {
        state.progress = clampProgress(state.progress);

        if (readBoolean(hook.config, "stopAtEnd", true)) {
          state.active = false;
        }
      }

      applyOffsetForProgress(state.progress);
    }
  });

  return (
    <PathMotionInnerRegisterContext.Provider value={registerInnerTarget}>{children}</PathMotionInnerRegisterContext.Provider>
  );
}

export function usePathMotionInnerRegister(): RegisterPathInner {
  return useContext(PathMotionInnerRegisterContext);
}

import { Euler, Quaternion } from "three";
import {
  localizeTransform,
  makeTransform,
  resolveSceneGraph,
  vec3,
  type Entity,
  type GeometryNode,
  type SceneHook,
  type Transform
} from "@blud/shared";
import type {
  CustomScriptCapability,
  CustomScriptEngineApi,
  CustomScriptHostServices,
  CustomScriptHookConfig,
  CustomScriptInstance,
  CustomScriptModule,
  CustomScriptNodeApi
} from "./types";

type RuntimeTarget = {
  hook: SceneHook;
  target: Entity | GeometryNode;
  targetId: string;
  targetKind: "entity" | "node";
};

type ActiveScript = {
  dispose: () => void;
  hookId: string;
  instance: CustomScriptInstance;
};

const moduleCache = new Map<string, CustomScriptModule>();

export type CustomScriptController = {
  reload: () => void;
  start: () => void;
  stop: () => void;
  update: (deltaSeconds: number) => void;
};

export function createCustomScriptController(host: CustomScriptHostServices): CustomScriptController {
  const targets = buildRuntimeTargets(host.nodes, host.entities);
  let activeScripts: ActiveScript[] = [];
  let started = false;

  const bootScripts = () => {
    activeScripts = targets.flatMap((target) => {
      if (target.hook.enabled === false || target.hook.type !== "custom_script") {
        return [];
      }

      const config = readCustomScriptHookConfig(target.hook);

      if (!config?.source) {
        return [];
      }

      try {
        const module = compileCustomScriptModule(config.source);
        const instance = instantiateCustomScript(module);

        if (!instance) {
          return [];
        }

        const engine = createEngineApi(host, target, config.capabilities ?? []);
        const nodeApi = createNodeApi(host, target.targetId, target.targetKind);
        instance.onInit?.(nodeApi, engine);

        return [
          {
            dispose: () => {
              try {
                instance.onDispose?.();
              } catch (error) {
                host.log?.("error", "custom_script onDispose failed.", error);
              }
            },
            hookId: target.hook.id,
            instance
          }
        ];
      } catch (error) {
        host.log?.("error", `Failed to compile custom_script "${target.hook.id}".`, error);
        return [];
      }
    });
  };

  return {
    reload() {
      if (started) {
        activeScripts.forEach((script) => script.dispose());
      }

      bootScripts();
    },
    start() {
      if (started) {
        return;
      }

      bootScripts();
      started = true;
    },
    stop() {
      if (!started) {
        return;
      }

      activeScripts.forEach((script) => script.dispose());
      activeScripts = [];
      started = false;
    },
    update(deltaSeconds) {
      if (!started) {
        return;
      }

      activeScripts.forEach((script) => {
        try {
          script.instance.onTick?.(deltaSeconds);
        } catch (error) {
          host.log?.("error", `custom_script "${script.hookId}" failed during onTick.`, error);
        }
      });
    }
  };
}

export function createMutableSceneHostState(nodes: GeometryNode[], entities: Entity[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, structuredClone(node)] as const));
  const entityMap = new Map(entities.map((entity) => [entity.id, structuredClone(entity)] as const));
  let sceneGraph = resolveSceneGraph(nodeMap.values(), entityMap.values());

  const refreshSceneGraph = () => {
    sceneGraph = resolveSceneGraph(nodeMap.values(), entityMap.values());
  };

  return {
    getLocalTransform(targetId: string) {
      return structuredClone(nodeMap.get(targetId)?.transform ?? entityMap.get(targetId)?.transform);
    },
    getWorldTransform(targetId: string) {
      return structuredClone(sceneGraph.nodeWorldTransforms.get(targetId) ?? sceneGraph.entityWorldTransforms.get(targetId));
    },
    setLocalTransform(targetId: string, transform: Transform) {
      const node = nodeMap.get(targetId);

      if (node) {
        node.transform = structuredClone(transform);
        refreshSceneGraph();
        return;
      }

      const entity = entityMap.get(targetId);

      if (entity) {
        entity.transform = structuredClone(transform);
        refreshSceneGraph();
      }
    },
    setWorldTransform(targetId: string, transform: Transform) {
      const parentId = nodeMap.get(targetId)?.parentId ?? entityMap.get(targetId)?.parentId;
      const parentWorld = parentId
        ? sceneGraph.nodeWorldTransforms.get(parentId) ?? sceneGraph.entityWorldTransforms.get(parentId)
        : undefined;

      this.setLocalTransform(targetId, localizeTransform(transform, parentWorld));
    }
  };
}

function buildRuntimeTargets(nodes: GeometryNode[], entities: Entity[]): RuntimeTarget[] {
  const nodeTargets = nodes.flatMap((node) =>
    (node.hooks ?? []).map((hook) => ({
      hook,
      target: node,
      targetId: node.id,
      targetKind: "node" as const
    }))
  );
  const entityTargets = entities.flatMap((entity) =>
    (entity.hooks ?? []).map((hook) => ({
      hook,
      target: entity,
      targetId: entity.id,
      targetKind: "entity" as const
    }))
  );

  return [...nodeTargets, ...entityTargets];
}

function createEngineApi(
  host: CustomScriptHostServices,
  runtimeTarget: RuntimeTarget,
  requestedCapabilities: CustomScriptCapability[]
): CustomScriptEngineApi {
  const capabilities = new Set<CustomScriptCapability>(requestedCapabilities);

  const engine: CustomScriptEngineApi = {
    events: {
      emit: (input) => {
        host.emitEvent?.({
          ...input,
          sourceId: runtimeTarget.targetId
        });
      },
      on: (filter, listener) => host.onEvent?.(filter, listener) ?? (() => {})
    },
    scene: {
      getNode: (id) => {
        const target = host.nodes.find((node) => node.id === id) ?? host.entities.find((entity) => entity.id === id);

        if (!target) {
          return undefined;
        }

        return createNodeApi(host, target.id, "kind" in target ? "node" : "entity");
      }
    }
  };

  if (capabilities.has("assets") && host.assets) {
    engine.assets = host.assets;
  }

  if (capabilities.has("input") && host.input) {
    engine.input = host.input;
  }

  if (capabilities.has("overlay") && host.overlay) {
    engine.overlay = host.overlay;
  }

  if (capabilities.has("physics") && host.physics) {
    engine.physics = host.physics;
  }

  if (host.log) {
    engine.log = host.log;
  }

  return engine;
}

function createNodeApi(host: CustomScriptHostServices, targetId: string, targetKind: "entity" | "node"): CustomScriptNodeApi {
  const target = host.nodes.find((node) => node.id === targetId) ?? host.entities.find((entity) => entity.id === targetId);

  return {
    getChildByName(name) {
      const child =
        host.nodes.find((node) => node.parentId === targetId && node.name === name) ??
        host.entities.find((entity) => entity.parentId === targetId && entity.name === name);

      if (!child) {
        return undefined;
      }

      return createNodeApi(host, child.id, "kind" in child ? "node" : "entity");
    },
    getLocalPosition() {
      return structuredClone(host.getLocalTransform(targetId)?.position ?? vec3(0, 0, 0));
    },
    getName() {
      return target?.name ?? targetId;
    },
    getWorldPosition() {
      return structuredClone(host.getWorldTransform(targetId)?.position ?? vec3(0, 0, 0));
    },
    getWorldRotation() {
      return transformToQuaternion(host.getWorldTransform(targetId) ?? makeTransform());
    },
    id: targetId,
    kind: targetKind,
    setLocalPosition(x, y, z) {
      const current = host.getLocalTransform(targetId) ?? makeTransform();
      host.setLocalTransform(targetId, {
        ...current,
        position: vec3(x, y, z)
      });
    },
    setLocalRotation(x, y, z, w) {
      const current = host.getLocalTransform(targetId) ?? makeTransform();
      host.setLocalTransform(targetId, {
        ...current,
        rotation: resolveRotationInput(x, y, z, w)
      });
    },
    setWorldPosition(x, y, z) {
      const current = host.getWorldTransform(targetId) ?? makeTransform();
      host.setWorldTransform(targetId, {
        ...current,
        position: vec3(x, y, z)
      });
    },
    setWorldRotation(x, y, z, w) {
      const current = host.getWorldTransform(targetId) ?? makeTransform();
      host.setWorldTransform(targetId, {
        ...current,
        rotation: resolveRotationInput(x, y, z, w)
      });
    }
  };
}

function transformToQuaternion(transform: Transform) {
  const quaternion = new Quaternion().setFromEuler(
    new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ")
  );

  return {
    w: quaternion.w,
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z
  };
}

function resolveRotationInput(x: number, y: number, z: number, w?: number) {
  if (typeof w === "number") {
    const rotation = new Euler().setFromQuaternion(new Quaternion(x, y, z, w), "XYZ");
    return vec3(rotation.x, rotation.y, rotation.z);
  }

  return vec3(x, y, z);
}

function readCustomScriptHookConfig(hook: SceneHook) {
  return hook.config as unknown as CustomScriptHookConfig;
}

function compileCustomScriptModule(source: string) {
  const cached = moduleCache.get(source);

  if (cached) {
    return cached;
  }

  const rewrittenSource = source.includes("export default")
    ? source.replace(/export\s+default\s+/, "return ")
    : `${source}\nreturn undefined;`;
  const factory = new Function(`"use strict";\n${rewrittenSource}`);
  const module = { default: factory() } satisfies CustomScriptModule;
  moduleCache.set(source, module);
  return module;
}

function instantiateCustomScript(module: CustomScriptModule) {
  if (!module.default) {
    return undefined;
  }

  if (typeof module.default === "function") {
    return new module.default();
  }

  return module.default;
}

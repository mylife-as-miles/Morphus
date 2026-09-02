import { describe, expect, test } from "bun:test";
import { makeTransform, vec3, type Entity, type GeometryNode } from "@blud/shared";
import { createGameplayRuntime } from "@blud/gameplay-runtime";
import { createCustomScriptController, createMutableSceneHostState } from "./controller";
import { createCustomScriptSystemDefinition } from "./gameplay-system";

const source = `
  export default class TestScript {
    onInit(node, engine) {
      this.node = node;
      this.engine = engine;
      this.child = node.getChildByName("Wheel FL");
      this.engine.events.emit({ event: "script.ready" });
    }

    onTick(dt) {
      if (this.engine.input?.isKeyDown("KeyW")) {
        this.node.setWorldPosition(dt * 10, 2, 3);
      }

      if (this.child) {
        this.child.setLocalPosition(1, 2, 3);
      }
    }

    onDispose() {
      this.engine.log?.("info", "disposed");
    }
  }
`;

const nodes: GeometryNode[] = [
  {
    data: {},
    hooks: [
      {
        config: {
          capabilities: ["events", "input", "logging", "scene"],
          runtime: "blob.custom_script.v1",
          source
        },
        id: "hook:script",
        type: "custom_script"
      }
    ],
    id: "node:vehicle",
    kind: "group",
    name: "Vehicle",
    transform: makeTransform(vec3(0, 0, 0))
  },
  {
    data: {
      role: "prop",
      shape: "cube",
      size: vec3(1, 1, 1)
    },
    id: "node:wheel-fl",
    kind: "primitive",
    name: "Wheel FL",
    parentId: "node:vehicle",
    transform: makeTransform(vec3(0, 0, 0))
  }
];

describe("runtime-scripting", () => {
  test("runs lifecycle hooks with a mutable preview-style host", () => {
    const state = createMutableSceneHostState(nodes, []);
    const events: string[] = [];
    const logs: string[] = [];
    const controller = createCustomScriptController({
      emitEvent: (event) => {
        events.push(event.event);
      },
      entities: [],
      getLocalTransform: (targetId) => state.getLocalTransform(targetId),
      getWorldTransform: (targetId) => state.getWorldTransform(targetId),
      input: {
        isKeyDown: (key) => key === "KeyW"
      },
      log: (_level, message) => {
        logs.push(message);
      },
      nodes,
      onEvent: () => () => {},
      setLocalTransform: (targetId, transform) => state.setLocalTransform(targetId, transform),
      setWorldTransform: (targetId, transform) => state.setWorldTransform(targetId, transform)
    });

    controller.start();
    controller.update(0.5);
    controller.stop();

    expect(events).toContain("script.ready");
    expect(state.getWorldTransform("node:vehicle")?.position.x).toBeCloseTo(5, 5);
    expect(state.getLocalTransform("node:wheel-fl")?.position.y).toBe(2);
    expect(logs).toContain("disposed");
  });

  test("runs custom_script hooks through gameplay-runtime system definitions", () => {
    const runtime = createGameplayRuntime({
      scene: {
        entities: [] satisfies Entity[],
        nodes
      },
      systems: [
        createCustomScriptSystemDefinition(() => ({
          input: {
            isKeyDown: (key) => key === "KeyW"
          },
          log: () => undefined,
          physics: {
            world: { label: "test-world" }
          }
        }))
      ]
    });
    const events: string[] = [];

    runtime.onEvent((event) => {
      events.push(event.event);
    });
    runtime.start();
    runtime.update(0.2);

    expect(events).toContain("script.ready");
    expect(runtime.getNodeWorldTransform("node:vehicle")?.position.x).toBeCloseTo(2, 5);

    runtime.stop();
  });
});

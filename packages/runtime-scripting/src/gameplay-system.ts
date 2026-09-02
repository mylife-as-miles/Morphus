import { localizeTransform, type Transform } from "@blud/shared";
import type { GameplayRuntimeSystemContext, GameplayRuntimeSystemDefinition } from "@blud/gameplay-runtime";
import { createCustomScriptController } from "./controller";
import type { CustomScriptEventFilter, CustomScriptEventRecord, CustomScriptHostServices } from "./types";

export function createCustomScriptSystemDefinition(
  createServices?: (
    context: GameplayRuntimeSystemContext
  ) => Omit<
    CustomScriptHostServices,
    "entities" | "getLocalTransform" | "getWorldTransform" | "nodes" | "setLocalTransform" | "setWorldTransform"
  >
): GameplayRuntimeSystemDefinition {
  return {
    create(context) {
      const sharedServices = createServices?.(context);
      const controller = createCustomScriptController({
        ...sharedServices,
        emitEvent: (input) => {
          context.emitEvent({
            event: input.event,
            payload: input.payload,
            sourceId: input.sourceId,
            sourceKind: "system",
            targetId: input.targetId
          });
        },
        entities: Array.from(context.scene.entitiesById.values()),
        getLocalTransform: (targetId) => context.getTargetLocalTransform(targetId),
        getWorldTransform: (targetId) => context.getTargetWorldTransform(targetId),
        nodes: Array.from(context.scene.nodesById.values()),
        onEvent: (filter: CustomScriptEventFilter, listener: (event: CustomScriptEventRecord) => void) =>
          context.eventBus.subscribe(
            {
              event: filter.event,
              sourceId: filter.sourceId,
              targetId: filter.targetId
            },
            (event) => {
              listener({
                event: event.event,
                payload: event.payload,
                sourceId: event.sourceId,
                targetId: event.targetId
              });
            }
          ),
        setLocalTransform: (targetId, transform) => context.setTargetLocalTransform(targetId, transform),
        setWorldTransform: (targetId, transform: Transform) => {
          const target = context.getNode(targetId) ?? context.getEntity(targetId);
          const parentWorld = target?.parentId ? context.getTargetWorldTransform(target.parentId) : undefined;
          context.setTargetLocalTransform(targetId, localizeTransform(transform, parentWorld));
        }
      });

      return {
        start() {
          controller.start();
        },
        stop() {
          controller.stop();
        },
        update(deltaSeconds) {
          controller.update(deltaSeconds);
        }
      };
    },
    description: "Runs importer-generated custom_script hooks with host-injected services.",
    hookTypes: ["custom_script"],
    id: "custom_script",
    label: "CustomScriptSystem"
  };
}

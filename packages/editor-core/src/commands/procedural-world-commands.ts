import type { ProceduralWorldNode, ProceduralWorldNodeData } from "@blud/shared";
import type { Command } from "./command-stack";

export function createProceduralWorldNodeCommand(node: ProceduralWorldNode): Command {
  const snapshot = structuredClone(node);
  return {
    label: "Create procedural world",
    execute(scene) {
      scene.addNode(structuredClone(snapshot));
    },
    undo(scene) {
      scene.removeNode(snapshot.id);
    }
  };
}

export function updateProceduralWorldNodeCommand(
  nodeId: string,
  previousData: ProceduralWorldNodeData,
  nextData: ProceduralWorldNodeData,
  label = "Configure procedural world"
): Command {
  const before = structuredClone(previousData);
  const after = structuredClone(nextData);
  const apply = (scene: Parameters<Command["execute"]>[0], data: ProceduralWorldNodeData) => {
    const node = scene.getNode(nodeId);
    if (!node || node.kind !== "procedural-world") return;
    scene.nodes.set(nodeId, { ...node, data: structuredClone(data) });
    scene.touch();
  };
  return {
    label,
    execute(scene) {
      apply(scene, after);
    },
    undo(scene) {
      apply(scene, before);
    }
  };
}

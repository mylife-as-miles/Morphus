import type {
  MeshTerrainState,
  NodeID,
  TerrainModifier,
  TerrainNode
} from "@blud/shared";
import { createDefaultTerrainNodeData, makeTransform } from "@blud/shared";
import type { SceneDocument } from "../document/scene-document";
import type { Command } from "./command-stack";

/**
 * Undoable edits to a mesh terrain node's authoring stack.
 *
 * Ordering is the load-bearing part of this file. A brush stroke records the
 * dabs it deposited against the surface as that surface stood when the stroke
 * was drawn, so replaying it over a different surface is a different edit --
 * not the one the user made. `sequence` is what pins that order down, and every
 * command here either preserves the sequence of the slots it touches or
 * renumbers the whole list deliberately. Undo restores the exact prior order,
 * never merely the prior set.
 *
 * Every command publishes a *new* `MeshTerrainState` object rather than
 * mutating the one in the document. That invariant is what lets the previous
 * state be captured by reference at execute time instead of deep-cloned:
 * whatever is holding the old object is holding a snapshot. Values supplied by
 * callers are cloned on the way in, so a caller cannot retain a live handle to
 * what lands in the document.
 */

// --- Node ------------------------------------------------------------------

/**
 * A fresh mesh terrain node, ready to hand to `createTerrainNodeCommand`.
 *
 * Separate from the command so a caller can hold on to the id it will need for
 * selection, exactly as the procedural-world flow does.
 */
export function createMeshTerrainNode(options?: {
  id?: NodeID;
  name?: string;
  parentId?: NodeID;
  seed?: number;
}): TerrainNode {
  return {
    data: createDefaultTerrainNodeData("mesh", options?.seed ?? 1),
    id: options?.id ?? `node:terrain:${crypto.randomUUID()}`,
    kind: "terrain",
    name: options?.name ?? "Mesh Terrain",
    ...(options?.parentId ? { parentId: options.parentId } : {}),
    transform: makeTransform()
  };
}

export function createTerrainNodeCommand(node: TerrainNode, label = "Create terrain"): Command {
  const snapshot = structuredClone(node);
  return {
    label,
    execute(scene) {
      scene.addNode(structuredClone(snapshot));
    },
    undo(scene) {
      scene.removeNode(snapshot.id);
    }
  };
}

// --- Modifier stack --------------------------------------------------------

/**
 * Appends one modifier to the end of the authored order.
 *
 * One call per gesture: a whole brush stroke -- however many dabs it deposited
 * -- arrives here as a single modifier and therefore a single undo entry.
 */
export function appendTerrainModifierCommand(
  nodeId: NodeID,
  modifier: TerrainModifier,
  label = defaultModifierLabel(modifier)
): Command {
  const snapshot = structuredClone(modifier);

  return {
    label,
    execute(scene) {
      const state = readMeshTerrain(scene, nodeId);

      if (!state) {
        return;
      }

      const appended = structuredClone(snapshot);
      appended.sequence = nextSequence(state.modifiers);
      writeModifiers(scene, nodeId, state, [...state.modifiers, appended]);
    },
    undo(scene) {
      const state = readMeshTerrain(scene, nodeId);

      if (!state) {
        return;
      }

      const modifiers = state.modifiers.filter((entry) => entry.id !== snapshot.id);

      if (modifiers.length === state.modifiers.length) {
        return;
      }

      writeModifiers(scene, nodeId, state, modifiers);
    }
  };
}

/**
 * Replaces one modifier's payload, leaving it where it is in the order.
 *
 * Changing a stroke's radius must not move it past the strokes drawn after it,
 * so the slot's existing `sequence` wins over whatever the replacement carries.
 */
export function updateTerrainModifierCommand(
  nodeId: NodeID,
  modifierId: string,
  nextModifier: TerrainModifier,
  label = "Update terrain modifier"
): Command {
  const snapshot = structuredClone(nextModifier);
  let previous: TerrainModifier | undefined;

  return {
    label,
    execute(scene) {
      const state = readMeshTerrain(scene, nodeId);

      if (!state) {
        return;
      }

      const index = state.modifiers.findIndex((entry) => entry.id === modifierId);

      if (index === -1) {
        return;
      }

      previous = state.modifiers[index];

      const replacement = structuredClone(snapshot);
      replacement.id = modifierId;
      replacement.sequence = previous.sequence;

      const modifiers = state.modifiers.slice();
      modifiers[index] = replacement;
      writeModifiers(scene, nodeId, state, modifiers);
    },
    undo(scene) {
      const restored = previous;
      const state = readMeshTerrain(scene, nodeId);

      if (!restored || !state) {
        return;
      }

      const index = state.modifiers.findIndex((entry) => entry.id === modifierId);

      if (index === -1) {
        return;
      }

      const modifiers = state.modifiers.slice();
      modifiers[index] = restored;
      writeModifiers(scene, nodeId, state, modifiers);
    }
  };
}

export function setTerrainModifierEnabledCommand(
  nodeId: NodeID,
  modifierId: string,
  enabled: boolean,
  label = enabled ? "Enable terrain modifier" : "Disable terrain modifier"
): Command {
  return enabledCommand(nodeId, modifierId, label, () => enabled);
}

export function toggleTerrainModifierEnabledCommand(
  nodeId: NodeID,
  modifierId: string,
  label = "Toggle terrain modifier"
): Command {
  return enabledCommand(nodeId, modifierId, label, (current) => !current);
}

/**
 * Removes one modifier, remembering where it sat.
 *
 * Undo splices it back into the same index with the same `sequence`, so the
 * strokes that were drawn after it still evaluate after it.
 */
export function deleteTerrainModifierCommand(
  nodeId: NodeID,
  modifierId: string,
  label = "Delete terrain modifier"
): Command {
  let removed: TerrainModifier | undefined;
  let removedIndex = -1;

  return {
    label,
    execute(scene) {
      const state = readMeshTerrain(scene, nodeId);

      if (!state) {
        return;
      }

      const index = state.modifiers.findIndex((entry) => entry.id === modifierId);

      if (index === -1) {
        return;
      }

      removed = state.modifiers[index];
      removedIndex = index;

      const modifiers = state.modifiers.slice();
      modifiers.splice(index, 1);
      writeModifiers(scene, nodeId, state, modifiers);
    },
    undo(scene) {
      const restored = removed;
      const state = readMeshTerrain(scene, nodeId);

      if (!restored || removedIndex === -1 || !state) {
        return;
      }

      const modifiers = state.modifiers.slice();
      modifiers.splice(Math.min(removedIndex, modifiers.length), 0, restored);
      writeModifiers(scene, nodeId, state, modifiers);
    }
  };
}

/**
 * Moves one modifier to a new position in the authored order.
 *
 * Reordering is the one edit that is *meant* to change evaluation order, so it
 * renumbers `sequence` across the whole list to match the new array order.
 * Undo puts back both the array order and the exact prior sequence numbers --
 * restoring the array alone would leave every stroke carrying a number that no
 * longer agrees with its slot, and the stack sorts on the number.
 */
export function reorderTerrainModifierCommand(
  nodeId: NodeID,
  modifierId: string,
  targetIndex: number,
  label = "Reorder terrain modifier"
): Command {
  let previousOrder: { id: string; sequence?: number }[] | undefined;

  return {
    label,
    execute(scene) {
      const state = readMeshTerrain(scene, nodeId);

      if (!state) {
        return;
      }

      const fromIndex = state.modifiers.findIndex((entry) => entry.id === modifierId);

      if (fromIndex === -1) {
        return;
      }

      const toIndex = Math.max(0, Math.min(targetIndex, state.modifiers.length - 1));

      if (toIndex === fromIndex) {
        return;
      }

      previousOrder = state.modifiers.map((entry) => ({ id: entry.id, sequence: entry.sequence }));

      const modifiers = state.modifiers.slice();
      const [moved] = modifiers.splice(fromIndex, 1);
      modifiers.splice(toIndex, 0, moved);
      writeModifiers(scene, nodeId, state, resequence(modifiers));
    },
    undo(scene) {
      const order = previousOrder;
      const state = readMeshTerrain(scene, nodeId);

      if (!order || !state) {
        return;
      }

      const byId = new Map(state.modifiers.map((entry) => [entry.id, entry] as const));
      const modifiers: TerrainModifier[] = [];

      for (const slot of order) {
        const entry = byId.get(slot.id);

        if (!entry) {
          continue;
        }

        byId.delete(slot.id);
        modifiers.push({ ...entry, sequence: slot.sequence } as TerrainModifier);
      }

      // Anything the recorded order did not mention was added after this
      // command ran; it keeps its own sequence and stays at the end.
      for (const entry of byId.values()) {
        modifiers.push(entry);
      }

      writeModifiers(scene, nodeId, state, modifiers);
    }
  };
}

// --- Whole-state edits -----------------------------------------------------

/**
 * Swaps the entire `MeshTerrainState`.
 *
 * The escape hatch for edits that are not a single stack operation -- material
 * channels, world size, seed, profile, LOD count -- and for anything an
 * inspector prefers to express as "here is the new state".
 */
export function replaceMeshTerrainStateCommand(
  nodeId: NodeID,
  nextState: MeshTerrainState,
  label = "Configure mesh terrain"
): Command {
  const snapshot = structuredClone(nextState);
  let previous: MeshTerrainState | undefined;
  let previousMode: TerrainNode["data"]["mode"];
  let hadNode = false;

  return {
    label,
    execute(scene) {
      const node = readTerrainNode(scene, nodeId);

      if (!node) {
        hadNode = false;
        return;
      }

      hadNode = true;
      previous = node.data.meshTerrain;
      previousMode = node.data.mode;
      writeTerrainData(scene, node, "mesh", structuredClone(snapshot));
    },
    undo(scene) {
      const node = readTerrainNode(scene, nodeId);

      if (!hadNode || !node) {
        return;
      }

      writeTerrainData(scene, node, previousMode, previous);
    }
  };
}

// --- Internals -------------------------------------------------------------

function enabledCommand(
  nodeId: NodeID,
  modifierId: string,
  label: string,
  resolve: (current: boolean) => boolean
): Command {
  let previous: boolean | undefined;

  return {
    label,
    execute(scene) {
      const state = readMeshTerrain(scene, nodeId);

      if (!state) {
        return;
      }

      const index = state.modifiers.findIndex((entry) => entry.id === modifierId);

      if (index === -1) {
        return;
      }

      const entry = state.modifiers[index];
      previous = entry.enabled;

      const next = resolve(entry.enabled);

      if (next === entry.enabled) {
        return;
      }

      const modifiers = state.modifiers.slice();
      modifiers[index] = { ...entry, enabled: next } as TerrainModifier;
      writeModifiers(scene, nodeId, state, modifiers);
    },
    undo(scene) {
      const restored = previous;
      const state = readMeshTerrain(scene, nodeId);

      if (restored === undefined || !state) {
        return;
      }

      const index = state.modifiers.findIndex((entry) => entry.id === modifierId);

      if (index === -1) {
        return;
      }

      const modifiers = state.modifiers.slice();
      modifiers[index] = { ...modifiers[index], enabled: restored } as TerrainModifier;
      writeModifiers(scene, nodeId, state, modifiers);
    }
  };
}

function readTerrainNode(scene: SceneDocument, nodeId: NodeID): TerrainNode | undefined {
  const node = scene.getNode(nodeId);

  return node && node.kind === "terrain" ? node : undefined;
}

/** The authoring stack of a terrain node, or undefined if it has none. */
export function readMeshTerrainState(scene: SceneDocument, nodeId: NodeID): MeshTerrainState | undefined {
  return readTerrainNode(scene, nodeId)?.data.meshTerrain;
}

function readMeshTerrain(scene: SceneDocument, nodeId: NodeID): MeshTerrainState | undefined {
  return readMeshTerrainState(scene, nodeId);
}

function writeModifiers(
  scene: SceneDocument,
  nodeId: NodeID,
  state: MeshTerrainState,
  modifiers: TerrainModifier[]
) {
  const node = readTerrainNode(scene, nodeId);

  if (!node) {
    return;
  }

  writeTerrainData(scene, node, "mesh", { ...state, modifiers });
}

/**
 * Publishes a new terrain payload.
 *
 * The node and its `data` are spread rather than deep-cloned so the heightmap
 * and splatmap typed arrays -- which a mesh terrain never touches, and which a
 * heightmap terrain sizes in megabytes -- are carried by reference instead of
 * copied on every dab-free stack edit.
 */
function writeTerrainData(
  scene: SceneDocument,
  node: TerrainNode,
  mode: TerrainNode["data"]["mode"],
  meshTerrain: MeshTerrainState | undefined
) {
  scene.nodes.set(node.id, {
    ...node,
    data: { ...node.data, mode, meshTerrain }
  });
  scene.touch();
}

function nextSequence(modifiers: readonly TerrainModifier[]): number {
  let highest = 0;

  for (const modifier of modifiers) {
    highest = Math.max(highest, modifier.sequence ?? 0);
  }

  return highest + 1;
}

/** Renumbers `sequence` to agree with array order, 1-based. */
function resequence(modifiers: TerrainModifier[]): TerrainModifier[] {
  return modifiers.map((modifier, index) => ({ ...modifier, sequence: index + 1 }) as TerrainModifier);
}

function defaultModifierLabel(modifier: TerrainModifier): string {
  switch (modifier.type) {
    case "brush-stroke":
      return `Sculpt terrain (${modifier.mode})`;
    case "weight-paint":
      return "Paint terrain";
    case "sculpt-layer":
      return "Add sculpt layer";
    case "material-settings":
      return "Update terrain materials";
    case "noise":
      return "Add terrain noise";
    case "field-displacement":
      return "Add terrain displacement";
    case "remesh":
      return "Remesh terrain";
    case "tessellate":
      return "Tessellate terrain";
    case "boolean-subtract":
      return "Carve tunnel";
    case "boolean-volume":
      return modifier.operation === "add" ? "Add terrain volume" : "Carve terrain volume";
  }
}

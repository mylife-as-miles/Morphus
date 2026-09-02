import { createMachine } from "xstate";

/**
 * Tools that operate on ordinary scene geometry.
 *
 * `sculpt` and `brush` here are the generic mesh tools; they are unrelated to
 * the terrain brushes below, which is why the terrain set carries its own
 * prefix rather than overloading these ids.
 */
export type CoreToolId =
  | "select"
  | "transform"
  | "brush"
  | "clip"
  | "extrude"
  | "mesh-edit"
  | "sculpt"
  | "path-add"
  | "path-edit";

/**
 * Mesh-terrain authoring tools.
 *
 * These drive the ported Mesh Terrain Lab authoring core: brush strokes in
 * either domain, weight painting across the four material channels, local
 * density changes, swept tunnel CSG, and camera-directed cave digging.
 */
export type TerrainToolId =
  | "terrain-sculpt"
  | "terrain-paint"
  | "terrain-density"
  | "terrain-tunnel"
  | "terrain-dig";

/**
 * Forest authoring tools.
 *
 * A forest here is a shape on the ground, not a list of trees: `forest-field`
 * draws the spline that bounds a stand, and growing it is a separate, explicit
 * step. That split is the whole point -- dragging a control point has to stay
 * cheap, so nothing regenerates until the field is grown.
 */
export type ForestToolId = "forest-field" | "forest-paint";

export type ToolId = CoreToolId | TerrainToolId | ForestToolId;

export const terrainToolIds = [
  "terrain-sculpt",
  "terrain-paint",
  "terrain-density",
  "terrain-tunnel",
  "terrain-dig"
] as const satisfies readonly TerrainToolId[];

export function isTerrainToolId(toolId: ToolId): toolId is TerrainToolId {
  return (terrainToolIds as readonly string[]).includes(toolId);
}

export const forestToolIds = [
  "forest-field",
  "forest-paint"
] as const satisfies readonly ForestToolId[];

export function isForestToolId(toolId: ToolId): toolId is ForestToolId {
  return (forestToolIds as readonly string[]).includes(toolId);
}

export const defaultToolId: ToolId = "select";

export type ToolSession = {
  toolId: ToolId;
  machine: ReturnType<typeof createToolMachine>;
};

export function createToolMachine(toolId: ToolId) {
  return createMachine({
    id: `tool:${toolId}`,
    initial: "idle",
    states: {
      idle: {
        on: {
          HOVER: "hover",
          DRAG_START: "drag"
        }
      },
      hover: {
        on: {
          DRAG_START: "drag",
          LEAVE: "idle"
        }
      },
      drag: {
        on: {
          COMMIT: "commit",
          CANCEL: "cancel"
        }
      },
      commit: {
        always: "idle"
      },
      cancel: {
        always: "idle"
      }
    }
  });
}

export function createToolSession(toolId: ToolId): ToolSession {
  return {
    toolId,
    machine: createToolMachine(toolId)
  };
}

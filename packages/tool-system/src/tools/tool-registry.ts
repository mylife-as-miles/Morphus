import {
  isForestToolId,
  isTerrainToolId,
  type ForestToolId,
  type TerrainToolId,
  type ToolId
} from "./tool-machine";

/**
 * Which rail a tool belongs to.
 *
 * The terrain tools are a self-contained authoring mode rather than another
 * handful of generic geometry verbs, so the panels group them separately
 * instead of stretching one flat grid to fourteen entries.
 */
export type ToolGroupId = "core" | "terrain" | "forest";

export type ToolDefinition = {
  id: ToolId;
  label: string;
  group: ToolGroupId;
};

export const defaultTools: ToolDefinition[] = [
  { id: "select", label: "Select", group: "core" },
  { id: "transform", label: "Transform", group: "core" },
  { id: "clip", label: "Clip", group: "core" },
  { id: "extrude", label: "Extrude", group: "core" },
  { id: "mesh-edit", label: "Mesh Edit", group: "core" },
  { id: "sculpt", label: "Sculpt", group: "core" },
  { id: "brush", label: "Brush", group: "core" },
  { id: "path-add", label: "Add Path", group: "core" },
  { id: "path-edit", label: "Edit Path", group: "core" },
  { id: "terrain-sculpt", label: "Terrain Sculpt", group: "terrain" },
  { id: "terrain-paint", label: "Terrain Paint", group: "terrain" },
  { id: "terrain-density", label: "Terrain Density", group: "terrain" },
  { id: "terrain-tunnel", label: "Terrain Tunnel", group: "terrain" },
  { id: "terrain-dig", label: "Terrain Dig", group: "terrain" },
  { id: "forest-field", label: "Forest Field", group: "forest" },
  { id: "forest-paint", label: "Forest Paint", group: "forest" }
];

export const coreTools: ToolDefinition[] = defaultTools.filter((tool) => tool.group === "core");

export const terrainTools = defaultTools.filter(
  (tool): tool is ToolDefinition & { id: TerrainToolId } => isTerrainToolId(tool.id)
);

export const forestTools = defaultTools.filter(
  (tool): tool is ToolDefinition & { id: ForestToolId } => isForestToolId(tool.id)
);

import { proxy } from "valtio";
import type { ViewportState } from "@blud/render-pipeline";
import type {
  MeshBrushDomain,
  MeshBrushMode,
  TerrainPaintChannelId,
  TerrainPaintMode
} from "@blud/shared";
import { createEditorViewports, type ViewModeId, type ViewportPaneId } from "@/viewport/viewports";
import type { AiAssistantMode } from "@/lib/copilot/types";

export type ViewportQuality = 0.5 | 0.75 | 1 | 1.5;
export type RightPanelId = "events" | "hooks" | "inspector" | "materials" | "player" | "scene" | "surface" | "voices" | "world";

/**
 * Live settings for the mesh-terrain tools.
 *
 * These are authoring state, not document state: a stroke bakes whatever is set
 * here into the `BrushStrokeModifier` it appends, so the document keeps the
 * parameters each stroke was drawn with rather than one global brush.
 */
export type TerrainBrushState = {
  mode: MeshBrushMode;
  /** "heightfield" displaces along world Y; "mesh" along the picked normal. */
  domain: MeshBrushDomain;
  radius: number;
  strength: number;
  falloff: number;
  /** Elevation `flatten` converges toward. */
  targetY: number;
  /** Bench height for `terrace`. */
  terraceStep: number;
  /** World-space wavelength for `noise`. */
  noiseScale: number;
  noiseSeed: number;
  /** Keeps one held stroke building instead of settling on a depth. */
  accumulate: boolean;
  /** Sculpt layer new strokes are filed under, when one is active. */
  activeSculptLayerId: string | null;

  // Weight painting
  paintChannel: TerrainPaintChannelId;
  paintMode: TerrainPaintMode;
  paintRadius: number;
  paintStrength: number;
  paintFalloff: number;

  // Density (remesh / tessellate)
  /** "remesh" retopologises to an even edge length; "tessellate" only subdivides. */
  densityMode: "remesh" | "tessellate";
  densityRadius: number;
  densityTargetEdgeLength: number;

  // Swept tunnel CSG
  tunnelRadius: number;
  tunnelDepth: number;
  tunnelNoise: number;
  tunnelNoiseScale: number;

  // Camera-directed cave digging
  digRadius: number;
  digSpeed: number;
  digNoise: number;
  digNoiseScale: number;
};

/** Upstream Mesh Terrain Lab starting values, so ports feel identical. */
export function createDefaultTerrainBrushState(): TerrainBrushState {
  return {
    mode: "raise",
    domain: "mesh",
    radius: 22,
    strength: 0.38,
    falloff: 0.55,
    targetY: 0,
    terraceStep: 4,
    noiseScale: 3,
    noiseSeed: 1,
    accumulate: false,
    activeSculptLayerId: null,

    paintChannel: "channel0",
    paintMode: "add",
    paintRadius: 22,
    paintStrength: 0.38,
    paintFalloff: 0.55,

    densityMode: "remesh",
  densityRadius: 22,
    densityTargetEdgeLength: 2.5,

    tunnelRadius: 8,
    tunnelDepth: 14,
    tunnelNoise: 1,
    tunnelNoiseScale: 2.6,

    digRadius: 7,
    digSpeed: 18,
    digNoise: 0.9,
    digNoiseScale: 2.6
  };
}

type UiStore = {
  activeViewportId: ViewportPaneId;
  aiAssistantMode: AiAssistantMode;
  aiModePickerOpen: boolean;
  copilotPanelOpen: boolean;
  logicViewerOpen: boolean;
  rightPanel: RightPanelId | null;
  selectedAssetId: string;
  selectedMaterialId: string;
  terrainBrush: TerrainBrushState;
  toolsPanelOpen: boolean;
  viewMode: ViewModeId;
  viewportQuality: ViewportQuality;
  viewports: Record<ViewportPaneId, ViewportState>;
};

export const uiStore = proxy<UiStore>({
  activeViewportId: "perspective",
  aiAssistantMode: "copilot",
  aiModePickerOpen: false,
  copilotPanelOpen: false,
  logicViewerOpen: false,
  rightPanel: null,
  selectedAssetId: "",
  selectedMaterialId: "material:blockout:concrete",
  terrainBrush: createDefaultTerrainBrushState(),
  toolsPanelOpen: false,
  viewMode: "3d-only",
  viewportQuality: 0.5,
  viewports: createEditorViewports()
});

/** Single write point for the terrain brush, so callers never touch the proxy shape. */
export function setTerrainBrush<Key extends keyof TerrainBrushState>(
  key: Key,
  value: TerrainBrushState[Key]
) {
  uiStore.terrainBrush[key] = value;
}

export function resetTerrainBrush() {
  uiStore.terrainBrush = createDefaultTerrainBrushState();
}

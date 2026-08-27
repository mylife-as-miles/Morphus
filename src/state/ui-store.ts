import { proxy } from "valtio";
import type { ViewportState } from "@blud/render-pipeline";
import { createEditorViewports, type ViewModeId, type ViewportPaneId } from "@/viewport/viewports";
import type { AiAssistantMode } from "@/lib/copilot/types";

export type ViewportQuality = 0.5 | 0.75 | 1 | 1.5;
export type RightPanelId = "events" | "hooks" | "inspector" | "materials" | "player" | "scene" | "surface" | "voices" | "world";

type UiStore = {
  activeViewportId: ViewportPaneId;
  aiAssistantMode: AiAssistantMode;
  aiModePickerOpen: boolean;
  copilotPanelOpen: boolean;
  logicViewerOpen: boolean;
  rightPanel: RightPanelId | null;
  selectedAssetId: string;
  selectedMaterialId: string;
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
  toolsPanelOpen: false,
  viewMode: "3d-only",
  viewportQuality: 0.5,
  viewports: createEditorViewports()
});

import type { ComponentType, ReactNode } from "react";
import { BellRing, Cable, FolderTree, Globe2, Mic, Paintbrush, SlidersHorizontal, SwatchBook, User, Wrench, X } from "lucide-react";
import type { GridSnapValue } from "@blud/render-pipeline";
import type { BrushShape, EntityType, LightType, PrimitiveShape, SkateparkElementType } from "@blud/shared";
import { defaultTools, type ToolId } from "@blud/tool-system";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreationToolBar } from "@/components/editor-shell/CreationToolBar";
import { FloorPresetsPanel } from "@/components/editor-shell/FloorPresetsPanel";
import { MeshEditToolBars } from "@/components/editor-shell/MeshEditToolBars";
import { SculptToolBar } from "@/components/editor-shell/SculptToolBar";
import { PhysicsPlaybackControl } from "@/components/editor-shell/PhysicsPlaybackControl";
import { SnapControl } from "@/components/editor-shell/SnapControl";
import { ViewModeControl } from "@/components/editor-shell/ViewModeControl";
import { toolIconFor } from "@/components/editor-shell/icons";
import type { FloorPresetId } from "@/lib/floor-presets";
import { cn } from "@/lib/utils";
import type { RightPanelId } from "@/state/ui-store";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest, PreviewSessionMode } from "@/viewport/types";
import type { ViewModeId } from "@/viewport/viewports";

const rightPanelOptions: Array<{
  id: RightPanelId;
  label: string;
  shortLabel: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  { id: "scene", label: "Scene", shortLabel: "Scene", Icon: FolderTree },
  { id: "world", label: "World", shortLabel: "World", Icon: Globe2 },
  { id: "player", label: "Player", shortLabel: "Player", Icon: User },
  { id: "inspector", label: "Inspect", shortLabel: "Inspect", Icon: SlidersHorizontal },
  { id: "hooks", label: "Hooks", shortLabel: "Hooks", Icon: Cable },
  { id: "events", label: "Events", shortLabel: "Events", Icon: BellRing },
  { id: "materials", label: "Mats", shortLabel: "Mats", Icon: SwatchBook },
  { id: "surface", label: "Surface", shortLabel: "Surf", Icon: Paintbrush },
  { id: "voices", label: "Voices", shortLabel: "Voices", Icon: Mic }
];

type ToolsPanelProps = {
  activeBrushShape: BrushShape;
  activeRightPanel: RightPanelId | null;
  aiModelPlacementActive: boolean;
  activeToolId: ToolId;
  currentSnapSize: GridSnapValue;
  gridInfinite: boolean;
  gridSnapValues: readonly GridSnapValue[];
  meshEditMode: MeshEditMode;
  onClose: () => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onLowerTop: () => void;
  onPausePhysics: () => void;
  onResumePhysics: () => void;
  onImportGlb: () => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceFloorPreset: (presetId: FloorPresetId) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceBlockoutOpenRoom: () => void;
  onPlaceBlockoutPlatform: () => void;
  onPlaceBlockoutRoom: () => void;
  onPlaceBlockoutStairs: () => void;
  onPlaceSkateparkElement?: (type: SkateparkElementType) => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onPlayPhysics: () => void;
  onSimulatePhysics: () => void;
  onRaiseTop: () => void;
  onStepPhysics: () => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onSetRightPanel: (panel: RightPanelId | null) => void;
  onStartAiModelPlacement: () => void;
  onSelectBrushShape: (shape: BrushShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetGridInfinite: (infinite: boolean) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onTogglePreviewPossession: () => void;
  onSetToolId: (toolId: ToolId) => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetViewMode: (viewMode: ViewModeId) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  previewPossessed: boolean;
  previewSessionMode: PreviewSessionMode | null;
  sculptMode?: string | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  sculptBrushType: "draw" | "smooth" | "grab";
  sculptSymmetryX: boolean;
  onSetSculptBrushType: (type: "draw" | "smooth" | "grab") => void;
  onSetSculptSymmetryX: (enabled: boolean) => void;
  selectionEnabled: boolean;
  selectedGeometry: boolean;
  selectedMesh: boolean;
  snapEnabled: boolean;
  transformMode: "rotate" | "scale" | "translate";
  viewMode: ViewModeId;
};

export function ToolsPanel({
  activeBrushShape,
  activeRightPanel,
  aiModelPlacementActive,
  activeToolId,
  currentSnapSize,
  gridInfinite,
  gridSnapValues,
  meshEditMode,
  onClose,
  onMeshEditToolbarAction,
  onLowerTop,
  onPausePhysics,
  onResumePhysics,
  onImportGlb,
  onPlaceEntity,
  onPlaceFloorPreset,
  onPlaceLight,
  onPlaceBlockoutOpenRoom,
  onPlaceBlockoutPlatform,
  onPlaceBlockoutRoom,
  onPlaceBlockoutStairs,
  onPlaceSkateparkElement,
  onPlaceProp,
  onPlayPhysics,
  onSimulatePhysics,
  onRaiseTop,
  onStepPhysics,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onSetSculptBrushType,
  onSetSculptSymmetryX,
  onSetRightPanel,
  onStartAiModelPlacement,
  onSelectBrushShape,
  onSetMeshEditMode,
  onSetGridInfinite,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onTogglePreviewPossession,
  onSetToolId,
  onSetTransformMode,
  onSetViewMode,
  physicsPlayback,
  previewPossessed,
  previewSessionMode,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  sculptBrushType,
  sculptSymmetryX,
  selectionEnabled,
  selectedGeometry,
  selectedMesh,
  snapEnabled,
  transformMode,
  viewMode
}: ToolsPanelProps) {
  const activeTool = defaultTools.find((tool) => tool.id === activeToolId);
  const activeRightPanelLabel =
    rightPanelOptions.find((panel) => panel.id === activeRightPanel)?.label ?? "Inspector";

  return (
    <div className="editor-dock-panel flex h-full flex-col overflow-hidden rounded-[32px]">
      <div className="editor-dock-header flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
          <Wrench className="size-3.5 text-[#f6d07d]" />
          Tools
        </div>
        <div className="flex items-center gap-2">
          {activeTool ? (
            <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
              {activeTool.label}
            </span>
          ) : null}
          <Button
            className="editor-toolbar-button size-7 rounded-lg hover:translate-y-0 active:scale-100"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <PanelSection title="Tool Modes">
            <div className="grid grid-cols-2 gap-2">
              {defaultTools.map((tool) => (
                <ToolModeButton
                  active={tool.id === activeToolId}
                  key={tool.id}
                  label={tool.label}
                  onClick={() => onSetToolId(tool.id)}
                  toolId={tool.id}
                />
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Details">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-foreground/72">
                  {activeRightPanelLabel}
                </div>
                <div className="mt-1 text-[10px] text-foreground/42">
                  Scene and runtime panels
                </div>
              </div>
              <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
                {selectionEnabled ? "Editable" : "Sim"}
              </span>
            </div>

            <div className="editor-toolbar-segment grid grid-cols-4 gap-1.5 rounded-[16px] p-1.5">
              {rightPanelOptions.map(({ id, shortLabel, Icon }) => (
                <button
                  className={cn(
                    "editor-toolbar-button flex flex-col items-center justify-center gap-1 rounded-[10px] border px-1 py-2 text-center transition-colors duration-150",
                    activeRightPanel === id && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  key={id}
                  onClick={() => onSetRightPanel(activeRightPanel === id ? null : id)}
                  type="button"
                >
                  <Icon className="size-3.5" />
                  <span className="text-[0.52rem] font-semibold tracking-[0.08em] text-inherit uppercase">
                    {shortLabel}
                  </span>
                </button>
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Viewport">
            <div className="flex flex-col gap-2">
              <ViewModeControl currentViewMode={viewMode} onSetViewMode={onSetViewMode} />
              <SnapControl
                currentSnapSize={currentSnapSize}
                gridInfinite={gridInfinite}
                gridSnapValues={gridSnapValues}
                onSetGridInfinite={onSetGridInfinite}
                onSetSnapEnabled={onSetSnapEnabled}
                onSetSnapSize={onSetSnapSize}
                snapEnabled={snapEnabled}
              />
              <PhysicsPlaybackControl
                mode={physicsPlayback}
                onPause={onPausePhysics}
                onPlay={onPlayPhysics}
                onResume={onResumePhysics}
                onSimulate={onSimulatePhysics}
                onStep={onStepPhysics}
                onStop={onStopPhysics}
                onTogglePossession={onTogglePreviewPossession}
                previewPossessed={previewPossessed}
                previewSessionMode={previewSessionMode}
              />
              <FloorPresetsPanel disabled={physicsPlayback !== "stopped"} onPlaceFloorPreset={onPlaceFloorPreset} />
            </div>
          </PanelSection>

          <PanelSection title="Active Tool">
            {activeToolId === "brush" ? (
              <div className="overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                <CreationToolBar
                  activeBrushShape={activeBrushShape}
                  aiModelPlacementActive={aiModelPlacementActive}
                  activeToolId={activeToolId}
                  disabled={physicsPlayback !== "stopped"}
                  onImportGlb={onImportGlb}
                  onPlaceEntity={onPlaceEntity}
                  onPlaceLight={onPlaceLight}
                  onPlaceBlockoutOpenRoom={onPlaceBlockoutOpenRoom}
                  onPlaceBlockoutPlatform={onPlaceBlockoutPlatform}
                  onPlaceBlockoutRoom={onPlaceBlockoutRoom}
                  onPlaceBlockoutStairs={onPlaceBlockoutStairs}
                  onPlaceSkateparkElement={onPlaceSkateparkElement}
                  onPlaceProp={onPlaceProp}
                  onStartAiModelPlacement={onStartAiModelPlacement}
                  onSelectBrushShape={onSelectBrushShape}
                />
              </div>
            ) : null}

            {activeToolId === "mesh-edit" ? (
              <div className="overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                <MeshEditToolBars
                  meshEditMode={meshEditMode}
                  onArc={() => onMeshEditToolbarAction("arc")}
                  onBevel={() => onMeshEditToolbarAction("bevel")}
                  onBridge={() => onMeshEditToolbarAction("bridge")}
                  onCut={() => onMeshEditToolbarAction("cut")}
                  onDeflate={() => onMeshEditToolbarAction("deflate")}
                  onDelete={() => onMeshEditToolbarAction("delete")}
                  onExtrude={() => onMeshEditToolbarAction("extrude")}
                  onFillFace={() => onMeshEditToolbarAction("fill-face")}
                  onInflate={() => onMeshEditToolbarAction("inflate")}
                  onInset={() => onMeshEditToolbarAction("inset")}
                  onInvertNormals={() => onMeshEditToolbarAction("invert-normals")}
                  onLowerTop={onLowerTop}
                  onMerge={() => onMeshEditToolbarAction("merge")}
                  onMirrorX={() => onMeshEditToolbarAction("mirror-x")}
                  onPoke={() => onMeshEditToolbarAction("poke")}
                  onQuadrangulate={() => onMeshEditToolbarAction("quadrangulate")}
                  onRaiseTop={onRaiseTop}
                  onSetMeshEditMode={onSetMeshEditMode}
                  onSetSculptBrushRadius={onSetSculptBrushRadius}
                  onSetSculptBrushStrength={onSetSculptBrushStrength}
                  onSetTransformMode={onSetTransformMode}
                  onSolidify={() => onMeshEditToolbarAction("solidify")}
                  onSubdivide={() => onMeshEditToolbarAction("subdivide")}
                  onTriangulate={() => onMeshEditToolbarAction("triangulate")}
                  onWeldDistance={() => onMeshEditToolbarAction("weld-distance")}
                  onWeldTarget={() => onMeshEditToolbarAction("weld-target")}
                  sculptBrushRadius={sculptBrushRadius}
                  sculptBrushStrength={sculptBrushStrength}
                  sculptMode={sculptMode}
                  selectedGeometry={selectedGeometry}
                  selectedMesh={selectedMesh}
                  transformMode={transformMode}
                />
              </div>
            ) : null}

            {activeToolId === "sculpt" ? (
              <div className="overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                <SculptToolBar
                  brushType={sculptBrushType}
                  symmetryX={sculptSymmetryX}
                  onSetBrushType={onSetSculptBrushType}
                  onSetSymmetryX={onSetSculptSymmetryX}
                />
              </div>
            ) : null}

            {activeToolId !== "brush" && activeToolId !== "mesh-edit" && activeToolId !== "sculpt" ? (
              <div className="editor-dock-note rounded-xl px-3 py-3 text-[11px]">
                {describeTool(activeToolId)}
              </div>
            ) : null}
          </PanelSection>
        </div>
      </ScrollArea>
    </div>
  );
}

function PanelSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="editor-dock-section rounded-[16px] p-3">
      <div className="editor-toolbar-label">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ToolModeButton({
  active,
  label,
  onClick,
  toolId
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  toolId: ToolId;
}) {
  const Icon = toolIconFor(toolId);

  return (
    <button
      className={cn(
        "editor-toolbar-button flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors duration-150",
        active && "editor-toolbar-button-active text-[#fff0cb]"
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-white/8 bg-black/18">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-[0.16em] text-inherit uppercase">{label}</span>
      </span>
    </button>
  );
}

function describeTool(toolId: ToolId) {
  switch (toolId) {
    case "select":
      return "Select objects in the viewport, then adjust them from the inspector or transform gizmo.";
    case "transform":
      return "Use the viewport gizmo or W, E, and R shortcuts to move, rotate, and scale the current selection.";
    case "clip":
      return "Clip works on compatible geometry from the inspector and viewport editing commands.";
    case "extrude":
      return "Extrude selected geometry through the viewport gizmo or mesh editing commands.";
    case "path-add":
      return "Add path points directly in the viewport, then refine them from the scene and hooks panels.";
    case "path-edit":
      return "Edit existing path nodes in the viewport and scene panels.";
    default:
      return "Pick a tool mode to start editing the scene.";
  }
}

import type { GridSnapValue } from "@blud/render-pipeline";
import type { BrushShape, EntityType, LightType, PrimitiveShape, SkateparkElementType } from "@blud/shared";
import type { ToolId } from "@blud/tool-system";
import type { FloorPresetId } from "@/lib/floor-presets";
import { AnimatePresence, motion } from "motion/react";
import { CreationToolBar } from "@/components/editor-shell/CreationToolBar";
import { FloorPresetsPanel } from "@/components/editor-shell/FloorPresetsPanel";
import { MeshEditToolBars } from "@/components/editor-shell/MeshEditToolBars";
import { PhysicsPlaybackControl } from "@/components/editor-shell/PhysicsPlaybackControl";
import { SnapControl } from "@/components/editor-shell/SnapControl";
import { ViewModeControl } from "@/components/editor-shell/ViewModeControl";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest, PreviewSessionMode } from "@/viewport/types";
import type { ViewModeId } from "@/viewport/viewports";

type ToolPaletteProps = {
  activeBrushShape: BrushShape;
  aiModelPlacementActive: boolean;
  activeToolId: ToolId;
  currentSnapSize: GridSnapValue;
  gridInfinite: boolean;
  gridSnapValues: readonly GridSnapValue[];
  meshEditMode: MeshEditMode;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onInvertSelectionNormals: () => void;
  onLowerTop: () => void;
  onPausePhysics: () => void;
  onResumePhysics?: () => void;
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
  onSimulatePhysics?: () => void;
  onRaiseTop: () => void;
  onStepPhysics?: () => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onStartAiModelPlacement: () => void;
  onSelectBrushShape: (shape: BrushShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetGridInfinite: (infinite: boolean) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onTogglePreviewPossession?: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetViewMode: (viewMode: ViewModeId) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  previewPossessed?: boolean;
  previewSessionMode?: PreviewSessionMode | null;
  sculptMode?: "deflate" | "inflate" | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  selectedGeometry: boolean;
  selectedMesh: boolean;
  snapEnabled: boolean;
  transformMode: "rotate" | "scale" | "translate";
  viewMode: ViewModeId;
};

export function ToolPalette({
  activeBrushShape,
  aiModelPlacementActive,
  activeToolId,
  currentSnapSize,
  gridInfinite,
  gridSnapValues,
  meshEditMode,
  onMeshEditToolbarAction,
  onInvertSelectionNormals,
  onLowerTop,
  onPausePhysics,
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
  onRaiseTop,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onStartAiModelPlacement,
  onSelectBrushShape,
  onSetMeshEditMode,
  onSetGridInfinite,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onSetTransformMode,
  onSetViewMode,
  physicsPlayback,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  selectedGeometry,
  selectedMesh,
  snapEnabled,
  transformMode,
  viewMode
}: ToolPaletteProps) {
  return (
    <>
      <div className="pointer-events-none absolute left-[4.75rem] top-[7.25rem] z-30 flex max-w-[calc(100%-7rem)] flex-col items-start gap-2">
        <AnimatePresence initial={false}>
          {activeToolId === "brush" ? (
            <motion.div
              className="max-w-full"
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="editor-toolbar-shell flex max-w-full flex-col gap-2 rounded-[18px] p-2.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="editor-toolbar-label">Brush Toolkit</span>
                  <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
                    Create
                  </span>
                </div>
                <div className="max-w-[calc(100vw-9rem)] overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
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
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {activeToolId === "mesh-edit" ? (
            <motion.div
              className="max-w-full"
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="editor-toolbar-shell flex max-w-full flex-col gap-2 rounded-[18px] p-2.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="editor-toolbar-label">Mesh Toolkit</span>
                  <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
                    Edit
                  </span>
                </div>
                <div className="max-w-[calc(100vw-9rem)] overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                  <MeshEditToolBars
                    onArc={() => onMeshEditToolbarAction("arc")}
                    onBevel={() => onMeshEditToolbarAction("bevel")}
                    onBridge={() => onMeshEditToolbarAction("bridge")}
                    onCut={() => onMeshEditToolbarAction("cut")}
                    onDelete={() => onMeshEditToolbarAction("delete")}
                    onInset={() => onMeshEditToolbarAction("inset")}
                    onExtrude={() => onMeshEditToolbarAction("extrude")}
                    meshEditMode={meshEditMode}
                    onFillFace={() => onMeshEditToolbarAction("fill-face")}
                    onDeflate={() => onMeshEditToolbarAction("deflate")}
                    onInflate={() => onMeshEditToolbarAction("inflate")}
                    onInvertNormals={() => onMeshEditToolbarAction("invert-normals")}
                    onLowerTop={onLowerTop}
                    onMerge={() => onMeshEditToolbarAction("merge")}
                    onMirrorX={() => onMeshEditToolbarAction("mirror-x")}
                    onPoke={() => onMeshEditToolbarAction("poke")}
                    onQuadrangulate={() => onMeshEditToolbarAction("quadrangulate")}
                    onRaiseTop={onRaiseTop}
                    onSetSculptBrushRadius={onSetSculptBrushRadius}
                    onSetSculptBrushStrength={onSetSculptBrushStrength}
                    onSetMeshEditMode={onSetMeshEditMode}
                    onSolidify={() => onMeshEditToolbarAction("solidify")}
                    onSubdivide={() => onMeshEditToolbarAction("subdivide")}
                    onSetTransformMode={onSetTransformMode}
                    onTriangulate={() => onMeshEditToolbarAction("triangulate")}
                    onWeldDistance={() => onMeshEditToolbarAction("weld-distance")}
                    onWeldTarget={() => onMeshEditToolbarAction("weld-target")}
                    sculptMode={sculptMode}
                    sculptBrushRadius={sculptBrushRadius}
                    sculptBrushStrength={sculptBrushStrength}
                    selectedGeometry={selectedGeometry}
                    selectedMesh={selectedMesh}
                    transformMode={transformMode}
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

export function ViewportToolbarControls({
  currentSnapSize,
  gridInfinite,
  gridSnapValues,
  onPausePhysics,
  onPlaceFloorPreset,
  onPlayPhysics,
  onResumePhysics,
  onSimulatePhysics,
  onStepPhysics,
  onSetGridInfinite,
  onSetSnapEnabled,
  onSetSnapSize,
  onSetViewMode,
  onStopPhysics,
  onTogglePreviewPossession,
  physicsPlayback,
  previewPossessed = false,
  previewSessionMode = null,
  snapEnabled,
  viewMode
}: Pick<
  ToolPaletteProps,
  | "currentSnapSize"
  | "gridInfinite"
  | "gridSnapValues"
  | "onPausePhysics"
  | "onPlaceFloorPreset"
  | "onPlayPhysics"
  | "onResumePhysics"
  | "onSimulatePhysics"
  | "onStepPhysics"
  | "onSetGridInfinite"
  | "onSetSnapEnabled"
  | "onSetSnapSize"
  | "onSetViewMode"
  | "onStopPhysics"
  | "onTogglePreviewPossession"
  | "physicsPlayback"
  | "previewPossessed"
  | "previewSessionMode"
  | "snapEnabled"
  | "viewMode"
>) {
  return (
    <div className="editor-toolbar-shell flex max-w-full items-center gap-2 overflow-x-auto rounded-[16px] p-1.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        onResume={onResumePhysics ?? onPlayPhysics}
        onSimulate={onSimulatePhysics ?? onPlayPhysics}
        onStep={onStepPhysics ?? (() => undefined)}
        onStop={onStopPhysics}
        onTogglePossession={onTogglePreviewPossession ?? (() => undefined)}
        previewPossessed={previewPossessed}
        previewSessionMode={previewSessionMode}
      />
      <FloorPresetsPanel disabled={physicsPlayback !== "stopped"} onPlaceFloorPreset={onPlaceFloorPreset} />
    </div>
  );
}

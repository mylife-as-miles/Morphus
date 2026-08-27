import type { EditorCore, SceneSpatialAnalysis, TransformAxis } from "@blud/editor-core";
import type { GridSnapValue, DerivedRenderScene, ViewportState } from "@blud/render-pipeline";
import type {
  BrushShape,
  Brush,
  EditableMesh,
  Entity,
  EntityType,
  GeometryNode,
  LightNodeData,
  LightType,
  Material,
  SceneSettings,
  TextureRecord,
  Transform,
  Vec2,
  Vec3
} from "@blud/shared";
import type { PrimitiveNodeData, PrimitiveShape, ProceduralWorldNodeData, SkateparkElementType } from "@blud/shared";
import type { ToolId } from "@blud/tool-system";
import type { FloorPresetId } from "@/lib/floor-presets";
import type { WorkerJob } from "@blud/workers";
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CopilotImageAttachment, CopilotSession } from "@/lib/copilot/types";
import type { AiAssistantMode } from "@/lib/copilot/types";
import type { MorphusFileRecord } from "@/lib/copilot/morphus-memory";
import { buildGameBlobUrl } from "@/lib/game-html";
import { AiModelPromptBar } from "@/components/editor-shell/AiModelPromptBar";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { ToolsPanel } from "@/components/editor-shell/ToolsPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest, PreviewSessionMode } from "@/viewport/types";
import type { ViewportBlockoutDropKind } from "@/viewport/utils/viewport-blockout-dnd";
import type { RightPanelId, ViewportQuality } from "@/state/ui-store";
import {
  getViewModePreset,
  viewportPaneDefinitions,
  type ViewModeId,
  type ViewportPaneId
} from "@/viewport/viewports";
import { cn } from "@/lib/utils";
import { MessageSquareText, PanelsTopLeft, Wrench } from "lucide-react";

const CopilotPanel = lazy(() =>
  import("@/components/editor-shell/CopilotPanel").then((module) => ({ default: module.CopilotPanel }))
);
const MorphusWorkspace = lazy(() =>
  import("@/components/editor-shell/MorphusWorkspace").then((module) => ({ default: module.MorphusWorkspace }))
);
const GameBridgePanel = lazy(() =>
  import("@/components/editor-shell/GameBridgePanel").then((module) => ({ default: module.GameBridgePanel }))
);
const LogicViewerSheet = lazy(() =>
  import("@/components/editor-shell/logic-viewer/LogicViewerSheet").then((module) => ({
    default: module.LogicViewerSheet
  }))
);
const NodeMaterialEditorSheet = lazy(() =>
  import("@/components/editor-shell/NodeMaterialEditorSheet").then((module) => ({
    default: module.NodeMaterialEditorSheet
  }))
);
const BehaviorTreeEditorSheet = lazy(() =>
  import("@/components/editor-shell/BehaviorTreeEditorSheet").then((module) => ({
    default: module.BehaviorTreeEditorSheet
  }))
);

type EditorShellProps = {
  activeBrushShape: BrushShape;
  aiModelPlacementActive: boolean;
  copilot: {
    session: CopilotSession;
    sendMessage: (prompt: string, images?: CopilotImageAttachment[]) => void;
    abort: () => void;
    clearHistory: () => void;
    disableSkill: (skillId: string) => void;
    isConfigured: boolean;
    refreshConfigured: () => void;
    latestGame: { title: string; html: string } | null;
    clearLatestGame: () => void;
    files?: MorphusFileRecord[];
    saveFile?: (path: string, content: string) => void;
  };
  morphus: {
    session: CopilotSession;
    sendMessage: (prompt: string, images?: CopilotImageAttachment[]) => void;
    abort: () => void;
    clearHistory: () => void;
    isConfigured: boolean;
    refreshConfigured: () => void;
    latestGame: { title: string; html: string } | null;
    clearLatestGame: () => void;
    files: MorphusFileRecord[];
    saveFile: (path: string, content: string) => void;
  };
  aiAssistantMode: AiAssistantMode;
  aiModePickerOpen: boolean;
  copilotPanelOpen: boolean;
  gameConnectionControl?: ReactNode;
  logicViewerOpen: boolean;
  toolsPanelOpen: boolean;
  aiModelPlacementArmed: boolean;
  aiModelPrompt: string;
  aiModelPromptBusy: boolean;
  aiModelPromptError?: string;
  activeRightPanel: RightPanelId | null;
  activeToolId: ToolId;
  activeViewportId: ViewportPaneId;
  analysis: SceneSpatialAnalysis;
  canRedo: boolean;
  canUndo: boolean;
  editor: EditorCore;
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  gridSnapValues: readonly GridSnapValue[];
  hiddenSceneItemIds: string[];
  jobs: WorkerJob[];
  lockedSceneItemIds: string[];
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  sculptMode?: string | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  sculptBrushType: "draw" | "smooth" | "grab";
  sculptSymmetryX: boolean;
  onActivateViewport: (viewportId: ViewportPaneId) => void;
  onRegisterViewportScreenshotCapture?: (
    viewportId: ViewportPaneId,
    capture:
      | (() => Promise<{
          dataUrl: string;
          height: number;
          mimeType: string;
          width: number;
        }>)
      | null
  ) => void;
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onClipSelection: (axis: TransformAxis) => void;
  onCommitMeshTopology: (nodeId: string, mesh: EditableMesh) => void;
  onCreateBrush: () => void;
  onCreateProceduralWorld: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onClearSelection: () => void;
  onExportEngine: () => void;
  onExportGltf: () => void;
  onExtrudeSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onFocusNode: (nodeId: string) => void;
  onImportHtmlJs: () => void;
  onDeleteMaterial: (materialId: string) => void;
  onDeleteTexture: (textureId: string) => void;
  onCancelAiModelPlacement: () => void;
  onLoadWhmap: () => void;
  onNewFile: () => void;
  onInvertSelectionNormals: () => void;
  onPausePhysics: () => void;
  onResumePhysics: () => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceFloorPreset: (presetId: FloorPresetId) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceBlockoutOpenRoom: () => void;
  onPlaceBlockoutPlatform: () => void;
  onPlaceBlockoutRoom: () => void;
  onPlaceBlockoutStairs: () => void;
  onDropBlockout?: (kind: ViewportBlockoutDropKind, position: Vec3) => void;
  onPlaceSkateparkElement?: (type: SkateparkElementType) => void;
  onMirrorSelection: (axis: TransformAxis) => void;
  onGenerateAiModel: () => void;
  onImportGlb: () => void;
  onPlaceAsset: (position: { x: number; y: number; z: number }) => void;
  onPlaceAiModelPlaceholder: (position: { x: number; y: number; z: number }) => void;
  onPlaceBrush: (brush: Brush, transform: Transform) => void;
  onPlaceMeshNode: (mesh: EditableMesh, transform: Transform, name: string) => void;
  onPlacePrimitiveNode: (data: PrimitiveNodeData, transform: Transform, name: string) => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onPlayPhysics: () => void;
  onSimulatePhysics: () => void;
  onStepPhysics: () => void;
  onPreviewBrushData: (nodeId: string, brush: Brush) => void;
  onPreviewEntityTransform: (entityId: string, transform: Transform) => void;
  onPreviewMeshData: (nodeId: string, mesh: EditableMesh) => void;
  onSculptModeChange: (mode: string | null) => void;
  onSetSculptBrushType: (type: "draw" | "smooth" | "grab") => void;
  onSetSculptSymmetryX: (enabled: boolean) => void;
  onRedo: () => void;
  onSaveWhmap: () => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterialFaces: (faceIds: string[]) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectScenePath: (pathId: string | undefined) => void;
  onStartAiModelPlacement: () => void;
  onToggleSceneItemLock: (itemId: string) => void;
  onToggleSceneItemVisibility: (itemId: string) => void;
  onSetUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetActiveBrushShape: (shape: BrushShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onSetRightPanel: (panel: RightPanelId | null) => void;
  onSetGridInfinite: (infinite: boolean) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onTogglePreviewPossession: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetToolId: (toolId: ToolId) => void;
  onCloseAiModePicker: () => void;
  onOpenAiLauncher: () => void;
  onSelectAiAssistantMode: (mode: AiAssistantMode) => void;
  onToggleCopilot: () => void;
  onToggleLogicViewer: () => void;
  onToggleTools: () => void;
  onToggleViewportQuality: () => void;
  projectName: string;
  onSetViewMode: (viewMode: ViewModeId) => void;
  onSplitBrushAtCoordinate: (nodeId: string, axis: TransformAxis, coordinate: number) => void;
  onPreviewNodeTransform: (nodeId: string, transform: Transform) => void;
  onTranslateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onUndo: () => void;
  onUpdateEntityProperties: (entityId: string, properties: Record<string, string | number | boolean>) => void;
  onUpdateEntityHooks: (entityId: string, hooks: NonNullable<Entity["hooks"]>, beforeHooks?: NonNullable<Entity["hooks"]>) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData | ProceduralWorldNodeData) => void;
  onUpdateNodeHooks: (nodeId: string, hooks: NonNullable<GeometryNode["hooks"]>, beforeHooks?: NonNullable<GeometryNode["hooks"]>) => void;
  onUpdateAiModelPrompt: (prompt: string) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  onUpdateViewport: (viewportId: ViewportPaneId, viewport: ViewportState) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpsertTexture: (texture: TextureRecord) => void;
  onUpdateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  previewPossessed: boolean;
  previewSessionMode: PreviewSessionMode | null;
  previewStepTick: number;
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  selectedScenePathId?: string;
  selectedAssetId: string;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  transformMode: "rotate" | "scale" | "translate";
  textures: TextureRecord[];
  tools: Array<{ id: ToolId; label: string }>;
  viewMode: ViewModeId;
  viewportQuality: ViewportQuality;
  viewports: Record<ViewportPaneId, ViewportState>;
};

export function EditorShell({
  activeBrushShape,
  aiModelPlacementActive,
  aiModelPlacementArmed,
  copilot,
  morphus,
  aiAssistantMode,
  aiModePickerOpen,
  copilotPanelOpen,
  gameConnectionControl,
  logicViewerOpen,
  toolsPanelOpen,
  aiModelPrompt,
  aiModelPromptBusy,
  aiModelPromptError,
  activeRightPanel,
  activeToolId,
  activeViewportId,
  analysis,
  canRedo,
  canUndo,
  editor,
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  gridSnapValues,
  hiddenSceneItemIds,
  jobs,
  lockedSceneItemIds,
  meshEditMode,
  meshEditToolbarAction,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  sculptBrushType,
  sculptSymmetryX,
  onActivateViewport,
  onRegisterViewportScreenshotCapture,
  onApplyMaterial,
  onClipSelection,
  onCommitMeshTopology,
  onCreateBrush,
  onCreateProceduralWorld,
  onDeleteSelection,
  onDuplicateSelection,
  onGroupSelection,
  onClearSelection,
  onExportEngine,
  onExportGltf,
  onExtrudeSelection,
  onFocusNode,
  onImportHtmlJs,
  onDeleteMaterial,
  onDeleteTexture,
  onCancelAiModelPlacement,
  onLoadWhmap,
  onNewFile,
  onInvertSelectionNormals,
  onPausePhysics,
  onResumePhysics,
  onMeshEditToolbarAction,
  onPlaceEntity,
  onPlaceFloorPreset,
  onPlaceLight,
  onPlaceBlockoutOpenRoom,
  onPlaceBlockoutPlatform,
  onPlaceBlockoutRoom,
  onPlaceBlockoutStairs,
  onDropBlockout,
  onPlaceSkateparkElement,
  onMirrorSelection,
  onGenerateAiModel,
  onImportGlb,
  onPlaceAsset,
  onPlaceAiModelPlaceholder,
  onPlaceBrush,
  onPlaceMeshNode,
  onPlacePrimitiveNode,
  onPlaceProp,
  onPlayPhysics,
  onSimulatePhysics,
  onStepPhysics,
  onPreviewBrushData,
  onPreviewEntityTransform,
  onPreviewMeshData,
  onSculptModeChange,
  onSetSculptBrushType,
  onSetSculptSymmetryX,
  onRedo,
  onSaveWhmap,
  onSelectAsset,
  onSelectMaterialFaces,
  onSelectMaterial,
  onSelectScenePath,
  onStartAiModelPlacement,
  onToggleSceneItemLock,
  onToggleSceneItemVisibility,
  onSetUvOffset,
  onSetUvScale,
  onSelectNodes,
  onSetActiveBrushShape,
  onSetMeshEditMode,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onSetRightPanel,
  onSetGridInfinite,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onTogglePreviewPossession,
  onSetTransformMode,
  onSetToolId,
  onCloseAiModePicker,
  onOpenAiLauncher,
  onSelectAiAssistantMode,
  onToggleCopilot,
  onToggleLogicViewer,
  onToggleTools,
  onToggleViewportQuality,
  projectName,
  onSetViewMode,
  onSplitBrushAtCoordinate,
  onPreviewNodeTransform,
  onTranslateSelection,
  onUndo,
  onUpdateEntityProperties,
  onUpdateEntityHooks,
  onUpdateEntityTransform,
  onUpdateNodeData,
  onUpdateNodeHooks,
  onUpdateAiModelPrompt,
  onUpdateSceneSettings,
  onUpdateViewport,
  onUpsertMaterial,
  onUpsertTexture,
  onUpdateBrushData,
  onUpdateMeshData,
  onUpdateNodeTransform,
  physicsPlayback,
  physicsRevision,
  previewPossessed,
  previewSessionMode,
  previewStepTick,
  renderScene,
  sceneSettings,
  selectedScenePathId,
  selectedAssetId,
  selectedFaceIds,
  selectedMaterialId,
  transformMode,
  textures,
  tools,
  viewMode,
  viewportQuality,
  viewports
}: EditorShellProps) {
  const [mobileEditorTab, setMobileEditorTab] = useState<"tools" | "viewport" | "chat">("viewport");
  const [gameViewUrl, setGameViewUrl] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [physicsDebugOpen, setPhysicsDebugOpen] = useState(false);
  const [nodeMaterialEditorOpen, setNodeMaterialEditorOpen] = useState(false);
  const [btEditorOpen, setBtEditorOpen] = useState(false);
  const gameViewUrlRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handlePlayInViewport = useCallback((game = aiAssistantMode === "morphus" ? morphus.latestGame : copilot.latestGame) => {
    if (!game) return;
    if (gameViewUrlRef.current) URL.revokeObjectURL(gameViewUrlRef.current);
    const url = buildGameBlobUrl(game.html);
    gameViewUrlRef.current = url;
    setGameViewUrl(url);
  }, [aiAssistantMode, copilot.latestGame, morphus.latestGame]);

  const handleExitGameView = useCallback(() => {
    setGameViewUrl(null);
    if (gameViewUrlRef.current) {
      setTimeout(() => {
        if (gameViewUrlRef.current) URL.revokeObjectURL(gameViewUrlRef.current);
        gameViewUrlRef.current = null;
      }, 500);
    }
  }, []);

  useEffect(() => {
    if (!copilot.latestGame && !morphus.latestGame) {
      handleExitGameView();
    }
  }, [copilot.latestGame, handleExitGameView, morphus.latestGame]);

  const selectionEnabled = physicsPlayback === "stopped" || (physicsPlayback === "paused" && !previewPossessed);
  const nodes = Array.from(editor.scene.nodes.values());
  const entities = Array.from(editor.scene.entities.values());
  const materials = Array.from(editor.scene.materials.values());
  const assets = Array.from(editor.scene.assets.values());
  const selectedObjectId = selectionEnabled ? editor.selection.ids[0] : undefined;
  const selectedNodeId = selectedObjectId && editor.scene.getNode(selectedObjectId) ? selectedObjectId : undefined;
  const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
  const selectedEntity = !selectedNodeId && selectedObjectId ? editor.scene.getEntity(selectedObjectId) : undefined;
  const selectedNodeIds = selectionEnabled ? editor.selection.ids : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => editor.scene.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const activeToolLabel = tools.find((tool) => tool.id === activeToolId)?.label ?? activeToolId;
  const selectedIsGeometry =
    selectedNode?.kind === "brush" || selectedNode?.kind === "mesh" || selectedNode?.kind === "primitive";
  const selectedIsMesh = selectedNode?.kind === "mesh";
  const activeViewport = viewports[activeViewportId];
  const morphusActive = copilotPanelOpen && aiAssistantMode === "morphus";

  const renderViewportPane = (viewportId: ViewportPaneId) => {
    const definition = viewportPaneDefinitions[viewportId];
    const isActiveViewport = activeViewportId === viewportId;

    return (
      <ViewportPaneFrame
        active={isActiveViewport}
        key={viewportId}
        previewActive={physicsPlayback !== "stopped"}
        sceneLabel={projectName}
        viewport={viewports[viewportId]}
      >
        <ViewportCanvas
          activeBrushShape={activeBrushShape}
          aiModelPlacementArmed={aiModelPlacementArmed}
          activeToolId={activeToolId}
          dprScale={resolveViewportDprScale(viewportQuality)}
          entities={entities}
          hiddenSceneItemIds={effectiveHiddenSceneItemIds}
          isActiveViewport={isActiveViewport}
          meshEditMode={meshEditMode}
          meshEditToolbarAction={meshEditToolbarAction}
          sculptBrushRadius={sculptBrushRadius}
          sculptBrushStrength={sculptBrushStrength}
          sculptBrushType={sculptBrushType}
          sculptSymmetryX={sculptSymmetryX}
          onActivateViewport={onActivateViewport}
          onRegisterViewportScreenshotCapture={onRegisterViewportScreenshotCapture}
          onClearSelection={onClearSelection}
          onDropBlockout={onDropBlockout}
          onCommitMeshTopology={onCommitMeshTopology}
          onFocusNode={onFocusNode}
          onPlaceAsset={onPlaceAsset}
          onPlaceAiModelPlaceholder={onPlaceAiModelPlaceholder}
          onPlaceBrush={onPlaceBrush}
          onPlaceMeshNode={onPlaceMeshNode}
          onPlacePrimitiveNode={onPlacePrimitiveNode}
          onPreviewBrushData={onPreviewBrushData}
          onPreviewEntityTransform={onPreviewEntityTransform}
          onPreviewMeshData={onPreviewMeshData}
          onPreviewNodeTransform={onPreviewNodeTransform}
          onSculptModeChange={activeViewportId === viewportId ? onSculptModeChange : () => {}}
          onSelectMaterialFaces={onSelectMaterialFaces}
          onSelectScenePath={onSelectScenePath}
          onSelectNodes={onSelectNodes}
          onSetToolId={onSetToolId}
          onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
          onUpdateBrushData={onUpdateBrushData}
          onUpdateEntityTransform={onUpdateEntityTransform}
          onUpdateMeshData={onUpdateMeshData}
          onUpdateNodeTransform={onUpdateNodeTransform}
          onUpdateSceneSettings={onUpdateSceneSettings}
          onViewportChange={onUpdateViewport}
          physicsDebug={physicsDebugOpen}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          previewPossessed={previewPossessed}
          previewSessionMode={previewSessionMode}
          previewStepTick={previewStepTick}
          renderMode={definition.renderMode}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
          showStats={showStats && isActiveViewport}
          nodes={nodes}
          selectedScenePathId={selectedScenePathId}
          selectedEntity={selectedEntity}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          selectedNodes={selectedNodes}
          transformMode={transformMode}
          viewport={viewports[viewportId]}
          viewportId={viewportId}
          viewportPlane={definition.plane}
        />
      </ViewportPaneFrame>
    );
  };

  return (
    <div className="editor-shell flex flex-col text-foreground" style={{ height: "100dvh" }}>
      {!morphusActive && (
      <header className="relative z-20 shrink-0 px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="editor-toolbar-shell rounded-[20px] sm:rounded-[22px]">
          <EditorMenuBar
            canRedo={canRedo}
            canUndo={canUndo}
            copilotOpen={copilotPanelOpen}
            gameConnectionControl={gameConnectionControl}
            btEditorOpen={btEditorOpen}
            logicViewerOpen={logicViewerOpen}
            nodeMaterialEditorOpen={nodeMaterialEditorOpen}
            physicsDebugOpen={physicsDebugOpen}
            showStats={showStats}
            onClearSelection={onClearSelection}
            onCreateBrush={onCreateBrush}
            onDeleteSelection={onDeleteSelection}
            onDuplicateSelection={onDuplicateSelection}
            onGroupSelection={onGroupSelection}
            onExportEngine={onExportEngine}
            onExportGltf={onExportGltf}
            onFocusSelection={() => {
              if (selectedObjectId) {
                onFocusNode(selectedObjectId);
              }
            }}
            onImportHtmlJs={onImportHtmlJs}
            onLoadWhmap={onLoadWhmap}
            onNewFile={onNewFile}
            onOpenAiLauncher={onOpenAiLauncher}
            onPausePreview={onPausePhysics}
            onPlayPreview={onPlayPhysics}
            onRedo={onRedo}
            onResumePreview={onResumePhysics}
            onSaveWhmap={onSaveWhmap}
            onSimulatePreview={onSimulatePhysics}
            onStepPreview={onStepPhysics}
            onStopPreview={onStopPhysics}
            onToggleBtEditor={() => setBtEditorOpen((v) => !v)}
            onToggleLogicViewer={onToggleLogicViewer}
            onToggleNodeMaterialEditor={() => setNodeMaterialEditorOpen((v) => !v)}
            onTogglePhysicsDebug={() => setPhysicsDebugOpen((v) => !v)}
            onTogglePreviewPossession={onTogglePreviewPossession}
            onToggleStats={() => setShowStats((v) => !v)}
            onToggleTools={onToggleTools}
            onToggleViewportQuality={onToggleViewportQuality}
            onUndo={onUndo}
            physicsPlayback={physicsPlayback}
            previewPossessed={previewPossessed}
            previewSessionMode={previewSessionMode}
            toolsPanelOpen={toolsPanelOpen}
            viewportQuality={viewportQuality}
          />
        </div>
      </header>
      )}

      <main className={cn(
        "relative flex min-h-0 flex-1 gap-2 px-2 pb-16 sm:gap-3 sm:px-3 sm:pb-3",
        morphusActive ? "pt-2 sm:pt-3" : "pt-1.5 sm:pt-2"
      )}>
        {morphusActive ? (
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<CopilotPanelFallback label="Loading Morphus" />}>
              <MorphusWorkspace
                files={morphus.files}
                isConfigured={morphus.isConfigured}
                latestGame={morphus.latestGame}
                onAbort={morphus.abort}
                onClearGame={morphus.clearLatestGame}
                onClearHistory={morphus.clearHistory}
                onClose={onToggleCopilot}
                onPlayInViewport={handlePlayInViewport}
                onSaveFile={morphus.saveFile}
                onSendMessage={morphus.sendMessage}
                onSettingsChanged={morphus.refreshConfigured}
                session={morphus.session}
              />
            </Suspense>
          </div>
        ) : (
        <>
        {toolsPanelOpen && (
          <div className={cn(
            "w-64 shrink-0 sm:w-80 lg:w-[22rem]",
            mobileEditorTab === "tools" ? "block" : "hidden lg:block"
          )}>
            <ToolsPanel
              activeBrushShape={activeBrushShape}
              activeRightPanel={activeRightPanel}
              aiModelPlacementActive={aiModelPlacementActive || aiModelPlacementArmed}
              activeToolId={activeToolId}
              currentSnapSize={activeViewport.grid.snapSize}
              gridInfinite={activeViewport.grid.infinite}
              gridSnapValues={gridSnapValues}
              meshEditMode={meshEditMode}
              onClose={onToggleTools}
              onImportGlb={onImportGlb}
              onLowerTop={() => onExtrudeSelection("y", -1)}
              onMeshEditToolbarAction={onMeshEditToolbarAction}
              onPausePhysics={onPausePhysics}
              onResumePhysics={onResumePhysics}
              onPlaceBlockoutOpenRoom={onPlaceBlockoutOpenRoom}
              onPlaceBlockoutPlatform={onPlaceBlockoutPlatform}
              onPlaceBlockoutRoom={onPlaceBlockoutRoom}
              onPlaceBlockoutStairs={onPlaceBlockoutStairs}
              onPlaceSkateparkElement={onPlaceSkateparkElement}
              onPlaceEntity={onPlaceEntity}
              onPlaceFloorPreset={onPlaceFloorPreset}
              onPlaceLight={onPlaceLight}
              onPlaceProp={onPlaceProp}
              onPlayPhysics={onPlayPhysics}
              onSimulatePhysics={onSimulatePhysics}
              onRaiseTop={() => onExtrudeSelection("y", 1)}
              onStepPhysics={onStepPhysics}
              onSelectBrushShape={(shape) => {
                onSetActiveBrushShape(shape);
                onSetToolId("brush");
              }}
              onSetRightPanel={onSetRightPanel}
              onSetMeshEditMode={onSetMeshEditMode}
              onSetSculptBrushRadius={onSetSculptBrushRadius}
              onSetSculptBrushStrength={onSetSculptBrushStrength}
              onSetSculptBrushType={onSetSculptBrushType}
              onSetSculptSymmetryX={onSetSculptSymmetryX}
              onSetGridInfinite={onSetGridInfinite}
              onSetSnapEnabled={onSetSnapEnabled}
              onSetSnapSize={onSetSnapSize}
              onSetToolId={onSetToolId}
              onSetTransformMode={onSetTransformMode}
              onSetViewMode={onSetViewMode}
              onStartAiModelPlacement={onStartAiModelPlacement}
              onStopPhysics={onStopPhysics}
              onTogglePreviewPossession={onTogglePreviewPossession}
              physicsPlayback={physicsPlayback}
              previewPossessed={previewPossessed}
              previewSessionMode={previewSessionMode}
              sculptBrushRadius={sculptBrushRadius}
              sculptBrushStrength={sculptBrushStrength}
              sculptBrushType={sculptBrushType}
              sculptSymmetryX={sculptSymmetryX}
              selectionEnabled={selectionEnabled}
              sculptMode={sculptMode}
              selectedGeometry={selectedIsGeometry}
              selectedMesh={selectedIsMesh}
              snapEnabled={activeViewport.grid.enabled}
              transformMode={transformMode}
              viewMode={viewMode}
            />
          </div>
        )}

        <div className={cn(
          "editor-stage relative min-w-0 flex-1 rounded-[32px]",
          mobileEditorTab === "viewport" ? "block" : "hidden lg:block"
        )}>
          <div className="absolute inset-0">
            <ViewportLayout
              activeViewportId={activeViewportId}
              previewActive={physicsPlayback !== "stopped"}
              renderViewportPane={renderViewportPane}
              viewMode={viewMode}
            />
          </div>

          {gameViewUrl && (
            <div className="absolute inset-0 z-20 rounded-[32px] overflow-hidden">
              <iframe
                ref={iframeRef}
                src={gameViewUrl}
                className="size-full border-0"
                allow="autoplay"
                title="Game preview"
              />
              <button
                className="absolute left-4 top-4 z-30 flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm hover:bg-black/80 hover:text-white transition-colors"
                onClick={handleExitGameView}
              >
                ← Editor
              </button>
              <Suspense fallback={null}>
                <GameBridgePanel iframeRef={iframeRef} />
              </Suspense>
            </div>
          )}

        <AiModelPromptBar
          active={aiModelPlacementActive}
          armed={aiModelPlacementArmed}
          busy={aiModelPromptBusy}
          error={aiModelPromptError}
          onCancel={onCancelAiModelPlacement}
          onChangePrompt={onUpdateAiModelPrompt}
          onSubmit={onGenerateAiModel}
          prompt={aiModelPrompt}
        />

        {/* <SpatialAnalysisPanel analysis={analysis} /> */}

        <InspectorSidebar
          activeRightPanel={activeRightPanel}
          activeToolId={activeToolId}
          assets={assets}
          effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
          effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
          entities={entities}
          hiddenSceneItemIds={hiddenSceneItemIds}
          lockedSceneItemIds={lockedSceneItemIds}
          materials={materials}
          meshEditMode={meshEditMode}
          nodes={nodes}
          onApplyMaterial={onApplyMaterial}
          onChangeRightPanel={onSetRightPanel}
          onClipSelection={onClipSelection}
          onCreateProceduralWorld={onCreateProceduralWorld}
          onDeleteMaterial={onDeleteMaterial}
          onDeleteTexture={onDeleteTexture}
          onExtrudeSelection={onExtrudeSelection}
          onFocusNode={onFocusNode}
          onMeshEditToolbarAction={onMeshEditToolbarAction}
          onMirrorSelection={onMirrorSelection}
          onPlaceAsset={onPlaceAsset}
          onSelectAsset={onSelectAsset}
          onSelectMaterial={onSelectMaterial}
          onSelectScenePath={onSelectScenePath}
          onSelectNodes={onSelectNodes}
          onSetToolId={onSetToolId}
          onToggleSceneItemLock={onToggleSceneItemLock}
          onToggleSceneItemVisibility={onToggleSceneItemVisibility}
          onSetUvOffset={onSetUvOffset}
          onSetUvScale={onSetUvScale}
          onUpdateMeshData={onUpdateMeshData}
          onTranslateSelection={onTranslateSelection}
          onUpsertMaterial={onUpsertMaterial}
          onUpsertTexture={onUpsertTexture}
          onUpdateEntityProperties={onUpdateEntityProperties}
          onUpdateEntityHooks={onUpdateEntityHooks}
          onUpdateEntityTransform={onUpdateEntityTransform}
          onUpdateNodeData={onUpdateNodeData}
          onUpdateNodeHooks={onUpdateNodeHooks}
          onUpdateSceneSettings={onUpdateSceneSettings}
          onUpdateNodeTransform={onUpdateNodeTransform}
          sceneSettings={sceneSettings}
          selectedScenePathId={selectedScenePathId}
          selectionEnabled={selectionEnabled}
          selectedEntity={selectedEntity}
          selectedAssetId={selectedAssetId}
          selectedFaceIds={selectedFaceIds}
          selectedMaterialId={selectedMaterialId}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          textures={textures}
          viewportTarget={activeViewport.camera.target}
        />


        {logicViewerOpen && (
          <Suspense fallback={<LogicViewerFallback />}>
            <LogicViewerSheet
              entities={entities}
              nodes={nodes}
              onClose={onToggleLogicViewer}
              onNodeClick={(objectId) => {
                onSelectNodes([objectId]);
                if (editor.scene.getNode(objectId)) {
                  onFocusNode(objectId);
                }
              }}
              onUpdateEntityHooks={onUpdateEntityHooks}
              onUpdateNodeHooks={onUpdateNodeHooks}
            />
          </Suspense>
        )}

        {nodeMaterialEditorOpen && (
          <Suspense fallback={null}>
            <NodeMaterialEditorSheet
              material={materials.find((m) => m.id === selectedMaterialId)}
              onClose={() => setNodeMaterialEditorOpen(false)}
            />
          </Suspense>
        )}

        {btEditorOpen && (
          <Suspense fallback={null}>
            <BehaviorTreeEditorSheet
              onClose={() => setBtEditorOpen(false)}
            />
          </Suspense>
        )}
        </div>

        {copilotPanelOpen && aiAssistantMode === "copilot" && (
          <div className={cn(
            "w-64 shrink-0 sm:w-80 lg:w-[22rem]",
            mobileEditorTab === "chat" ? "block" : "hidden lg:block"
          )}>
            <Suspense fallback={<CopilotPanelFallback />}>
              <CopilotPanel
                isConfigured={copilot.isConfigured}
                latestGame={copilot.latestGame}
                onAbort={copilot.abort}
                onClearGame={copilot.clearLatestGame}
                onClearHistory={copilot.clearHistory}
                onDisableSkill={copilot.disableSkill}
                onClose={onToggleCopilot}
                onPlayInViewport={handlePlayInViewport}
                onSendMessage={copilot.sendMessage}
                onSettingsChanged={copilot.refreshConfigured}
                session={copilot.session}
              />
            </Suspense>
          </div>
        )}
        </>
        )}
      </main>

      {!morphusActive && (
        <nav className="fixed inset-x-2 bottom-2 z-30 flex items-center justify-between rounded-2xl border border-white/10 bg-[#111722]/92 p-1.5 shadow-xl backdrop-blur-lg lg:hidden">
          <MobileEditorTabButton active={mobileEditorTab === "tools"} icon={<Wrench className="size-4" />} label="Tools" onClick={() => setMobileEditorTab("tools")} />
          <MobileEditorTabButton active={mobileEditorTab === "viewport"} icon={<PanelsTopLeft className="size-4" />} label="Viewport" onClick={() => setMobileEditorTab("viewport")} />
          <MobileEditorTabButton active={mobileEditorTab === "chat"} icon={<MessageSquareText className="size-4" />} label="Chat" onClick={() => setMobileEditorTab("chat")} />
        </nav>
      )}

      {aiModePickerOpen && (
        <AiModePicker
          onClose={onCloseAiModePicker}
          onSelect={onSelectAiAssistantMode}
        />
      )}
    </div>
  );
}

function MobileEditorTabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors",
        active ? "bg-white/12 text-white" : "text-white/70 hover:text-white"
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function resolveViewportDprScale(quality: ViewportQuality) {
  return quality;
}

function ViewportLayout({
  activeViewportId,
  previewActive,
  renderViewportPane,
  viewMode
}: {
  activeViewportId: ViewportPaneId;
  previewActive: boolean;
  renderViewportPane: (viewportId: ViewportPaneId) => ReactNode;
  viewMode: ViewModeId;
}) {
  const preset = getViewModePreset(viewMode);

  if (previewActive) {
    return <div className="size-full">{renderViewportPane("perspective")}</div>;
  }

  if (preset.layout === "single") {
    return <div className="size-full">{renderViewportPane("perspective")}</div>;
  }

  if (preset.layout === "split") {
    return (
      <ResizablePanelGroup className="size-full" orientation="horizontal">
        <ResizablePanel defaultSize={62} minSize={35}>
          {renderViewportPane("perspective")}
        </ResizablePanel>
        <ViewportSplitHandle />
        <ResizablePanel defaultSize={38} minSize={20}>
          {renderViewportPane(preset.secondaryPaneId)}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  return (
    <ResizablePanelGroup className="size-full" orientation="horizontal">
      <ResizablePanel defaultSize={50} minSize={32}>
        <ResizablePanelGroup className="size-full" orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("top")}
          </ResizablePanel>
          <ViewportSplitHandle direction="horizontal" />
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("perspective")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ViewportSplitHandle />
      <ResizablePanel defaultSize={50} minSize={32}>
        <ResizablePanelGroup className="size-full" orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("front")}
          </ResizablePanel>
          <ViewportSplitHandle direction="horizontal" />
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("side")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ViewportPaneFrame({
  active,
  children,
  previewActive,
  sceneLabel,
  viewport
}: {
  active: boolean;
  children: ReactNode;
  previewActive: boolean;
  sceneLabel: string;
  viewport: ViewportState;
}) {
  const target = viewport.camera.target;
  const selectedViewportPreview = active && previewActive;

  return (
    <div
      className={cn(
        "relative size-full overflow-hidden bg-[#14181f]",
        selectedViewportPreview
          ? "ring-1 ring-inset ring-[#f6d07d]/72 shadow-[inset_0_0_0_1px_rgba(246,208,125,0.18)]"
          : active
            ? "ring-1 ring-inset ring-[#f6d07d]/28"
            : "ring-1 ring-inset ring-white/7"
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0)_12%),radial-gradient(circle_at_top,rgba(148,163,184,0.16),transparent_48%)]" />
      {selectedViewportPreview ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-[#f6d07d]/92" />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-px bg-[#f6d07d]/92" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-px bg-[#f6d07d]/72" />
          <div className="editor-toolbar-segment pointer-events-none absolute bottom-4 right-4 z-20 rounded-xl px-3 py-2 text-[10px] font-medium tracking-[0.14em] text-[#d9e5f6]/78 uppercase backdrop-blur-sm">
            Level: {sceneLabel} (Selected Viewport)
          </div>
        </>
      ) : (
        <div className="editor-toolbar-segment pointer-events-none absolute bottom-4 right-4 z-20 rounded-xl px-3 py-2 text-[10px] font-medium tracking-[0.18em] text-white/58 uppercase backdrop-blur-sm">
          Target {target.x.toFixed(1)} {target.y.toFixed(1)} {target.z.toFixed(1)}
        </div>
      )}
      {children}
    </div>
  );
}

function ViewportSplitHandle({ direction = "vertical" }: { direction?: "horizontal" | "vertical" }) {
  return (
    <ResizableHandle
      className="bg-white/[0.04] after:bg-white/[0.08] hover:bg-[#f6d07d]/14 data-[dragging]:bg-[#f6d07d]/20"
      withHandle={direction === "vertical"}
    />
  );
}

function CopilotPanelFallback({ label = "Loading Copilot" }: { label?: string }) {
  return (
    <div className="glass-panel glass-panel-strong flex h-full items-center justify-center rounded-[32px] px-4">
      <div className="text-[11px] font-medium tracking-[0.18em] text-foreground/48 uppercase">
        {label}
      </div>
    </div>
  );
}

function AiModePicker({
  onClose,
  onSelect
}: {
  onClose: () => void;
  onSelect: (mode: AiAssistantMode) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/28 px-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div
        className="editor-toolbar-shell w-full max-w-xl rounded-[24px] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-2 pb-3 pt-1">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-white/86 uppercase">
            Choose AI Workspace
          </div>
          <div className="mt-1 text-[12px] text-white/42">
            Copilot edits the viewport. Morphus creates standalone HTML games.
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="editor-toolbar-segment rounded-[18px] p-4 text-left transition-colors hover:border-emerald-300/22"
            onClick={() => onSelect("copilot")}
            type="button"
          >
            <div className="text-[12px] font-semibold tracking-[0.16em] text-emerald-100 uppercase">
              Copilot
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/48">
              Uses Dream Studio viewport tools to inspect, place, edit, and refine scene content.
            </p>
          </button>
          <button
            className="editor-toolbar-segment rounded-[18px] p-4 text-left transition-colors hover:border-[#f6d07d]/28"
            onClick={() => onSelect("morphus")}
            type="button"
          >
            <div className="text-[12px] font-semibold tracking-[0.16em] text-[#f6d07d] uppercase">
              Morphus
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/48">
              Generates playable HTML and JavaScript games with a saved chat and file workspace.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

function LogicViewerFallback() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex">
      <div className="glass-panel glass-panel-strong mx-auto flex min-h-[240px] w-[min(100%,calc(100%-1rem))] items-center justify-center rounded-t-[1.35rem] border-x border-t border-white/8 bg-[#040907]/76">
        <div className="text-[11px] font-medium tracking-[0.18em] text-foreground/48 uppercase">
          Loading Logic View
        </div>
      </div>
    </div>
  );
}

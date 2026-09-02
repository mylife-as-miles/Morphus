import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSnapshot } from "valtio";
import {
  analyzeSceneSpatialLayout,
  axisDelta,
  createAssignMaterialCommand,
  createMeshTerrainNode,
  createProceduralWorldNodeCommand,
  createTerrainNodeCommand,
  createDeleteMaterialCommand,
  createUpsertAssetCommand,
  createDeleteTextureCommand,
  createDeleteSelectionCommand,
  createExtrudeBrushNodesCommand,
  createDuplicateNodesCommand,
  createInstanceNodesCommand,
  createEditorCore,
  createGroupSelectionCommand,
  createPlaceLightNodeCommand,
  createPlaceBlockoutPlatformCommand,
  createPlaceBlockoutRoomCommand,
  createPlaceBlockoutStairCommand,
  createReplaceNodesCommand,
  createPlacePrimitiveNodeCommand,
  createSetBrushDataCommand,
  createSetEntityCommand,
  createSetMeshDataCommand,
  createSetNodeCommand,
  createSetNodeTransformCommand,
  createPlaceEntityCommand,
  createMeshRaiseTopCommand,
  createMirrorNodesCommand,
  createPlaceBrushNodeCommand,
  createPlaceMeshNodeCommand,
  createPlaceModelNodeCommand,
  createSceneDocumentSnapshot,
  createSeedSceneDocument,
  createSetUvOffsetCommand,
  createSetUvScaleCommand,
  createSplitBrushNodeAtCoordinateCommand,
  createSplitBrushNodesCommand,
  createSetSceneSettingsCommand,
  createTranslateNodesCommand,
  createUpsertMaterialCommand,
  createUpsertTextureCommand,
  type SceneDocumentSnapshot,
  type TransformAxis
} from "@blud/editor-core";
import { convertBrushToEditableMesh, invertEditableMeshNormals } from "@blud/geometry-kernel";
import {
  createDerivedRenderSceneCache,
  deriveRenderSceneCached,
  gridSnapValues,
  type ViewportState
} from "@blud/render-pipeline";
import {
  type BrushShape,
  type GeometryNode,
  isBrushNode,
  isInstancingNode,
  isLightNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  isMeshTerrainNode,
  isProceduralWorldNode,
  createDefaultProceduralWorldNodeData,
  makeTransform,
  type Material,
  type MeshNode,
  type ModelNode,
  type PrimitiveNodeData,
  type ProceduralWorldNodeData,
  type ProceduralWorldNode,
  resolveSceneGraph,
  snapVec3,
  vec2,
  vec3,
  type Brush,
  type EditableMesh,
  type Entity,
  type EntityType,
  type LightNodeData,
  type LightType,
  type TextureRecord,
  type Vec2,
  type Vec3,
  type SceneSettings
} from "@blud/shared";
import type { PrimitiveShape } from "@blud/shared";
import type { HtmlJsImportFile, HtmlJsImportResult } from "@blud/scene-importer";
import { createToolSession, defaultToolId, defaultTools, type ToolId } from "@blud/tool-system";
import {
  createWorkerTaskManager,
  type WorkerJob
} from "@blud/workers";
import { slugifyProjectName, type EditorFileMetadata } from "@blud/dev-sync";
import { isWebHammerEngineBundle, type WebHammerEngineBundle } from "@blud/runtime-format";
import { EditorShell } from "@/components/EditorShell";
import { ConfirmDialog } from "@/components/editor-shell/ConfirmDialog";
import { HtmlJsImportDialog } from "@/components/editor-shell/HtmlJsImportDialog";
import { useGameConnection } from "@/app/hooks/useGameConnection";
import { uiStore, type RightPanelId } from "@/state/ui-store";
import type { Transform } from "@blud/shared";
import type { MeshEditMode } from "@/viewport/editing";
import type { ViewportBlockoutDropKind } from "@/viewport/utils/viewport-blockout-dnd";
import { useAppHotkeys } from "@/app/hooks/useAppHotkeys";
import { useCopilot } from "@/app/hooks/useCopilot";
import type { AiAssistantMode } from "@/lib/copilot/types";
import { GameConnectionControl } from "@/components/editor-shell/GameConnectionControl";
import { useEditorSubscriptions } from "@/app/hooks/useEditorSubscriptions";
import { 
  buildBank, buildBowl, buildFunBox, buildHalfPipe, buildHip, buildHubbaLedge, 
  buildKicker, buildLedge, buildManualPad, buildPyramid, buildQuarterPipe, 
  buildRail, buildSpine, buildStairSet, skateparkMaterials 
} from "@blud/skatepark";
import { SkateparkElementType } from "@blud/shared";

import { useExportWorker } from "@/app/hooks/useExportWorker";
import { clampSnapSize, resolveViewportSnapSize } from "@/viewport/utils/snap";
import type { MeshEditToolbarActionRequest, PreviewSessionMode } from "@/viewport/types";
import {
  createDefaultEntity,
  createDefaultLightData,
  createDefaultPrimitiveTransform,
  createLightNodeLabel,
  createPrimitiveNodeData,
  createPrimitiveNodeLabel
} from "@/lib/authoring";
import { getFloorPreset, type FloorPresetId } from "@/lib/floor-presets";
import type { ObjectGenerationResponse } from "@/lib/object-generation-contract";
import { convertPrimitiveNodeToMeshNode } from "@/lib/primitive-to-mesh";
import { createEditableMeshFromPlane, createEditableMeshFromPrimitiveData } from "@/lib/primitive-to-mesh";
import { resolveEffectiveSceneItemIds, toggleSceneItemId } from "@/lib/scene-hierarchy";
import {
  focusViewportOnPoint,
  resolveVisibleViewportPaneIds,
  viewportPaneIds,
  type ViewModeId,
  type ViewportPaneId
} from "@/viewport/viewports";
import { loadStoredSceneEditorDraft, saveSceneEditorDraft } from "@/lib/draft-storage";

type ModelAssetTools = typeof import("@/lib/model-assets");
type HtmlJsImportSession = {
  entrypointSelection: string;
  files: HtmlJsImportFile[];
  loading: boolean;
  projectName: string;
  result?: HtmlJsImportResult | null;
};

let modelAssetToolsPromise: Promise<ModelAssetTools> | null = null;

function loadModelAssetTools() {
  if (!modelAssetToolsPromise) {
    modelAssetToolsPromise = import("@/lib/model-assets");
  }

  return modelAssetToolsPromise;
}

export function App() {
  const viewportScreenshotCapturesRef = useRef(
    new Map<
      ViewportPaneId,
      () => Promise<{
        dataUrl: string;
        height: number;
        mimeType: string;
        width: number;
      }>
    >()
  );
  const [editor] = useState(() => createEditorCore(createSeedSceneDocument()));
  const [activeToolId, setActiveToolId] = useState<ToolId>(defaultToolId);
  const [activeBrushShape, setActiveBrushShape] = useState<BrushShape>("cube");
  const [aiModelPlacementArmed, setAiModelPlacementArmed] = useState(false);
  const [aiModelDraft, setAiModelDraft] = useState<{
    error?: string;
    nodeId: string;
    prompt: string;
  } | null>(null);
  const [meshEditMode, setMeshEditMode] = useState<MeshEditMode>("vertex");
  const [meshEditToolbarAction, setMeshEditToolbarAction] = useState<MeshEditToolbarActionRequest>();
  const [physicsPlayback, setPhysicsPlayback] = useState<"paused" | "running" | "stopped">("stopped");
  const [previewSessionMode, setPreviewSessionMode] = useState<PreviewSessionMode | null>(null);
  const [previewPossessed, setPreviewPossessed] = useState(false);
  const [previewStepTick, setPreviewStepTick] = useState(0);
  const [physicsRevision, setPhysicsRevision] = useState(0);
  const [selectedMaterialFaceIds, setSelectedMaterialFaceIds] = useState<string[]>([]);
  const [transformMode, setTransformMode] = useState<"rotate" | "scale" | "translate">("translate");
  const [workerManager] = useState(() => createWorkerTaskManager());
  const [workerJobs, setWorkerJobs] = useState<WorkerJob[]>([]);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [sculptMode, setSculptMode] = useState<string | null>(null);
  const [sculptBrushRadius, setSculptBrushRadius] = useState(3);
  const [sculptBrushStrength, setSculptBrushStrength] = useState(0.2);
  const [sculptBrushType, setSculptBrushType] = useState<"draw" | "smooth" | "grab">("draw");
  const [sculptSymmetryX, setSculptSymmetryX] = useState(false);
  const [selectedScenePathId, setSelectedScenePathId] = useState<string>();
  const [projectName, setProjectName] = useState("Untitled Scene");
  const [projectSlug, setProjectSlug] = useState("untitled-scene");
  const [projectSlugDirty, setProjectSlugDirty] = useState(false);
  const [hiddenSceneItemIds, setHiddenSceneItemIds] = useState<string[]>([]);
  const [lockedSceneItemIds, setLockedSceneItemIds] = useState<string[]>([]);
  const [htmlJsImportSession, setHtmlJsImportSession] = useState<HtmlJsImportSession | null>(null);
  const [newFileConfirmOpen, setNewFileConfirmOpen] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const latestDraftRef = useRef<ReturnType<typeof buildSceneDraftPayload> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const glbImportInputRef = useRef<HTMLInputElement | null>(null);
  const htmlJsImportInputRef = useRef<HTMLInputElement | null>(null);
  const previewRestoreViewportIdRef = useRef<ViewportPaneId | null>(null);
  const renderSceneCacheRef = useRef(createDerivedRenderSceneCache());
  const ui = useSnapshot(uiStore);
  const toolSession = useMemo(() => createToolSession(activeToolId), [activeToolId]);
  const { downloadBinaryFile, downloadTextFile, exportJobs, runWorkerRequest } = useExportWorker();
  const gameConnection = useGameConnection();
  const renderScene = useMemo(
    () =>
      deriveRenderSceneCached(
        editor.scene.nodes.values(),
        editor.scene.entities.values(),
        editor.scene.materials.values(),
        editor.scene.assets.values(),
        renderSceneCacheRef.current
      ),
    [editor, sceneRevision]
  );
  const spatialAnalysis = useMemo(() => analyzeSceneSpatialLayout(editor.scene), [editor, sceneRevision]);
  const sceneNodes = useMemo(() => Array.from(editor.scene.nodes.values()), [editor, sceneRevision]);
  const sceneEntities = useMemo(() => Array.from(editor.scene.entities.values()), [editor, sceneRevision]);
  const sceneItemIdSet = useMemo(
    () => new Set<string>([...sceneNodes.map((node) => node.id), ...sceneEntities.map((entity) => entity.id)]),
    [sceneEntities, sceneNodes]
  );
  const effectiveHiddenSceneItemIds = useMemo(
    () => resolveEffectiveSceneItemIds(sceneNodes, sceneEntities, hiddenSceneItemIds),
    [hiddenSceneItemIds, sceneEntities, sceneNodes]
  );
  const effectiveLockedSceneItemIds = useMemo(
    () => resolveEffectiveSceneItemIds(sceneNodes, sceneEntities, lockedSceneItemIds),
    [lockedSceneItemIds, sceneEntities, sceneNodes]
  );
  const blockedSceneItemIdSet = useMemo(
    () => new Set<string>([...effectiveHiddenSceneItemIds, ...effectiveLockedSceneItemIds]),
    [effectiveHiddenSceneItemIds, effectiveLockedSceneItemIds]
  );
  const resolvedProjectName = projectName.trim() || "Untitled Scene";
  const resolvedProjectSlug = slugifyProjectName(projectSlug.trim() || resolvedProjectName);

  useEditorSubscriptions(editor, setSceneRevision, setSelectionRevision);

  useEffect(() => workerManager.subscribe(setWorkerJobs), [workerManager]);

  useEffect(() => {
    const filterValidIds = (currentIds: string[]) => {
      const nextIds = currentIds.filter((id) => sceneItemIdSet.has(id));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    };

    setHiddenSceneItemIds(filterValidIds);
    setLockedSceneItemIds(filterValidIds);
  }, [sceneItemIdSet]);

  useEffect(() => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const nextSelection = editor.selection.ids.filter((id) => !blockedSceneItemIdSet.has(id));

    if (nextSelection.length === editor.selection.ids.length) {
      return;
    }

    editor.select(nextSelection, "object");
  }, [blockedSceneItemIdSet, editor, selectionRevision]);

  useEffect(() => {
    if (!aiModelDraft) {
      return;
    }

    const node = editor.scene.getNode(aiModelDraft.nodeId);

    if (node && !isModelNode(node)) {
      return;
    }

    setAiModelDraft(null);
    setAiModelPlacementArmed(false);
  }, [aiModelDraft, editor, sceneRevision]);

  useEffect(() => {
    const scenePaths = editor.scene.settings.paths ?? [];

    if (scenePaths.length === 0) {
      setSelectedScenePathId(undefined);
      return;
    }

    if (!selectedScenePathId || !scenePaths.some((pathDefinition) => pathDefinition.id === selectedScenePathId)) {
      setSelectedScenePathId(scenePaths[0]?.id);
    }
  }, [editor, sceneRevision, selectedScenePathId]);

  const handleSelectNodes = (nodeIds: string[]) => {
    if (physicsPlayback !== "stopped") {
      return;
    }

    editor.select(nodeIds.filter((nodeId) => !blockedSceneItemIdSet.has(nodeId)), "object");
  };

  const handleToggleSceneItemVisibility = (itemId: string) => {
    setHiddenSceneItemIds((currentIds) => toggleSceneItemId(currentIds, itemId));
  };

  const handleToggleSceneItemLock = (itemId: string) => {
    setLockedSceneItemIds((currentIds) => toggleSceneItemId(currentIds, itemId));
  };

  const handleSetToolId = (toolId: ToolId) => {
    setActiveToolId(toolId);
  };

  useEffect(() => {
    if (activeToolId !== "mesh-edit") {
      setSculptMode(null);
      return;
    }

    const selectedNodeId = editor.selection.ids[0];
    const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;

    if (!selectedNode || !isPrimitiveNode(selectedNode) || selectedNode.data.role !== "prop") {
      return;
    }

    editor.execute(
      createReplaceNodesCommand(
        editor.scene,
        [convertPrimitiveNodeToMeshNode(selectedNode)],
        "promote prop to mesh"
      )
    );
  }, [activeToolId, editor, sceneRevision, selectionRevision]);

  const handleSetRightPanel = (panel: RightPanelId | null) => {
    uiStore.rightPanel = panel;
  };

  const handleActivateViewport = (viewportId: ViewportPaneId) => {
    uiStore.activeViewportId = viewportId;
  };

  const resolveViewportFocusPoint = () => {
    const selectedNodeId = editor.selection.ids[0];
    const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
    const selectedEntity = !selectedNode && selectedNodeId ? editor.scene.getEntity(selectedNodeId) : undefined;

    if (selectedNode) {
      return renderScene.nodeTransforms.get(selectedNode.id)?.position ?? selectedNode.transform.position;
    }

    if (selectedEntity) {
      return renderScene.entityTransforms.get(selectedEntity.id)?.position ?? selectedEntity.transform.position;
    }

    return vec3(0, 0, 0);
  };

  const handleSetViewMode = (viewMode: ViewModeId) => {
    uiStore.viewMode = viewMode;

    const visiblePaneIds = resolveVisibleViewportPaneIds(viewMode);

    if (!visiblePaneIds.includes(uiStore.activeViewportId)) {
      uiStore.activeViewportId = "perspective";
    }

    if (viewMode === "3d-only") {
      return;
    }

    const focusPoint = resolveViewportFocusPoint();

    (["top", "front", "side"] as const).forEach((viewportId) => {
      focusViewportOnPoint(uiStore.viewports[viewportId], focusPoint);
    });
  };

  const handleUpdateViewport = (viewportId: ViewportPaneId, viewport: ViewportState) => {
    uiStore.viewports[viewportId].projection = viewport.projection;
    uiStore.viewports[viewportId].camera = viewport.camera;
  };

  const handleRegisterViewportScreenshotCapture = (
    viewportId: ViewportPaneId,
    capture:
      | (() => Promise<{
          dataUrl: string;
          height: number;
          mimeType: string;
          width: number;
        }>)
      | null
  ) => {
    if (capture) {
      viewportScreenshotCapturesRef.current.set(viewportId, capture);
      return;
    }

    viewportScreenshotCapturesRef.current.delete(viewportId);
  };

  const handleToggleViewportQuality = () => {
    uiStore.viewportQuality =
      uiStore.viewportQuality === 0.5
        ? 0.75
        : uiStore.viewportQuality === 0.75
          ? 1
          : uiStore.viewportQuality === 1
            ? 1.5
            : 0.5;
  };

  const handleClearSelection = () => {
    editor.clearSelection();
  };

  const resolveSceneItemFocusPoint = (nodeId: string) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      const entity = editor.scene.getEntity(nodeId);

      if (!entity) {
        return undefined;
      }

      return renderScene.entityTransforms.get(entity.id)?.position ?? entity.transform.position;
    }

    return renderScene.nodeTransforms.get(node.id)?.position ?? node.transform.position;
  };

  const handleFocusSelection = () => {
    const selectedId = editor.selection.ids[0];

    if (!selectedId) {
      return;
    }

    const focusPoint = resolveSceneItemFocusPoint(selectedId);

    if (!focusPoint) {
      return;
    }

    focusViewportOnPoint(uiStore.viewports[uiStore.activeViewportId], focusPoint);
  };

  const handleFocusNode = (nodeId: string) => {
    const focusPoint = resolveSceneItemFocusPoint(nodeId);

    if (!focusPoint) {
      return;
    }

    viewportPaneIds.forEach((viewportId) => {
      focusViewportOnPoint(uiStore.viewports[viewportId], focusPoint);
    });
  };

  const handleSetSnapSize = (snapSize: number) => {
    const nextSnapSize = clampSnapSize(snapSize);

    viewportPaneIds.forEach((viewportId) => {
      uiStore.viewports[viewportId].grid.snapSize = nextSnapSize;
    });
  };

  const handleSetSnapEnabled = (enabled: boolean) => {
    viewportPaneIds.forEach((viewportId) => {
      uiStore.viewports[viewportId].grid.enabled = enabled;
    });
  };

  const handleMeshEditToolbarAction = (kind: MeshEditToolbarActionRequest["kind"]) => {
    setMeshEditToolbarAction((current) => ({
      id: (current?.id ?? 0) + 1,
      kind
    }));
  };

  const handleUpdateNodeTransform = (
    nodeId: string,
    transform: Parameters<typeof createSetNodeTransformCommand>[2],
    beforeTransform?: Parameters<typeof createSetNodeTransformCommand>[3]
  ) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    editor.execute(createSetNodeTransformCommand(editor.scene, nodeId, transform, beforeTransform));
    enqueueWorkerJob(
      "Transform update",
      { task: node.kind === "brush" ? "brush-rebuild" : "triangulation", worker: "geometryWorker" },
      550
    );
  };

  const handleUpdateNode = (nodeId: string, nextNode: GeometryNode, beforeNode?: GeometryNode) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    editor.execute(createSetNodeCommand(editor.scene, nodeId, nextNode, beforeNode));
  };

  const handlePreviewBrushData = (nodeId: string, brush: Brush) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isBrushNode(node)) {
      return;
    }

    node.data = structuredClone(brush);
    editor.scene.touch();
    setSceneRevision((revision) => revision + 1);
  };

  const handleUpdateBrushData = (nodeId: string, brush: Brush, beforeBrush?: Brush) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isBrushNode(node)) {
      return;
    }

    editor.execute(createSetBrushDataCommand(editor.scene, nodeId, brush, beforeBrush));
    enqueueWorkerJob("Brush edit", { task: "brush-rebuild", worker: "geometryWorker" }, 700);
  };

  const handleSplitBrushAtCoordinate = (nodeId: string, axis: TransformAxis, coordinate: number) => {
    const { command, splitIds } = createSplitBrushNodeAtCoordinateCommand(editor.scene, nodeId, axis, coordinate);

    if (splitIds.length === 0) {
      return;
    }

    editor.execute(command);
    editor.select(splitIds, "object");
    enqueueWorkerJob("Clip brush", { task: "clip", worker: "geometryWorker" }, 950);
  };

  const handlePreviewMeshData = (nodeId: string, mesh: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    node.data = preserveMeshMetadata(mesh, node.data);
    editor.scene.touch();
    setSceneRevision((revision) => revision + 1);
  };

  const handleUpdateMeshData = (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    editor.execute(
      createSetMeshDataCommand(
        editor.scene,
        nodeId,
        preserveMeshMetadata(mesh, node.data),
        beforeMesh
      )
    );
    enqueueWorkerJob("Mesh edit", { task: "triangulation", worker: "meshWorker" }, 800);
  };

  const handlePreviewNodeTransform = (nodeId: string, transform: Transform) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    node.transform = isInstancingNode(node)
      ? {
          position: structuredClone(transform.position),
          rotation: structuredClone(transform.rotation),
          scale: structuredClone(transform.scale)
        }
      : structuredClone(transform);
    editor.scene.touch();
    setSceneRevision((revision) => revision + 1);
  };

  const handlePreviewEntityTransform = (entityId: string, transform: Transform) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    entity.transform = structuredClone(transform);
    editor.scene.touch();
    setSceneRevision((revision) => revision + 1);
  };

  const handleUpdateEntity = (entityId: string, nextEntity: Entity, beforeEntity?: Entity) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    editor.execute(createSetEntityCommand(editor.scene, entityId, nextEntity, beforeEntity));
    enqueueWorkerJob("Entity update", { task: "navmesh", worker: "navWorker" }, 450);
  };

  const handleUpdateEntityTransform = (entityId: string, transform: Transform, beforeTransform?: Transform) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    handleUpdateEntity(
      entityId,
      {
        ...structuredClone(entity),
        transform: structuredClone(transform)
      },
      beforeTransform
        ? {
            ...structuredClone(entity),
            transform: structuredClone(beforeTransform)
          }
        : entity
    );
  };

  const handleUpdateEntityProperties = (
    entityId: string,
    properties: Entity["properties"],
    beforeProperties?: Entity["properties"]
  ) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    handleUpdateEntity(
      entityId,
      {
        ...structuredClone(entity),
        properties: structuredClone(properties)
      },
      beforeProperties
        ? {
            ...structuredClone(entity),
            properties: structuredClone(beforeProperties)
          }
        : entity
    );
  };

  const handleUpdateNodeHooks = (
    nodeId: string,
    hooks: NonNullable<GeometryNode["hooks"]>,
    beforeHooks?: NonNullable<GeometryNode["hooks"]>
  ) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    handleUpdateNode(
      nodeId,
      {
        ...structuredClone(node),
        hooks: structuredClone(hooks)
      },
      beforeHooks
        ? {
            ...structuredClone(node),
            hooks: structuredClone(beforeHooks)
          }
        : node
    );
  };

  const handleUpdateEntityHooks = (
    entityId: string,
    hooks: NonNullable<Entity["hooks"]>,
    beforeHooks?: NonNullable<Entity["hooks"]>
  ) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    handleUpdateEntity(
      entityId,
      {
        ...structuredClone(entity),
        hooks: structuredClone(hooks)
      },
      beforeHooks
        ? {
            ...structuredClone(entity),
            hooks: structuredClone(beforeHooks)
          }
        : entity
    );
  };

  const enqueueWorkerJob = (label: string, task: Parameters<typeof workerManager.enqueue>[0], durationMs?: number) => {
    workerManager.enqueue(task, label, durationMs);
  };

  const resolveActiveViewportState = () => uiStore.viewports[uiStore.activeViewportId];

  const handleTranslateSelection = (axis: TransformAxis, direction: -1 | 1) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const delta = axisDelta(axis, resolveViewportSnapSize(resolveActiveViewportState()) * direction);
    editor.execute(createTranslateNodesCommand(editor.selection.ids, delta));
    enqueueWorkerJob("Geometry rebuild", { task: "brush-rebuild", worker: "geometryWorker" }, 700);
  };

  const handleDuplicateSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const { command, duplicateIds } = createDuplicateNodesCommand(
      editor.scene,
      editor.selection.ids,
      axisDelta("x", resolveViewportSnapSize(resolveActiveViewportState()))
    );

    editor.execute(command);
    editor.select(duplicateIds, "object");
    enqueueWorkerJob("Duplicate selection", { task: "triangulation", worker: "geometryWorker" }, 700);
  };

  const handleInstanceSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const { command, instanceIds } = createInstanceNodesCommand(
      editor.scene,
      editor.selection.ids,
      axisDelta("x", resolveViewportSnapSize(resolveActiveViewportState()))
    );

    if (instanceIds.length === 0) {
      return;
    }

    editor.execute(command);
    editor.select(instanceIds, "object");
  };

  const handleGroupSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const result = createGroupSelectionCommand(editor.scene, editor.selection.ids);

    if (!result) {
      return;
    }

    editor.execute(result.command);
    editor.select([result.groupId], "object");
    enqueueWorkerJob("Group selection", { task: "triangulation", worker: "geometryWorker" }, 550);
  };

  const handleDeleteSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    editor.execute(createDeleteSelectionCommand(editor.scene, editor.selection.ids));
    editor.clearSelection();
    enqueueWorkerJob("Delete selection", { task: "brush-rebuild", worker: "geometryWorker" }, 550);
  };

  const handleMirrorSelection = (axis: TransformAxis) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    editor.execute(createMirrorNodesCommand(editor.selection.ids, axis));
    enqueueWorkerJob("Mirror selection", { task: "triangulation", worker: "geometryWorker" }, 700);
  };

  const handleClipSelection = (axis: TransformAxis) => {
    const { command, splitIds } = createSplitBrushNodesCommand(editor.scene, editor.selection.ids, axis);

    if (splitIds.length === 0) {
      return;
    }

    editor.execute(command);
    editor.select(splitIds, "object");
    enqueueWorkerJob("Clip brush", { task: "clip", worker: "geometryWorker" }, 950);
  };

  const handleExtrudeSelection = (axis: TransformAxis, direction: -1 | 1) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const selectedNode = editor.scene.getNode(editor.selection.ids[0]);

    if (selectedNode && isBrushNode(selectedNode)) {
      editor.execute(
        createExtrudeBrushNodesCommand(
          editor.scene,
          editor.selection.ids,
          axis,
          resolveViewportSnapSize(resolveActiveViewportState()),
          direction
        )
      );
      enqueueWorkerJob("Brush extrude", { task: "brush-rebuild", worker: "geometryWorker" }, 950);
      return;
    }

    if (selectedNode && isMeshNode(selectedNode) && axis === "y") {
      editor.execute(
        createMeshRaiseTopCommand(editor.scene, editor.selection.ids, resolveViewportSnapSize(resolveActiveViewportState()) * direction)
      );
      enqueueWorkerJob("Mesh triangulation", { task: "triangulation", worker: "meshWorker" }, 850);
    }
  };

  const handlePlaceAsset = (position: Vec3) => {
    const snapped = snapVec3(position, resolveViewportSnapSize(resolveActiveViewportState()));
    const asset = editor.scene.assets.get(uiStore.selectedAssetId);

    if (!asset || asset.type !== "model") {
      return;
    }

    const label = asset.id.endsWith("barrel") ? "Barrel Prop" : "Crate Prop";
    const { command, nodeId } = createPlaceModelNodeCommand(editor.scene, vec3(snapped.x, 1.1, snapped.z), {
      data: {
        assetId: asset.id,
        path: asset.path
      },
      name: label
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Asset placement", { task: "triangulation", worker: "geometryWorker" }, 650);
  };

  const handleImportGlb = () => {
    glbImportInputRef.current?.click();
  };

  const handleImportHtmlJs = () => {
    htmlJsImportInputRef.current?.click();
  };

  const runHtmlJsImport = async (files: HtmlJsImportFile[], nextProjectName: string, entrypointSelection = "") => {
    setHtmlJsImportSession((current) => ({
      entrypointSelection,
      files,
      loading: true,
      projectName: nextProjectName,
      result: current?.result ?? null
    }));

    try {
      const payload = await runWorkerRequest(
        {
          ...(entrypointSelection ? { entrypoint: entrypointSelection } : {}),
          files,
          kind: "htmljs-import",
          projectName: nextProjectName
        },
        "Analyze HTML/JS Scene"
      );

      if (!isHtmlJsImportResult(payload)) {
        throw new Error("HTML/JS import worker returned an unexpected payload.");
      }

      setHtmlJsImportSession({
        entrypointSelection: payload.report.entrypoint ?? entrypointSelection,
        files,
        loading: false,
        projectName: nextProjectName,
        result: payload
      });
    } catch (error) {
      console.error("Failed to import the HTML/JS scene.", error);
      setHtmlJsImportSession((current) =>
        current
          ? {
              ...current,
              loading: false
            }
          : null
      );
    }
  };

  const handleHtmlJsFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (fileList.length === 0) {
      return;
    }

    const files = await Promise.all(
      fileList.map(async (file) => ({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || undefined,
        path: file.webkitRelativePath || file.name
      }))
    );
    const nextProjectName = deriveHtmlJsImportProjectName(fileList);

    await runHtmlJsImport(files, nextProjectName);
  };

  const handleGlbFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const { analyzeModelSource, createModelAsset, readFileAsDataUrl, resolveModelFitScale } = await loadModelAssetTools();
      const dataUrl = await readFileAsDataUrl(file);
      const bounds = await analyzeModelSource({
        format: "glb",
        path: dataUrl
      });
      const name = file.name.replace(/\.[^.]+$/, "") || "Imported Model";
      const asset = createModelAsset({
        center: bounds.center,
        format: "glb",
        name,
        path: dataUrl,
        size: bounds.size,
        source: "import"
      });
      const fitScale = resolveModelFitScale(vec3(2, 2, 2), bounds);
      const target = resolvePlacementTarget();
      const { command, nodeId } = createPlaceModelNodeCommand(
        editor.scene,
        {
          position: vec3(target.x, target.y + 1, target.z),
          rotation: vec3(0, 0, 0),
          scale: vec3(fitScale, fitScale, fitScale)
        },
        {
          data: {
            assetId: asset.id,
            path: asset.path
          },
          name
        }
      );

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(command);
      editor.select([nodeId], "object");
      uiStore.selectedAssetId = asset.id;
      enqueueWorkerJob("GLB import", { task: "triangulation", worker: "geometryWorker" }, 650);
    } finally {
      event.target.value = "";
    }
  };

  const resolvePlacementPosition = (size: Vec3) => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
    const gridElevation = activeViewportState.grid.elevation;

    return vec3(snappedTarget.x, gridElevation + size.y * 0.5, snappedTarget.z);
  };

  const resolvePlacementTarget = () => {
    const activeViewportState = resolveActiveViewportState();
    return snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
  };

  const handleArmAiModelPlacement = () => {
    if (aiModelDraft?.nodeId && editor.scene.getNode(aiModelDraft.nodeId)) {
      editor.select([aiModelDraft.nodeId], "object");
      setActiveToolId("transform");
      setTransformMode("scale");
      setAiModelPlacementArmed(false);
      return;
    }

    setAiModelPlacementArmed(true);
    setAiModelDraft((current) =>
      current
        ? {
            ...current,
            error: undefined
          }
        : current
    );
    setActiveToolId("brush");
  };

  const handleCancelAiModelPlacement = () => {
    setAiModelPlacementArmed(false);
    setAiModelDraft(null);
  };

  const handleUpdateAiModelPrompt = (prompt: string) => {
    setAiModelDraft((current) =>
      current
        ? {
            ...current,
            error: undefined,
            prompt
          }
        : current
    );
  };

  const handlePlaceAiModelPlaceholder = (position: Vec3) => {
    void loadModelAssetTools().then(({ createAiModelPlaceholder }) => {
      const placeholder = createAiModelPlaceholder(position);
      const { command, nodeId } = createPlacePrimitiveNodeCommand(editor.scene, placeholder.transform, {
        data: placeholder.data,
        name: placeholder.name
      });

      editor.execute(command);
      editor.select([nodeId], "object");
      setAiModelPlacementArmed(false);
      setActiveToolId("transform");
      setTransformMode("scale");
      setAiModelDraft((current) => ({
        error: undefined,
        nodeId,
        prompt: current?.prompt ?? ""
      }));
      enqueueWorkerJob("AI proxy placement", { task: "triangulation", worker: "geometryWorker" }, 500);
    });
  };

  const handleGenerateAiModel = async () => {
    if (!aiModelDraft || aiModelDraft.prompt.trim().length === 0) {
      return;
    }

    const { nodeId, prompt } = aiModelDraft;
    const node = editor.scene.getNode(nodeId);

    if (!node || !isPrimitiveNode(node)) {
      setAiModelDraft((current) =>
        current
          ? {
              ...current,
              error: "Proxy cube is missing."
            }
          : current
      );
      return;
    }

    setAiModelDraft(null);
    setAiModelPlacementArmed(false);
    void queueAiModelGeneration(nodeId, prompt.trim());
  };

  const queueAiModelGeneration = async (nodeId: string, prompt: string) => {
    try {
      const { analyzeModelSource, createModelAsset, resolveModelFitScale, resolvePrimitiveNodeBounds } =
        await loadModelAssetTools();
      const payload = await runWorkerRequest(
        {
          kind: "ai-model-generate",
          prompt
        },
        "Generate AI 3D"
      );

      if (typeof payload !== "string") {
        throw new Error("Invalid AI model response.");
      }

      const parsed = JSON.parse(payload) as ObjectGenerationResponse;

      if (!parsed.asset) {
        throw new Error("Missing AI model payload.");
      }

      const generated = parsed.asset;
      const bounds = await analyzeModelSource({
        format: "obj",
        path: generated.modelDataUrl
      });
      const asset = createModelAsset({
        center: bounds.center,
        format: "obj",
        materialMtlText: generated.materialMtlText,
        name: generated.name,
        path: generated.modelDataUrl,
        prompt: generated.prompt,
        size: bounds.size,
        source: "ai",
        texturePath: generated.textureDataUrl
      });
      const latestNode = editor.scene.getNode(nodeId);

      if (!latestNode || !isPrimitiveNode(latestNode)) {
        return;
      }

      const targetBounds = resolvePrimitiveNodeBounds(latestNode) ?? vec3(2, 2, 2);
      const fitScale = resolveModelFitScale(targetBounds, bounds);
      const replacement: ModelNode = {
        id: latestNode.id,
        kind: "model",
        name: generated.name,
        transform: {
          ...structuredClone(latestNode.transform),
          scale: vec3(fitScale, fitScale, fitScale)
        },
        data: {
          assetId: asset.id,
          path: asset.path
        }
      };

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "generate ai model"));
      if (editor.selection.ids.includes(replacement.id)) {
        editor.select([replacement.id], "object");
      }
      uiStore.selectedAssetId = asset.id;
      enqueueWorkerJob("AI model generation", { task: "triangulation", worker: "geometryWorker" }, 700);
    } catch (error) {
      setAiModelDraft({
        error: error instanceof Error ? error.message : "Failed to generate model.",
        nodeId,
        prompt
      });
    }
  };

  const handlePlaceBlockoutPlatform = () => {
    const target = resolvePlacementTarget();
    const gridElevation = resolveActiveViewportState().grid.elevation;
    const { command, nodeId } = createPlaceBlockoutPlatformCommand(editor.scene, {
      name: "Open Platform",
      position: vec3(target.x, gridElevation + 0.25, target.z),
      size: vec3(8, 0.5, 8),
      tags: ["play-space", "open-area"]
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Blockout platform", { task: "brush-rebuild", worker: "geometryWorker" }, 650);
  };

  const handlePlaceBlockoutRoom = (openSides: Array<"east" | "north" | "south" | "top" | "west"> = []) => {
    const target = resolvePlacementTarget();
    const gridElevation = resolveActiveViewportState().grid.elevation;
    const { command, nodeIds } = createPlaceBlockoutRoomCommand(editor.scene, {
      name: openSides.length > 0 ? "Open Room" : "Closed Room",
      openSides,
      position: vec3(target.x, gridElevation, target.z),
      size: vec3(10, 4, 10),
      tags: [openSides.length > 0 ? "open-room" : "closed-room", "play-space"]
    });

    editor.execute(command);
    editor.select(nodeIds, "object");
    enqueueWorkerJob("Blockout room", { task: "brush-rebuild", worker: "geometryWorker" }, 800);
  };

  const handlePlaceBlockoutStairs = () => {
    const target = resolvePlacementTarget();
    const gridElevation = resolveActiveViewportState().grid.elevation;
    const { command, nodeIds } = createPlaceBlockoutStairCommand(editor.scene, {
      direction: "north",
      name: "Blockout Stairs",
      position: vec3(target.x, gridElevation + 0.1, target.z),
      stepCount: 10,
      stepHeight: 0.2,
      tags: ["vertical-connector"],
      treadDepth: 0.6,
      width: 3
    });

    editor.execute(command);
    editor.select(nodeIds, "object");
    enqueueWorkerJob("Blockout stairs", { task: "brush-rebuild", worker: "geometryWorker" }, 850);
  };

  const handleDropBlockout = (kind: ViewportBlockoutDropKind, surfacePoint: Vec3) => {
    const p = surfacePoint;

    if (kind === "platform") {
      const { command, nodeId } = createPlaceBlockoutPlatformCommand(editor.scene, {
        name: "Open Platform",
        position: vec3(p.x, p.y + 0.25, p.z),
        size: vec3(8, 0.5, 8),
        tags: ["play-space", "open-area"]
      });

      editor.execute(command);
      editor.select([nodeId], "object");
      enqueueWorkerJob("Blockout platform", { task: "brush-rebuild", worker: "geometryWorker" }, 650);
      return;
    }

    if (kind === "closed-room") {
      const { command, nodeIds } = createPlaceBlockoutRoomCommand(editor.scene, {
        name: "Closed Room",
        openSides: [],
        position: vec3(p.x, p.y, p.z),
        size: vec3(10, 4, 10),
        tags: ["closed-room", "play-space"]
      });

      editor.execute(command);
      editor.select(nodeIds, "object");
      enqueueWorkerJob("Blockout room", { task: "brush-rebuild", worker: "geometryWorker" }, 800);
      return;
    }

    if (kind === "open-room") {
      const { command, nodeIds } = createPlaceBlockoutRoomCommand(editor.scene, {
        name: "Open Room",
        openSides: ["south"],
        position: vec3(p.x, p.y, p.z),
        size: vec3(10, 4, 10),
        tags: ["open-room", "play-space"]
      });

      editor.execute(command);
      editor.select(nodeIds, "object");
      enqueueWorkerJob("Blockout room", { task: "brush-rebuild", worker: "geometryWorker" }, 800);
      return;
    }

    const { command, nodeIds } = createPlaceBlockoutStairCommand(editor.scene, {
      direction: "north",
      name: "Blockout Stairs",
      position: vec3(p.x, p.y + 0.1, p.z),
      stepCount: 10,
      stepHeight: 0.2,
      tags: ["vertical-connector"],
      treadDepth: 0.6,
      width: 3
    });

    editor.execute(command);
    editor.select(nodeIds, "object");
    enqueueWorkerJob("Blockout stairs", { task: "brush-rebuild", worker: "geometryWorker" }, 850);
  };

  const handlePlaceFloorPreset = (presetId: FloorPresetId) => {
    const preset = getFloorPreset(presetId);
    if (!preset) return;

    const target = resolvePlacementTarget();
    const materialId = `material:floor:${preset.id}`;

    const material = {
      id: materialId,
      name: preset.name,
      category: "custom" as const,
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness
    };

    editor.execute(createUpsertMaterialCommand(editor.scene, material));

    const { command, nodeId } = createPlaceBlockoutPlatformCommand(editor.scene, {
      materialId,
      name: `${preset.name} Floor`,
      position: vec3(target.x, target.y, target.z),
      size: vec3(20, 0.15, 20),
      tags: ["floor", preset.id]
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob(`${preset.name} floor`, { task: "brush-rebuild", worker: "geometryWorker" }, 650);

    const currentSettings = editor.scene.settings;
    const nextSettings: SceneSettings = {
      ...currentSettings,
      world: { ...currentSettings.world, floorPresetId: preset.id }
    };
    editor.execute(createSetSceneSettingsCommand(editor.scene, nextSettings, currentSettings));
  };

  const handleCreateBrush = () => {
    if (activeBrushShape === "custom-polygon" || activeBrushShape === "stairs" || activeBrushShape === "ramp") {
      setActiveToolId("brush");
      return;
    }

    if (activeBrushShape === "plane") {
      const size = vec3(2, 0, 2);

      handlePlaceMeshNode(
        createEditableMeshFromPlane(size, "brush:plane"),
        createDefaultPrimitiveTransform(resolvePlacementPosition(size)),
        "Blockout Plane"
      );
      return;
    }

    const data = createPrimitiveNodeData("brush", activeBrushShape);
    handlePlaceMeshNode(
      createEditableMeshFromPrimitiveData(data, `brush:${activeBrushShape}`),
      createDefaultPrimitiveTransform(resolvePlacementPosition(data.size)),
      createPrimitiveNodeLabel("brush", activeBrushShape)
    );
  };

  const handlePlaceBrush = (brush: Brush, transform: Transform) => {
    const { command, nodeId } = createPlaceBrushNodeCommand(editor.scene, transform, {
      data: brush,
      name: "Blockout Brush"
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Brush creation", { task: "brush-rebuild", worker: "geometryWorker" }, 700);
  };

  const handlePlaceMeshNode = (mesh: EditableMesh, transform: Transform, name: string) => {
    const { command, nodeId } = createPlaceMeshNodeCommand(editor.scene, transform, {
      data: mesh,
      name
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Mesh creation", { task: "triangulation", worker: "geometryWorker" }, 700);
  };

  const handlePlacePrimitiveNode = (data: PrimitiveNodeData, transform: Transform, name: string) => {
    const { command, nodeId } = createPlacePrimitiveNodeCommand(editor.scene, transform, {
      data,
      name
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob(
      `${data.role === "brush" ? "Brush" : "Prop"} placement`,
      { task: "triangulation", worker: "geometryWorker" },
      650
    );
  };

  const handlePlaceProp = (shape: PrimitiveShape) => {
    const data = createPrimitiveNodeData("prop", shape);
    const transform = createDefaultPrimitiveTransform(
      resolvePlacementPosition(data.size)
    );
    const meshData = convertPrimitiveNodeToMeshNode({
      id: `node:prop:${shape}:${crypto.randomUUID()}`,
      kind: "primitive",
      name: createPrimitiveNodeLabel("prop", shape),
      transform,
      data
    }).data;

    handlePlaceMeshNode(
      meshData,
      transform,
      createPrimitiveNodeLabel("prop", shape)
    );
  };

  const handlePlaceLight = (type: LightType) => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
    const position = vec3(snappedTarget.x, type === "ambient" ? 0 : 3, snappedTarget.z);
    const { command, nodeId } = createPlaceLightNodeCommand(editor.scene, makeTransform(position), {
      data: createDefaultLightData(type),
      name: createLightNodeLabel(type)
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Light authoring", { task: "triangulation", worker: "geometryWorker" }, 500);
  };

  const handleCommitMeshTopology = (nodeId: string, mesh: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    if (isMeshNode(node)) {
      editor.execute(
        createSetMeshDataCommand(
          editor.scene,
          nodeId,
          preserveMeshMetadata(mesh, node.data),
          node.data
        )
      );
    } else if (isBrushNode(node)) {
      const replacement: MeshNode = {
        id: node.id,
        kind: "mesh",
        name: node.name,
        transform: structuredClone(node.transform),
        data: structuredClone(mesh)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "promote brush to mesh"));
    }

    enqueueWorkerJob("Topology edit", { task: "triangulation", worker: "meshWorker" }, 850);
  };

  const handleInvertSelectionNormals = () => {
    const replacements: GeometryNode[] = editor.selection.ids
      .map((nodeId) => editor.scene.getNode(nodeId))
      .filter((node): node is GeometryNode => Boolean(node))
      .flatMap((node) => {
        if (isMeshNode(node)) {
          return [
            {
              ...structuredClone(node),
              data: invertEditableMeshNormals(node.data)
            } satisfies MeshNode
          ];
        }

        if (isBrushNode(node)) {
          const converted = convertBrushToEditableMesh(node.data);

          if (!converted) {
            return [];
          }

          return [
            {
              id: node.id,
              kind: "mesh" as const,
              name: node.name,
              transform: structuredClone(node.transform),
              data: invertEditableMeshNormals(converted)
            } satisfies MeshNode
          ];
        }

        return [];
      });

    if (replacements.length === 0) {
      return;
    }

    editor.execute(createReplaceNodesCommand(editor.scene, replacements, "invert normals"));
    enqueueWorkerJob("Invert normals", { task: "triangulation", worker: "meshWorker" }, 650);
  };

  const handleApplyMaterial = (materialId: string, scope: "faces" | "object", faceIds: string[]) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    uiStore.selectedMaterialId = materialId;
    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createAssignMaterialCommand(editor.scene, targets, materialId));
    enqueueWorkerJob("Material preview rebuild", { task: "triangulation", worker: "geometryWorker" }, 600);
  };

  const handleSetMaterialUvScale = (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createSetUvScaleCommand(editor.scene, targets, vec2(uvScale.x, uvScale.y)));
    enqueueWorkerJob("UV update", { task: "triangulation", worker: "geometryWorker" }, 450);
  };

  const handleSetMaterialUvOffset = (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createSetUvOffsetCommand(editor.scene, targets, vec2(uvOffset.x, uvOffset.y)));
    enqueueWorkerJob("UV update", { task: "triangulation", worker: "geometryWorker" }, 450);
  };

  const handleUpsertMaterial = (material: Material) => {
    editor.execute(createUpsertMaterialCommand(editor.scene, material));
    uiStore.selectedMaterialId = material.id;
    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
  };

  const handleUpsertTexture = (texture: TextureRecord) => {
    editor.execute(createUpsertTextureCommand(editor.scene, texture));
  };

  const handleDeleteTexture = (textureId: string) => {
    editor.execute(createDeleteTextureCommand(editor.scene, textureId));
    enqueueWorkerJob("Texture library update", { task: "triangulation", worker: "geometryWorker" }, 250);
  };

  const handleDeleteMaterial = (materialId: string) => {
    const fallbackMaterial = Array.from(editor.scene.materials.values()).find((material) => material.id !== materialId);

    if (!fallbackMaterial) {
      return;
    }

    editor.execute(createDeleteMaterialCommand(editor.scene, materialId, fallbackMaterial.id));

    if (uiStore.selectedMaterialId === materialId) {
      uiStore.selectedMaterialId = fallbackMaterial.id;
    }

    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
  };

  const handleSelectAsset = (assetId: string) => {
    uiStore.selectedAssetId = assetId;
  };

  const handleSelectMaterial = (materialId: string) => {
    uiStore.selectedMaterialId = materialId;
  };

  const handlePlaceEntity = (type: EntityType) => {
    const activeViewportState = resolveActiveViewportState();
    const position = vec3(activeViewportState.camera.target.x, 1, activeViewportState.camera.target.z);
    const entity = createDefaultEntity(type, position, editor.scene.entities.size + 1);
    editor.execute(createPlaceEntityCommand(entity));
    editor.select([entity.id], "object");
    enqueueWorkerJob("Entity authoring", { task: "navmesh", worker: "navWorker" }, 800);
  };

  const handleUpdateNodeData = (nodeId: string, data: PrimitiveNodeData | LightNodeData | ProceduralWorldNodeData) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    if (isPrimitiveNode(node)) {
      const replacement = {
        ...structuredClone(node),
        data: structuredClone(data as PrimitiveNodeData)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "update primitive"));
      enqueueWorkerJob("Primitive update", { task: "triangulation", worker: "geometryWorker" }, 500);
      return;
    }

    if (isLightNode(node)) {
      const replacement = {
        ...structuredClone(node),
        data: structuredClone(data as LightNodeData)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "update light"));
      enqueueWorkerJob("Light update", { task: "triangulation", worker: "geometryWorker" }, 500);
      return;
    }

    if (isProceduralWorldNode(node)) {
      const replacement = {
        ...structuredClone(node),
        data: structuredClone(data as ProceduralWorldNodeData)
      };
      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "update procedural world"));
    }
  };

  const handleUpdateSceneSettings = (settings: SceneSettings, beforeSettings?: SceneSettings) => {
    editor.execute(createSetSceneSettingsCommand(editor.scene, settings, beforeSettings));
    enqueueWorkerJob("Scene settings", { task: "triangulation", worker: "geometryWorker" }, 300);
  };

  const beginPreviewSession = (mode: PreviewSessionMode, possessed: boolean) => {
    if (physicsPlayback === "stopped") {
      previewRestoreViewportIdRef.current = uiStore.activeViewportId;
    }

    editor.clearSelection();
    uiStore.activeViewportId = "perspective";
    setPreviewSessionMode(mode);
    setPreviewPossessed(possessed);
    setPhysicsPlayback("running");
  };

  const handlePlayPhysics = () => {
    beginPreviewSession("play", true);
  };

  const handleSimulatePhysics = () => {
    beginPreviewSession("simulate", false);
  };

  const handlePausePhysics = () => {
    setPhysicsPlayback((current) => (current === "stopped" ? "stopped" : "paused"));
  };

  const handleResumePhysics = () => {
    setPhysicsPlayback((current) => (current === "stopped" ? "stopped" : "running"));
  };

  const handleStepPhysics = () => {
    if (physicsPlayback !== "paused") {
      return;
    }

    setPreviewStepTick((current) => current + 1);
  };

  const handleTogglePreviewPossession = () => {
    if (physicsPlayback === "stopped") {
      return;
    }

    setPreviewPossessed((current) => {
      const next = !current;
      setPreviewSessionMode(next ? "play" : "simulate");
      return next;
    });
  };

  const handleStopPhysics = () => {
    setPhysicsPlayback("stopped");
    setPreviewSessionMode(null);
    setPreviewPossessed(false);
    setPhysicsRevision((current) => current + 1);

    if (previewRestoreViewportIdRef.current) {
      uiStore.activeViewportId = previewRestoreViewportIdRef.current;
      previewRestoreViewportIdRef.current = null;
    }
  };

  useEffect(() => {
    if (!draftHydrated) return;
    if (localStorage.getItem("blud:autoplay-on-load") !== "1") return;
    localStorage.removeItem("blud:autoplay-on-load");
    handlePlayPhysics();
  }, [draftHydrated]);

  const buildEditorSnapshot = () => ({
    ...editor.exportSnapshot(),
    metadata: {
      projectName: resolvedProjectName,
      projectSlug: resolvedProjectSlug
    }
  });

  const buildSceneDraftPayload = () => ({
    projectName: resolvedProjectName,
    projectSlug: resolvedProjectSlug,
    projectSlugDirty,
    snapshot: buildEditorSnapshot(),
    updatedAt: Date.now(),
    version: 1 as const
  });

  const applyProjectMetadata = (metadata?: EditorFileMetadata) => {
    if (!metadata?.projectName && !metadata?.projectSlug) {
      return;
    }

    const nextProjectName = metadata.projectName?.trim() || resolvedProjectName;
    const nextProjectSlug = slugifyProjectName(metadata.projectSlug?.trim() || nextProjectName);
    setProjectName(nextProjectName);
    setProjectSlug(nextProjectSlug);
    setProjectSlugDirty(Boolean(metadata.projectSlug));
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const draft = await loadStoredSceneEditorDraft();

        if (!draft || cancelled) {
          return;
        }

        editor.importSnapshot(draft.snapshot, "scene:restore-draft");
        setProjectName(draft.projectName || "Untitled Scene");
        setProjectSlug(slugifyProjectName(draft.projectSlug || draft.projectName || "Untitled Scene"));
        setProjectSlugDirty(draft.projectSlugDirty);
      } catch (error) {
        console.warn("Failed to restore the Dream Studio draft.", error);
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editor]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    latestDraftRef.current = buildSceneDraftPayload();

    const timeoutId = window.setTimeout(() => {
      void saveSceneEditorDraft(buildSceneDraftPayload()).catch((error) => {
        console.warn("Failed to save the Dream Studio draft.", error);
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draftHydrated, projectSlugDirty, resolvedProjectName, resolvedProjectSlug, sceneRevision]);

  useEffect(() => {
    return () => {
      const draft = latestDraftRef.current;

      if (!draft) {
        return;
      }

      void saveSceneEditorDraft(draft).catch((error) => {
        console.warn("Failed to flush the Dream Studio draft on unload.", error);
      });
    };
  }, []);

  const handleProjectNameChange = (value: string) => {
    const previousAutoSlug = slugifyProjectName(projectName);
    setProjectName(value);

    if (!projectSlugDirty || projectSlug === previousAutoSlug) {
      setProjectSlug(slugifyProjectName(value));
      setProjectSlugDirty(false);
    }
  };

  const handleProjectSlugChange = (value: string) => {
    setProjectSlug(slugifyProjectName(value));
    setProjectSlugDirty(true);
  };

  const performNewFile = () => {
    const nextSnapshot = createSceneDocumentSnapshot(createSeedSceneDocument());
    editor.importSnapshot(nextSnapshot, "scene:new-file");
    editor.commands.clear();

    setProjectName("Untitled Scene");
    setProjectSlug("untitled-scene");
    setProjectSlugDirty(false);
    setSelectedScenePathId(undefined);
    setSelectedMaterialFaceIds([]);
    setHiddenSceneItemIds([]);
    setLockedSceneItemIds([]);
    setAiModelPlacementArmed(false);
    setAiModelDraft(null);
    setPhysicsPlayback("stopped");
    setPhysicsRevision(0);
    uiStore.selectedAssetId = "";
    uiStore.selectedMaterialId = "material:blockout:concrete";
  };

  const handleRequestNewFile = () => {
    setNewFileConfirmOpen(true);
  };

  const handleSaveWhmap = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "whmap-save",
        snapshot: buildEditorSnapshot()
      },
      "Save .whmap"
    );

    if (typeof payload === "string") {
      downloadTextFile(`${resolvedProjectSlug}.whmap`, payload, "application/json");
    }
  };

  const handleLoadWhmap = () => {
    fileInputRef.current?.click();
  };

  const handleReloadHtmlJsImport = async () => {
    if (!htmlJsImportSession) {
      return;
    }

    await runHtmlJsImport(
      htmlJsImportSession.files,
      htmlJsImportSession.projectName,
      htmlJsImportSession.entrypointSelection
    );
  };

  const handleCloseHtmlJsImport = () => {
    if (htmlJsImportSession?.loading) {
      return;
    }

    setHtmlJsImportSession(null);
  };

  const handleConfirmHtmlJsImport = () => {
    const snapshot = htmlJsImportSession?.result?.snapshot;

    if (!snapshot) {
      return;
    }

    applyProjectMetadata(snapshot.metadata);
    editor.importSnapshot(snapshot, "scene:import-htmljs");
    editor.commands.clear();
    setSelectedScenePathId(undefined);
    setSelectedMaterialFaceIds([]);
    setHiddenSceneItemIds([]);
    setLockedSceneItemIds([]);
    setAiModelPlacementArmed(false);
    setAiModelDraft(null);
    setPhysicsPlayback("stopped");
    setPreviewSessionMode(null);
    setPreviewPossessed(false);
    setPhysicsRevision((current) => current + 1);
    previewRestoreViewportIdRef.current = null;
    uiStore.selectedAssetId = "";
    uiStore.selectedMaterialId = "material:blockout:concrete";
    setHtmlJsImportSession(null);
  };

  const handleWhmapFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    const payload = await runWorkerRequest(
      {
        kind: "whmap-load",
        text
      },
      "Load .whmap"
    );

    if (isSceneDocumentSnapshotPayload(payload)) {
      applyProjectMetadata(payload.metadata);
      editor.importSnapshot(payload, "scene:load-whmap");
    }

    event.target.value = "";
  };

  const handleExportGltf = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "gltf-export",
        snapshot: buildEditorSnapshot()
      },
      "Export glTF"
    );

    if (typeof payload === "string") {
      downloadTextFile(`${resolvedProjectSlug}.gltf`, payload, "model/gltf+json");
    }
  };

  const handleExportEngine = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "engine-export",
        snapshot: buildEditorSnapshot()
      },
      "Export runtime scene"
    );

    if (isWebHammerEngineBundle(payload)) {
      const zip = await packWebHammerEngineBundleZip(payload);
      downloadBinaryFile(`${resolvedProjectSlug}.runtime.zip`, zip, "application/zip");
    }
  };

  const handleUndo = () => {
    editor.undo();
  };

  const handleRedo = () => {
    editor.redo();
  };

  const handlePushSceneToGame = async (options?: {
    forceSwitch?: boolean;
    gameId?: string;
    projectName?: string;
    projectSlug?: string;
  }) => {
    const nextProjectName = options?.projectName?.trim() || resolvedProjectName;
    const nextProjectSlug = slugifyProjectName(
      options?.projectSlug?.trim() || options?.projectName?.trim() || resolvedProjectSlug || nextProjectName
    );

    if (options?.projectName) {
      setProjectName(nextProjectName);
      if (!options.projectSlug) {
        setProjectSlug(nextProjectSlug);
        setProjectSlugDirty(false);
      }
    }

    if (options?.projectSlug) {
      setProjectSlug(nextProjectSlug);
      setProjectSlugDirty(true);
    }

    const exportPayload = await runWorkerRequest(
      {
        kind: "engine-export",
        snapshot: {
          ...editor.exportSnapshot(),
          metadata: {
            projectName: nextProjectName,
            projectSlug: nextProjectSlug
          }
        }
      },
      "Push runtime scene"
    );

    if (!isWebHammerEngineBundle(exportPayload)) {
      throw new Error("Failed to export a runtime bundle for editor sync.");
    }

    return gameConnection.pushScene({
      bundle: serializeRuntimeBundleForSync(exportPayload),
      forceSwitch: options?.forceSwitch,
      gameId: options?.gameId ?? gameConnection.activeGame?.id,
      metadata: {
        projectName: nextProjectName,
        projectSlug: nextProjectSlug
      }
    });
  };

  const copilot = useCopilot(editor, {
    captureViewportScreenshot: async () => {
      const capture = viewportScreenshotCapturesRef.current.get(uiStore.activeViewportId);
      if (!capture) {
        throw new Error("The active viewport is not ready for screenshots yet.");
      }

      return capture();
    },
    requestScenePush: (options: {
      forceSwitch?: boolean;
      gameId?: string;
      projectName?: string;
      projectSlug?: string;
    }) => {
      void handlePushSceneToGame(options).catch(() => {});
    }
  }, "copilot");

  const morphus = useCopilot(editor, {}, "morphus");

  const handleToggleCopilot = () => {
    uiStore.copilotPanelOpen = !uiStore.copilotPanelOpen;
  };

  const handleCreateMeshTerrain = () => {
    const existing = Array.from(editor.scene.nodes.values()).find(isMeshTerrainNode);

    if (existing) {
      editor.select([existing.id], "object");
      uiStore.rightPanel = "inspector";
      return;
    }

    const node = createMeshTerrainNode({ name: "Mesh Terrain" });
    editor.execute(createTerrainNodeCommand(node));
    editor.select([node.id], "object");
    setActiveToolId("terrain-sculpt");
  };

  const handleCreateProceduralWorld = () => {
    const existing = Array.from(editor.scene.nodes.values()).find(isProceduralWorldNode);
    if (existing) {
      editor.select([existing.id], "object");
      uiStore.rightPanel = "world";
      return;
    }
    const node: ProceduralWorldNode = {
      data: createDefaultProceduralWorldNodeData(),
      id: `node:procedural-world:${crypto.randomUUID()}`,
      kind: "procedural-world",
      name: "LAAS Procedural World",
      transform: makeTransform()
    };
    editor.execute(createProceduralWorldNodeCommand(node));
    editor.select([node.id], "object");
    uiStore.rightPanel = "world";
  };

  const handleOpenAiLauncher = () => {
    uiStore.aiModePickerOpen = true;
  };

  const handleCloseAiModePicker = () => {
    uiStore.aiModePickerOpen = false;
  };

  const handleSelectAiAssistantMode = (mode: AiAssistantMode) => {
    uiStore.aiAssistantMode = mode;
    uiStore.copilotPanelOpen = true;
    uiStore.aiModePickerOpen = false;
  };

  const handleToggleLogicViewer = () => {
    uiStore.logicViewerOpen = !uiStore.logicViewerOpen;
  };

  const handleToggleToolsPanel = () => {
    uiStore.toolsPanelOpen = !uiStore.toolsPanelOpen;
  };

  const handlePlaceSkateparkElement = (type: SkateparkElementType) => {
    // 1. Ensure all skatepark materials are registered in the scene
    Object.values(skateparkMaterials as Record<string, Material>).forEach((mat) => {
      if (!editor.scene.materials.has(mat.id)) {
        editor.execute(createUpsertMaterialCommand(editor.scene, mat));
      }
    });

    // 2. Resolve placement position
    const activeViewportState = resolveActiveViewportState();
    const snapSize = resolveViewportSnapSize(activeViewportState);
    const position = snapVec3(activeViewportState.camera.target, snapSize);
    position.y = 0;
    const transform = makeTransform(position);

    // 3. Build geometry based on type
    let mesh: EditableMesh | undefined;
    const name = type.charAt(0).toUpperCase() + type.slice(1).replace("-", " ");

    const defaultConcrete = "concrete-smooth";
    const defaultMetal = "rail-metal";

    switch (type) {
      case "bank":
        mesh = buildBank({ width: 4, height: 1.5, depth: 3, materialId: defaultConcrete });
        break;
      case "bowl":
        mesh = buildBowl({ radiusX: 6, radiusZ: 6, depth: 3, segments: 4, materialId: defaultConcrete });
        break;
      case "fun-box":
        mesh = buildFunBox({ width: 4, height: 0.6, length: 4, rampLength: 2, materialId: defaultConcrete });
        break;
      case "half-pipe":
        mesh = buildHalfPipe({ width: 6, height: 2, flatLength: 4, radius: 3, segments: 16, materialId: defaultConcrete });
        break;
      case "hip":
        mesh = buildHip({ width: 2, height: 1.5, radius: 3, segments: 8, materialId: defaultConcrete });
        break;
      case "hubba-ledge":
        mesh = buildHubbaLedge({ width: 0.8, height: 0.6, length: 4, stairHeight: 1, materialId: defaultConcrete });
        break;
      case "kicker":
        mesh = buildKicker({ width: 2, height: 0.6, depth: 1.5, materialId: defaultConcrete });
        break;
      case "ledge":
        mesh = buildLedge({ width: 1, height: 0.5, length: 3, materialId: defaultConcrete });
        break;
      case "manual-pad":
        mesh = buildManualPad({ width: 2, height: 0.2, length: 4, materialId: defaultConcrete });
        break;
      case "pyramid":
        mesh = buildPyramid({ width: 2, height: 0.8, length: 2, rampLength: 2, materialId: defaultConcrete });
        break;
      case "quarter-pipe":
        mesh = buildQuarterPipe({ width: 4, height: 1.5, radius: 2.5, segments: 12, materialId: defaultConcrete });
        break;
      case "rail":
        mesh = buildRail({ length: 4, railHeight: 0.5, railRadius: 0.05, legCount: 2, materialId: defaultMetal });
        break;
      case "spine":
        mesh = buildSpine({ width: 4, height: 1.5, radius: 2, segments: 12, materialId: defaultConcrete });
        break;
      case "stair-set":
        mesh = buildStairSet({ width: 3, stepCount: 5, stepDepth: 0.35, stepHeight: 0.18, materialId: defaultConcrete });
        break;
    }

    if (mesh) {
      const { command, nodeId } = createPlaceMeshNodeCommand(editor.scene, transform, {
        data: mesh,
        name: `Skatepark ${name}`
      });

      editor.execute(command);
      editor.select([nodeId], "object");
      enqueueWorkerJob("Skatepark placement", { task: "triangulation", worker: "geometryWorker" }, 650);
    }
  };

  useAppHotkeys({
    activeToolId,
    editor,
    enabled: physicsPlayback === "stopped" || (physicsPlayback === "paused" && !previewPossessed),
    handleDeleteSelection,
    handleDuplicateSelection,
    handleFocusSelection,
    handleInstanceSelection,
    handleGroupSelection,
    handleInvertSelectionNormals,
    handleRedo,
    handleStartPlayPreview: handlePlayPhysics,
    handleStartSimulatePreview: handleSimulatePhysics,
    handleStopPreview: handleStopPhysics,
    handleToggleCopilot: handleOpenAiLauncher,
    handleToggleLogicViewer,
    handleTogglePreviewPossession,
    handleTranslateSelection,
    handleUndo,
    previewActive: physicsPlayback !== "stopped",
    setActiveToolId: handleSetToolId,
    setMeshEditMode,
    setTransformMode,
    transformMode
  });

  return (
    <>
      <EditorShell
        analysis={spatialAnalysis}
        activeRightPanel={ui.rightPanel}
        activeToolId={toolSession.toolId}
        activeBrushShape={activeBrushShape}
        aiAssistantMode={ui.aiAssistantMode}
        aiModePickerOpen={ui.aiModePickerOpen}
        copilot={copilot}
        morphus={morphus}
        copilotPanelOpen={ui.copilotPanelOpen}
        gameConnectionControl={
          <GameConnectionControl
            activeGame={gameConnection.activeGame}
            error={gameConnection.error}
            games={gameConnection.games}
            isLoading={gameConnection.isLoading}
            isPushing={gameConnection.isPushing}
            lastPush={gameConnection.lastPush}
            onProjectNameChange={handleProjectNameChange}
            onProjectSlugChange={handleProjectSlugChange}
            onPushScene={(forceSwitch) => {
              void handlePushSceneToGame({ forceSwitch });
            }}
            onRefresh={gameConnection.refresh}
            onSelectGame={gameConnection.setSelectedGameId}
            projectName={projectName}
            projectSlug={resolvedProjectSlug}
            selectedGameId={gameConnection.selectedGameId}
          />
        }
        logicViewerOpen={ui.logicViewerOpen}
        onCloseAiModePicker={handleCloseAiModePicker}
        onOpenAiLauncher={handleOpenAiLauncher}
        onSelectAiAssistantMode={handleSelectAiAssistantMode}
        onToggleCopilot={handleToggleCopilot}
        onPlaceSkateparkElement={handlePlaceSkateparkElement}
        onToggleLogicViewer={handleToggleLogicViewer}
        onToggleTools={handleToggleToolsPanel}
        aiModelPlacementActive={Boolean(aiModelDraft)}
        aiModelPlacementArmed={aiModelPlacementArmed}
        aiModelPrompt={aiModelDraft?.prompt ?? ""}
        aiModelPromptBusy={false}
        aiModelPromptError={aiModelDraft?.error}
        activeViewportId={ui.activeViewportId}
        effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
        effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
        hiddenSceneItemIds={hiddenSceneItemIds}
        canRedo={editor.commands.canRedo()}
        canUndo={editor.commands.canUndo()}
        lockedSceneItemIds={lockedSceneItemIds}
        editor={editor}
        gridSnapValues={gridSnapValues}
        jobs={[...workerJobs, ...exportJobs]}
        meshEditToolbarAction={meshEditToolbarAction}
        onActivateViewport={handleActivateViewport}
        onRegisterViewportScreenshotCapture={handleRegisterViewportScreenshotCapture}
        onInvertSelectionNormals={handleInvertSelectionNormals}
        onApplyMaterial={handleApplyMaterial}
        onClipSelection={handleClipSelection}
        onCreateBrush={handleCreateBrush}
        onCreateMeshTerrain={handleCreateMeshTerrain}
        onCreateProceduralWorld={handleCreateProceduralWorld}
        onDeleteSelection={handleDeleteSelection}
        onDuplicateSelection={handleDuplicateSelection}
        onClearSelection={handleClearSelection}
        onCommitMeshTopology={handleCommitMeshTopology}
        onDeleteMaterial={handleDeleteMaterial}
        onExportEngine={handleExportEngine}
        onExportGltf={handleExportGltf}
        onExtrudeSelection={handleExtrudeSelection}
        onFocusNode={handleFocusNode}
        onGroupSelection={handleGroupSelection}
        onGenerateAiModel={handleGenerateAiModel}
        onImportGlb={handleImportGlb}
        onImportHtmlJs={handleImportHtmlJs}
        onLoadWhmap={handleLoadWhmap}
        onNewFile={handleRequestNewFile}
        onPausePhysics={handlePausePhysics}
        onResumePhysics={handleResumePhysics}
        onMeshEditToolbarAction={handleMeshEditToolbarAction}
        onMirrorSelection={handleMirrorSelection}
        onCancelAiModelPlacement={handleCancelAiModelPlacement}
        onPlaceAsset={handlePlaceAsset}
        onPlaceAiModelPlaceholder={handlePlaceAiModelPlaceholder}
        onPlaceBrush={handlePlaceBrush}
        onPlaceMeshNode={handlePlaceMeshNode}
        onPlaceBlockoutOpenRoom={() => handlePlaceBlockoutRoom(["south"])}
        onPlaceBlockoutPlatform={handlePlaceBlockoutPlatform}
        onPlaceBlockoutRoom={() => handlePlaceBlockoutRoom()}
        onPlaceBlockoutStairs={handlePlaceBlockoutStairs}
        onDropBlockout={handleDropBlockout}
        onPlaceEntity={handlePlaceEntity}
        onPlaceFloorPreset={handlePlaceFloorPreset}
        onPlaceLight={handlePlaceLight}
        onPlacePrimitiveNode={handlePlacePrimitiveNode}
        onPlaceProp={handlePlaceProp}
        onPlayPhysics={handlePlayPhysics}
        onSimulatePhysics={handleSimulatePhysics}
        onStepPhysics={handleStepPhysics}
        onTogglePreviewPossession={handleTogglePreviewPossession}
        onPreviewBrushData={handlePreviewBrushData}
        onPreviewEntityTransform={handlePreviewEntityTransform}
        onPreviewMeshData={handlePreviewMeshData}
        onPreviewNodeTransform={handlePreviewNodeTransform}
        onSculptModeChange={setSculptMode}
        onSetSculptBrushType={setSculptBrushType}
        onSetSculptSymmetryX={setSculptSymmetryX}
        onRedo={handleRedo}
        onSaveWhmap={handleSaveWhmap}
        onSelectAsset={handleSelectAsset}
        onSelectMaterialFaces={setSelectedMaterialFaceIds}
        onSelectMaterial={handleSelectMaterial}
        onSelectScenePath={setSelectedScenePathId}
        onStartAiModelPlacement={handleArmAiModelPlacement}
        onToggleSceneItemLock={handleToggleSceneItemLock}
        onToggleSceneItemVisibility={handleToggleSceneItemVisibility}
        onSetUvOffset={handleSetMaterialUvOffset}
        onSetUvScale={handleSetMaterialUvScale}
        onSelectNodes={handleSelectNodes}
        onSetMeshEditMode={setMeshEditMode}
        onSetSculptBrushRadius={setSculptBrushRadius}
        onSetSculptBrushStrength={setSculptBrushStrength}
        onSetRightPanel={handleSetRightPanel}
        onSetActiveBrushShape={setActiveBrushShape}
        onSetSnapEnabled={handleSetSnapEnabled}
        onSetSnapSize={handleSetSnapSize}
        onStopPhysics={handleStopPhysics}
        onSetTransformMode={setTransformMode}
        onSetToolId={handleSetToolId}
        onToggleViewportQuality={handleToggleViewportQuality}
        onSetViewMode={handleSetViewMode}
        onSplitBrushAtCoordinate={handleSplitBrushAtCoordinate}
        onTranslateSelection={handleTranslateSelection}
        onUndo={handleUndo}
        onUpdateEntityProperties={handleUpdateEntityProperties}
        onUpdateEntityHooks={handleUpdateEntityHooks}
        onUpdateEntityTransform={handleUpdateEntityTransform}
        onUpdateNodeData={handleUpdateNodeData}
        onUpdateNodeHooks={handleUpdateNodeHooks}
        onUpdateAiModelPrompt={handleUpdateAiModelPrompt}
        onUpdateSceneSettings={handleUpdateSceneSettings}
        onUpdateViewport={handleUpdateViewport}
        onUpsertMaterial={handleUpsertMaterial}
        onDeleteTexture={handleDeleteTexture}
        onUpsertTexture={handleUpsertTexture}
        onUpdateBrushData={handleUpdateBrushData}
        onUpdateMeshData={handleUpdateMeshData}
        onUpdateNodeTransform={handleUpdateNodeTransform}
        meshEditMode={meshEditMode}
        sculptMode={sculptMode}
        sculptBrushRadius={sculptBrushRadius}
        sculptBrushStrength={sculptBrushStrength}
        sculptBrushType={sculptBrushType}
        sculptSymmetryX={sculptSymmetryX}
        physicsPlayback={physicsPlayback}
        physicsRevision={physicsRevision}
        previewPossessed={previewPossessed}
        previewSessionMode={previewSessionMode}
        previewStepTick={previewStepTick}
        projectName={resolvedProjectName}
        renderScene={renderScene}
        sceneSettings={editor.scene.settings}
        selectedScenePathId={selectedScenePathId}
        selectedAssetId={ui.selectedAssetId}
        selectedFaceIds={selectedMaterialFaceIds}
        selectedMaterialId={ui.selectedMaterialId}
        toolsPanelOpen={ui.toolsPanelOpen}
        transformMode={transformMode}
        textures={Array.from(editor.scene.textures.values())}
        tools={defaultTools}
        viewMode={ui.viewMode}
        viewportQuality={ui.viewportQuality}
        viewports={ui.viewports}
      />
      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="OK"
        message="Create a new file? The current local draft will be replaced."
        onConfirm={performNewFile}
        onOpenChange={setNewFileConfirmOpen}
        open={newFileConfirmOpen}
        title={typeof window !== "undefined" ? `${window.location.hostname} says` : "Confirm"}
      />
      <HtmlJsImportDialog
        entrypointSelection={htmlJsImportSession?.entrypointSelection ?? ""}
        loading={htmlJsImportSession?.loading ?? false}
        onClose={handleCloseHtmlJsImport}
        onConfirm={handleConfirmHtmlJsImport}
        onEntrypointChange={(value) =>
          setHtmlJsImportSession((current) =>
            current
              ? {
                  ...current,
                  entrypointSelection: value
                }
              : current
          )
        }
        onReloadEntrypoint={handleReloadHtmlJsImport}
        open={Boolean(htmlJsImportSession)}
        result={htmlJsImportSession?.result}
      />
      <input
        accept=".whmap,.json"
        hidden
        onChange={handleWhmapFileChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept=".glb,model/gltf-binary"
        hidden
        onChange={handleGlbFileChange}
        ref={glbImportInputRef}
        type="file"
      />
      <input
        accept=".zip,.html,.htm,.js,.jsx,.mjs,.ts,.tsx"
        hidden
        multiple
        onChange={handleHtmlJsFileChange}
        ref={htmlJsImportInputRef}
        type="file"
      />
    </>
  );
}

function preserveMeshMetadata(mesh: EditableMesh, existingMesh?: EditableMesh) {
  return existingMesh?.role === "prop" || existingMesh?.physics || existingMesh?.modeling
    ? {
        ...structuredClone(mesh),
        modeling: structuredClone(mesh.modeling ?? existingMesh.modeling),
        physics: structuredClone(mesh.physics ?? existingMesh.physics),
        role: mesh.role ?? existingMesh.role
      }
    : structuredClone(mesh);
}

async function packWebHammerEngineBundleZip(bundle: WebHammerEngineBundle) {
  const { createWebHammerEngineBundleZip } = await import("@blud/three-runtime");
  return createWebHammerEngineBundleZip(bundle);
}

function serializeRuntimeBundleForSync(bundle: WebHammerEngineBundle) {
  return {
    files: bundle.files.map((file) => ({
      bytes: Array.from(file.bytes),
      mimeType: file.mimeType,
      path: file.path
    })),
    manifest: bundle.manifest
  };
}

function deriveHtmlJsImportProjectName(files: File[]) {
  const firstFile = files[0];

  if (!firstFile) {
    return "Imported HTML Scene";
  }

  return firstFile.name.replace(/\.[^.]+$/, "") || "Imported HTML Scene";
}

function isHtmlJsImportResult(value: unknown): value is HtmlJsImportResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      "report" in value &&
      value.report &&
      typeof value.report === "object"
  );
}

function isSceneDocumentSnapshotPayload(value: unknown): value is SceneDocumentSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      "nodes" in value &&
      "entities" in value &&
      "materials" in value &&
      "settings" in value
  );
}

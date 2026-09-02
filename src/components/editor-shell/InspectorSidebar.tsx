import { useEffect, useRef, useState, useCallback, type ChangeEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  applyEditableMeshModeling,
  captureEditableMeshModelingBase,
  initializeEditableMeshModeling,
  updateEditableMeshModeling
} from "@blud/geometry-kernel";
import {
  type EditableMesh,
  type MeshBakeMapKind,
  type MeshBooleanModifier,
  type MeshLatticeModifier,
  type MeshLodProfile,
  type MeshModelingModifier,
  type MeshPolyGroup,
  type MeshRemeshModifier,
  type MeshRetopoModifier,
  type MeshSmoothingGroup,
  isInstancingNode,
  isLightNode,
  isMeshTerrainNode,
  isPrimitiveNode,
  isProceduralWorldNode,
  vec3,
  type Entity,
  type GeometryNode,
  type LightNodeData,
  type Material,
  type PropBodyType,
  type PropColliderShape,
  type PrimitiveNodeData,
  type ProceduralWorldNodeData,
  type SceneSettings,
  type TerrainNodeData,
  type TextureRecord,
  type Transform,
  type Vec3
} from "@blud/shared";
import type { ToolId } from "@blud/tool-system";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { EventsPanel, HooksPanel, PathsPanel } from "@/components/editor-shell/GameplayPanels";
import { NpcVoiceInspector } from "@/components/editor-shell/NpcVoiceInspector";
import { VoicesPanel } from "@/components/editor-shell/VoicesPanel";
import { MaterialLibraryPanel } from "@/components/editor-shell/MaterialLibraryPanel";
import { SceneHierarchyPanel } from "@/components/editor-shell/SceneHierarchyPanel";
import { SurfaceAuthoringPanel } from "@/components/editor-shell/SurfaceAuthoringPanel";
import { ProceduralWorldInspector } from "@/components/editor-shell/ProceduralWorldInspector";
import { TerrainInspector } from "@/components/editor-shell/TerrainInspector";
import { rebaseTransformPivot } from "@/viewport/utils/geometry";
import { readFileAsDataUrl } from "@/lib/model-assets";
import { cn } from "@/lib/utils";
import { generateSoundEffectUrl } from "@/lib/elevenlabs-client";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import type { RightPanelId } from "@/state/ui-store";

type InspectorSidebarProps = {
  activeRightPanel: RightPanelId | null;
  activeToolId: ToolId;
  assets: Array<{ id: string; path: string; type: string }>;
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  entities: Entity[];
  hiddenSceneItemIds: string[];
  lockedSceneItemIds: string[];
  materials: Material[];
  meshEditMode: MeshEditMode;
  nodes: GeometryNode[];
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onChangeRightPanel: (panel: RightPanelId | null) => void;
  onClipSelection: (axis: "x" | "y" | "z") => void;
  onCreateProceduralWorld: () => void;
  onDeleteMaterial: (materialId: string) => void;
  onDeleteTexture: (textureId: string) => void;
  onExtrudeSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onFocusNode: (nodeId: string) => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onMirrorSelection: (axis: "x" | "y" | "z") => void;
  onPlaceAsset: (position: Vec3) => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectScenePath: (pathId: string | undefined) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetToolId: (toolId: ToolId) => void;
  onToggleSceneItemLock: (itemId: string) => void;
  onToggleSceneItemVisibility: (itemId: string) => void;
  onSetUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: { x: number; y: number }) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: { x: number; y: number }) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onTranslateSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpsertTexture: (texture: TextureRecord) => void;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
  onUpdateEntityHooks: (entityId: string, hooks: NonNullable<Entity["hooks"]>, beforeHooks?: NonNullable<Entity["hooks"]>) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData | ProceduralWorldNodeData) => void;
  /**
   * Commit for mesh-terrain edits.
   *
   * Terrain has its own channel because `onUpdateNodeData` is contravariant in
   * its payload: widening that union would reject the narrower handler the app
   * already passes. Until the host wires this, terrain edits fall back through
   * `onUpdateNodeData`, which does not yet carry a terrain branch.
   */
  onUpdateTerrainNodeData?: (nodeId: string, data: TerrainNodeData) => void;
  onUpdateNodeHooks: (nodeId: string, hooks: NonNullable<GeometryNode["hooks"]>, beforeHooks?: NonNullable<GeometryNode["hooks"]>) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
  selectedScenePathId?: string;
  selectionEnabled: boolean;
  selectedAssetId: string;
  selectedEntity?: Entity;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  selectedNode?: GeometryNode;
  selectedNodeIds: string[];
  textures: TextureRecord[];
  viewportTarget: Vec3;
};

const AXES = ["x", "y", "z"] as const;

function inferSkyboxFormat(file: File): SceneSettings["world"]["skybox"]["format"] {
  return file.name.toLowerCase().endsWith(".hdr") ? "hdr" : "image";
}

const MODELING_GROUP_COLORS = ["#f59e0b", "#10b981", "#38bdf8", "#f472b6", "#a78bfa", "#fb7185"];
const BAKE_MAP_KINDS: MeshBakeMapKind[] = ["normals", "ao", "curvature", "id-mask", "vertex-colors"];

function MeshModelingInspector({
  activeToolId,
  meshEditMode,
  node,
  nodes,
  onMeshEditToolbarAction,
  onUpdateMeshData,
  selectedFaceIds
}: {
  activeToolId: ToolId;
  meshEditMode: MeshEditMode;
  node: Extract<GeometryNode, { kind: "mesh" }>;
  nodes: GeometryNode[];
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  selectedFaceIds: string[];
}) {
  const preparedMesh = initializeEditableMeshModeling(node.data);
  const modeling = preparedMesh.modeling ?? {};
  const faceSelectionActive = activeToolId === "mesh-edit" && meshEditMode === "face";
  const activeFaceIds = faceSelectionActive ? selectedFaceIds : [];
  const otherMeshNodes = nodes.filter(
    (candidate): candidate is Extract<GeometryNode, { kind: "mesh" }> => candidate.kind === "mesh" && candidate.id !== node.id
  );
  const baseFaceCount = modeling.baseTopology?.faces.length ?? node.data.faces.length;

  const commitModeling = (
    recipe:
      | Partial<NonNullable<EditableMesh["modeling"]>>
      | ((current: NonNullable<EditableMesh["modeling"]>) => NonNullable<EditableMesh["modeling"]>)
  ) => {
    const baseMesh = initializeEditableMeshModeling(node.data);
    const currentModeling = structuredClone(baseMesh.modeling ?? {});
    const nextModeling = typeof recipe === "function" ? recipe(currentModeling) : { ...currentModeling, ...recipe };

    onUpdateMeshData(node.id, updateEditableMeshModeling(baseMesh, nextModeling), node.data);
  };

  const addModifier = (type: MeshModelingModifier["type"]) => {
    commitModeling((current) => ({
      ...current,
      modifiers: [...(current.modifiers ?? []), createDefaultModelingModifier(type, current.modifiers?.length ?? 0)]
    }));
  };

  const updateModifier = (modifierId: string, recipe: (modifier: MeshModelingModifier) => MeshModelingModifier) => {
    commitModeling((current) => ({
      ...current,
      modifiers: (current.modifiers ?? []).map((modifier) => (modifier.id === modifierId ? recipe(modifier) : modifier))
    }));
  };

  const removeModifier = (modifierId: string) => {
    commitModeling((current) => ({
      ...current,
      modifiers: (current.modifiers ?? []).filter((modifier) => modifier.id !== modifierId)
    }));
  };

  const createPolyGroupFromSelection = () => {
    if (activeFaceIds.length === 0) {
      return;
    }

    commitModeling((current) => ({
      ...current,
      polyGroups: [
        ...(current.polyGroups ?? []),
        {
          color: MODELING_GROUP_COLORS[(current.polyGroups?.length ?? 0) % MODELING_GROUP_COLORS.length],
          faceIds: Array.from(new Set(activeFaceIds)),
          id: `polygroup:${Date.now()}:${current.polyGroups?.length ?? 0}`,
          name: `PolyGroup ${(current.polyGroups?.length ?? 0) + 1}`
        }
      ]
    }));
  };

  const createSmoothingGroupFromSelection = () => {
    if (activeFaceIds.length === 0) {
      return;
    }

    commitModeling((current) => ({
      ...current,
      smoothingGroups: [
        ...(current.smoothingGroups ?? []),
        {
          angle: 45,
          faceIds: Array.from(new Set(activeFaceIds)),
          id: `smoothing:${Date.now()}:${current.smoothingGroups?.length ?? 0}`,
          name: `Smooth ${(current.smoothingGroups?.length ?? 0) + 1}`
        }
      ]
    }));
  };

  const generateLodPresets = () => {
    commitModeling((current) => ({
      ...current,
      lods: createDefaultLodProfiles(baseFaceCount)
    }));
  };

  const queueBakeOutput = (kind: MeshBakeMapKind) => {
    commitModeling((current) => ({
      ...current,
      bakeOutputs: [
        ...(current.bakeOutputs ?? []).filter((output) => output.kind !== kind),
        {
          generatedAt: new Date().toISOString(),
          id: `bake:${kind}:${Date.now()}`,
          kind,
          resolution: 2048,
          status: "queued"
        }
      ]
    }));
  };

  return (
    <ToolSection title="Mesh Modeling">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => onUpdateMeshData(node.id, captureEditableMeshModelingBase(node.data), node.data)} size="xs" variant="ghost">
            Capture Base
          </Button>
          <Button onClick={() => onUpdateMeshData(node.id, applyEditableMeshModeling(preparedMesh), node.data)} size="xs" variant="ghost">
            Rebuild Stack
          </Button>
          <Button disabled={!faceSelectionActive} onClick={() => onMeshEditToolbarAction("inset")} size="xs" variant="ghost">
            Inset
          </Button>
          <Button disabled={!faceSelectionActive} onClick={() => onMeshEditToolbarAction("triangulate")} size="xs" variant="ghost">
            Triangulate
          </Button>
          <Button disabled={!faceSelectionActive} onClick={() => onMeshEditToolbarAction("solidify")} size="xs" variant="ghost">
            Shell
          </Button>
        </div>

        <div className="space-y-2">
          <SectionTitle>Modifiers</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={() => addModifier("boolean")} size="xs" variant="ghost">Boolean</Button>
            <Button onClick={() => addModifier("mirror")} size="xs" variant="ghost">Mirror</Button>
            <Button onClick={() => addModifier("solidify")} size="xs" variant="ghost">Solidify</Button>
            <Button onClick={() => addModifier("lattice")} size="xs" variant="ghost">Lattice</Button>
            <Button onClick={() => addModifier("remesh")} size="xs" variant="ghost">Remesh</Button>
            <Button onClick={() => addModifier("retopo")} size="xs" variant="ghost">Retopo</Button>
          </div>
          {(modeling.modifiers ?? []).length === 0 ? (
            <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
              Add live modifiers here. Mirror, solidify, lattice, remesh cleanup, and retopo replay from a captured base mesh.
            </div>
          ) : (
            <div className="space-y-2">
              {(modeling.modifiers ?? []).map((modifier) => (
                <MeshModifierCard
                  key={modifier.id}
                  modifier={modifier}
                  otherMeshNodes={otherMeshNodes}
                  onChange={(nextModifier) => updateModifier(modifier.id, () => nextModifier)}
                  onRemove={() => removeModifier(modifier.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <SectionTitle>Symmetry</SectionTitle>
          <BooleanField
            checked={Boolean(modeling.symmetry?.enabled)}
            label="Mirror Symmetry"
            onCheckedChange={(checked) =>
              commitModeling((current) => ({
                ...current,
                symmetry: {
                  axis: current.symmetry?.axis ?? "x",
                  enabled: checked,
                  weld: current.symmetry?.weld ?? true
                }
              }))
            }
          />
          {modeling.symmetry ? (
            <>
              <EnumGrid
                activeValue={modeling.symmetry.axis}
                entries={[
                  { label: "X", value: "x" },
                  { label: "Y", value: "y" },
                  { label: "Z", value: "z" }
                ]}
                onSelect={(value) =>
                  commitModeling((current) => ({
                    ...current,
                    symmetry: current.symmetry
                      ? { ...current.symmetry, axis: value as "x" | "y" | "z" }
                      : { axis: value as "x" | "y" | "z", enabled: true, weld: true }
                  }))
                }
              />
              <BooleanField
                checked={modeling.symmetry.weld}
                label="Weld Seam"
                onCheckedChange={(checked) =>
                  commitModeling((current) => ({
                    ...current,
                    symmetry: current.symmetry
                      ? { ...current.symmetry, weld: checked }
                      : { axis: "x", enabled: true, weld: checked }
                  }))
                }
              />
            </>
          ) : null}
        </div>

        <div className="space-y-2">
          <SectionTitle>PolyGroups</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button disabled={activeFaceIds.length === 0} onClick={createPolyGroupFromSelection} size="xs" variant="ghost">
              Group From Selection
            </Button>
          </div>
          {(modeling.polyGroups ?? []).length === 0 ? (
            <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
              Select faces in mesh-edit face mode, then create PolyGroups for ID masks, retopo targeting, and authoring organization.
            </div>
          ) : (
            <div className="space-y-2">
              {(modeling.polyGroups ?? []).map((group) => (
                <MeshFaceGroupCard
                  key={group.id}
                  accentColor={group.color}
                  faceCount={group.faceIds.length}
                  name={group.name}
                  onAddSelection={
                    activeFaceIds.length > 0
                      ? () =>
                          commitModeling((current) => ({
                            ...current,
                            polyGroups: (current.polyGroups ?? []).map((entry) =>
                              entry.id === group.id
                                ? { ...entry, faceIds: Array.from(new Set([...entry.faceIds, ...activeFaceIds])) }
                                : entry
                            )
                          }))
                      : undefined
                  }
                  onNameChange={(name) =>
                    commitModeling((current) => ({
                      ...current,
                      polyGroups: (current.polyGroups ?? []).map((entry) => (entry.id === group.id ? { ...entry, name } : entry))
                    }))
                  }
                  onRemove={() =>
                    commitModeling((current) => ({
                      ...current,
                      polyGroups: (current.polyGroups ?? []).filter((entry) => entry.id !== group.id)
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <SectionTitle>Smoothing Groups</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button disabled={activeFaceIds.length === 0} onClick={createSmoothingGroupFromSelection} size="xs" variant="ghost">
              Smooth From Selection
            </Button>
          </div>
          {(modeling.smoothingGroups ?? []).map((group) => (
            <div className="editor-dock-note space-y-2 rounded-xl px-3 py-2" key={group.id}>
              <TextField
                label="Name"
                onChange={(name) =>
                  commitModeling((current) => ({
                    ...current,
                    smoothingGroups: (current.smoothingGroups ?? []).map((entry) => (entry.id === group.id ? { ...entry, name } : entry))
                  }))
                }
                value={group.name}
              />
              <NumberField
                label="Angle"
                onChange={(angle) =>
                  commitModeling((current) => ({
                    ...current,
                    smoothingGroups: (current.smoothingGroups ?? []).map((entry) =>
                      entry.id === group.id ? { ...entry, angle } : entry
                    )
                  }))
                }
                value={group.angle}
              />
              <div className="flex items-center justify-between text-[11px] text-foreground/56">
                <span>{group.faceIds.length} faces</span>
                <Button
                  onClick={() =>
                    commitModeling((current) => ({
                      ...current,
                      smoothingGroups: (current.smoothingGroups ?? []).filter((entry) => entry.id !== group.id)
                    }))
                  }
                  size="xs"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <SectionTitle>LOD Profiles</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={generateLodPresets} size="xs" variant="ghost">Generate Presets</Button>
          </div>
          {(modeling.lods ?? []).map((lod) => (
            <MeshLodCard
              key={lod.id}
              lod={lod}
              onChange={(nextLod) =>
                commitModeling((current) => ({
                  ...current,
                  lods: (current.lods ?? []).map((entry) => (entry.id === lod.id ? nextLod : entry))
                }))
              }
              onRemove={() =>
                commitModeling((current) => ({
                  ...current,
                  lods: (current.lods ?? []).filter((entry) => entry.id !== lod.id)
                }))
              }
            />
          ))}
        </div>

        <div className="space-y-2">
          <SectionTitle>Bake Outputs</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {BAKE_MAP_KINDS.map((kind) => (
              <Button key={kind} onClick={() => queueBakeOutput(kind)} size="xs" variant="ghost">
                {startCase(kind)}
              </Button>
            ))}
          </div>
          {(modeling.bakeOutputs ?? []).map((output) => (
            <div className="editor-dock-note rounded-xl px-3 py-2" key={output.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-foreground/78">{startCase(output.kind)}</div>
                  <div className="text-[10px] text-foreground/48">{output.status.toUpperCase()}</div>
                </div>
                <Button
                  onClick={() =>
                    commitModeling((current) => ({
                      ...current,
                      bakeOutputs: (current.bakeOutputs ?? []).filter((entry) => entry.id !== output.id)
                    }))
                  }
                  size="xs"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
              <NumberField
                label="Resolution"
                onChange={(resolution) =>
                  commitModeling((current) => ({
                    ...current,
                    bakeOutputs: (current.bakeOutputs ?? []).map((entry) =>
                      entry.id === output.id ? { ...entry, resolution } : entry
                    )
                  }))
                }
                value={output.resolution}
              />
            </div>
          ))}
        </div>
      </div>
    </ToolSection>
  );
}

export function InspectorSidebar({
  activeRightPanel,
  activeToolId,
  assets,
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  entities,
  hiddenSceneItemIds,
  lockedSceneItemIds,
  materials,
  meshEditMode,
  nodes,
  onApplyMaterial,
  onChangeRightPanel,
  onClipSelection,
  onCreateProceduralWorld,
  onDeleteMaterial,
  onDeleteTexture,
  onExtrudeSelection,
  onFocusNode,
  onMeshEditToolbarAction,
  onMirrorSelection,
  onPlaceAsset,
  onSelectAsset,
  onSelectMaterial,
  onSelectScenePath,
  onSelectNodes,
  onSetToolId,
  onToggleSceneItemLock,
  onToggleSceneItemVisibility,
  onSetUvOffset,
  onSetUvScale,
  onTranslateSelection,
  onUpsertMaterial,
  onUpsertTexture,
  onUpdateEntityProperties,
  onUpdateEntityHooks,
  onUpdateEntityTransform,
  onUpdateMeshData,
  onUpdateNodeData,
  onUpdateTerrainNodeData,
  onUpdateNodeHooks,
  onUpdateNodeTransform,
  onUpdateSceneSettings,
  sceneSettings,
  selectedScenePathId,
  selectionEnabled,
  selectedAssetId,
  selectedEntity,
  selectedFaceIds,
  selectedMaterialId,
  selectedNode,
  selectedNodeIds,
  textures,
  viewportTarget
}: InspectorSidebarProps) {
  const selectedTarget = selectedNode ?? selectedEntity;
  const [draftTransform, setDraftTransform] = useState<Transform | undefined>(() =>
    selectedTarget ? structuredClone(selectedTarget.transform) : undefined
  );
  const [sceneSection, setSceneSection] = useState<"hierarchy" | "paths">("hierarchy");
  const [draftWorldSettings, setDraftWorldSettings] = useState(() => structuredClone(sceneSettings.world));
  const [draftPlayerSettings, setDraftPlayerSettings] = useState(() => structuredClone(sceneSettings.player));
  const draftTransformRef = useRef(draftTransform);
  const draftWorldSettingsRef = useRef(draftWorldSettings);
  const draftPlayerSettingsRef = useRef(draftPlayerSettings);
  const sceneSettingsRef = useRef(sceneSettings);
  const selectedNodeRef = useRef(selectedNode);
  const selectedEntityRef = useRef(selectedEntity);
  const selectedTargetRef = useRef(selectedTarget);

  const setDraftTransformState = (
    value: Transform | undefined | ((current: Transform | undefined) => Transform | undefined)
  ) => {
    setDraftTransform((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftTransformRef.current = next;
      return next;
    });
  };

  const setDraftWorldSettingsState = (
    value:
      | SceneSettings["world"]
      | ((current: SceneSettings["world"]) => SceneSettings["world"])
  ) => {
    setDraftWorldSettings((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftWorldSettingsRef.current = next;
      return next;
    });
  };

  const setDraftPlayerSettingsState = (
    value:
      | SceneSettings["player"]
      | ((current: SceneSettings["player"]) => SceneSettings["player"])
  ) => {
    setDraftPlayerSettings((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftPlayerSettingsRef.current = next;
      return next;
    });
  };

  sceneSettingsRef.current = sceneSettings;
  selectedNodeRef.current = selectedNode;
  selectedEntityRef.current = selectedEntity;
  selectedTargetRef.current = selectedTarget;

  useEffect(() => {
    const nextDraftTransform = selectedTarget ? structuredClone(selectedTarget.transform) : undefined;
    draftTransformRef.current = nextDraftTransform;
    setDraftTransform(nextDraftTransform);
  }, [
    selectedTarget?.id,
    selectedTarget?.transform.position.x,
    selectedTarget?.transform.position.y,
    selectedTarget?.transform.position.z,
    selectedTarget?.transform.rotation.x,
    selectedTarget?.transform.rotation.y,
    selectedTarget?.transform.rotation.z,
    selectedTarget?.transform.scale.x,
    selectedTarget?.transform.scale.y,
    selectedTarget?.transform.scale.z,
    selectedTarget?.transform.pivot?.x,
    selectedTarget?.transform.pivot?.y,
    selectedTarget?.transform.pivot?.z
  ]);

  useEffect(() => {
    const nextWorldSettings = structuredClone(sceneSettings.world);
    const nextPlayerSettings = structuredClone(sceneSettings.player);
    draftWorldSettingsRef.current = nextWorldSettings;
    draftPlayerSettingsRef.current = nextPlayerSettings;
    setDraftWorldSettings(nextWorldSettings);
    setDraftPlayerSettings(nextPlayerSettings);
  }, [sceneSettings]);

  const selectedIsBrush = selectedNode?.kind === "brush";
  const selectedIsInstancing = selectedNode ? isInstancingNode(selectedNode) : false;
  const selectedIsMesh = selectedNode?.kind === "mesh";
  const selectedMeshNode = selectedNode?.kind === "mesh" ? selectedNode : undefined;
  const selectedInstancingNode = selectedNode && isInstancingNode(selectedNode) ? selectedNode : undefined;
  const selectedPrimitive = selectedNode && isPrimitiveNode(selectedNode) ? selectedNode : undefined;
  const selectedLight = selectedNode && isLightNode(selectedNode) ? selectedNode : undefined;
  const selectedProceduralWorld = selectedNode && isProceduralWorldNode(selectedNode) ? selectedNode : undefined;
  const selectedMeshTerrain = selectedNode && isMeshTerrainNode(selectedNode) ? selectedNode : undefined;

  const commitTerrainNodeData = (nodeId: string, data: TerrainNodeData) => {
    if (onUpdateTerrainNodeData) {
      onUpdateTerrainNodeData(nodeId, data);
      return;
    }

    // Fallback until the host adds a terrain branch. The cast is unavoidable:
    // the shared handler's payload union does not yet include terrain data.
    onUpdateNodeData(nodeId, data as unknown as ProceduralWorldNodeData);
  };

  const updateDraftAxis = (
    group: "position" | "pivot" | "rotation" | "scale",
    axis: (typeof AXES)[number],
    value: number
  ) => {
    setDraftTransformState((current) => {
      if (!current) {
        return current;
      }

      if (group === "pivot") {
        const currentPivot = current.pivot ?? vec3(0, 0, 0);

        return rebaseTransformPivot(current, {
          ...currentPivot,
          [axis]: value
        });
      }

      return {
        ...current,
        [group]: {
          ...current[group],
          [axis]: value
        }
      };
    });
  };

  const commitDraftTransform = () => {
    const currentTarget = selectedTargetRef.current;
    const currentNode = selectedNodeRef.current;
    const currentEntity = selectedEntityRef.current;
    const currentDraftTransform = draftTransformRef.current;

    if (!currentTarget || !currentDraftTransform) {
      return;
    }

    if (currentNode) {
      onUpdateNodeTransform(
        currentNode.id,
        isInstancingNode(currentNode)
          ? {
              position: structuredClone(currentDraftTransform.position),
              rotation: structuredClone(currentDraftTransform.rotation),
              scale: structuredClone(currentDraftTransform.scale)
            }
          : currentDraftTransform
      );
      return;
    }

    if (currentEntity) {
      onUpdateEntityTransform(currentEntity.id, currentDraftTransform, currentEntity.transform);
    }
  };

  const commitWorldSettings = () => {
    const currentSceneSettings = sceneSettingsRef.current;

    onUpdateSceneSettings(
      {
        ...currentSceneSettings,
        world: structuredClone(draftWorldSettingsRef.current)
      },
      currentSceneSettings
    );
  };

  const commitWorldSettingsDraft = (nextWorldSettings: SceneSettings["world"]) => {
    setDraftWorldSettingsState(nextWorldSettings);
    onUpdateSceneSettings(
      {
        ...sceneSettingsRef.current,
        world: structuredClone(nextWorldSettings)
      },
      sceneSettingsRef.current
    );
  };

  const handleSkyboxFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const nextSource = await readFileAsDataUrl(file);
    const nextWorldSettings = {
      ...draftWorldSettingsRef.current,
      skybox: {
        ...draftWorldSettingsRef.current.skybox,
        enabled: true,
        format: inferSkyboxFormat(file),
        name: file.name,
        source: nextSource
      }
    };

    commitWorldSettingsDraft(nextWorldSettings);
  };

  const handleRemoveSkybox = () => {
    commitWorldSettingsDraft({
      ...draftWorldSettingsRef.current,
      skybox: {
        ...draftWorldSettingsRef.current.skybox,
        enabled: false,
        name: "",
        source: ""
      }
    });
  };

  const commitPlayerSettings = () => {
    const currentSceneSettings = sceneSettingsRef.current;

    onUpdateSceneSettings(
      {
        ...currentSceneSettings,
        player: structuredClone(draftPlayerSettingsRef.current)
      },
      currentSceneSettings
    );
  };

  if (!activeRightPanel) {
    return null;
  }

  return (
    <div className={cn(
      "pointer-events-none absolute z-40 flex flex-col gap-2 overflow-visible",
      /* Always a left sidebar — from just below menu bar to near bottom */
      "right-2 top-16 items-end",
      "bottom-2 w-56 sm:w-72 md:w-80 lg:w-[23rem]",
    )}>
      {/* Panel body */}
      <div className="editor-dock-panel pointer-events-auto relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[20px]">
        <Tabs
          className="flex min-h-0 flex-1 flex-col gap-0"
          onValueChange={(value) => onChangeRightPanel(value as RightPanelId)}
          value={activeRightPanel}
        >
          <div className="editor-dock-header px-3 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="editor-toolbar-label">Details</div>
                <div className="mt-1 truncate text-[11px] font-medium text-foreground/56">
                  {activeRightPanel ? startCase(activeRightPanel) : "Inspector"}
                </div>
              </div>
              <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
                {selectionEnabled ? "Editable" : "Sim"}
              </span>
            </div>
          </div>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3 pt-2" value="scene">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="grid grid-cols-2 gap-1.5 px-1">
                <Button
                  className={cn(
                    "editor-toolbar-button rounded-[10px] hover:translate-y-0 active:scale-100",
                    sceneSection === "hierarchy" && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  onClick={() => setSceneSection("hierarchy")}
                  size="xs"
                  variant="ghost"
                >
                  Hierarchy
                </Button>
                <Button
                  className={cn(
                    "editor-toolbar-button rounded-[10px] hover:translate-y-0 active:scale-100",
                    sceneSection === "paths" && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  onClick={() => setSceneSection("paths")}
                  size="xs"
                  variant="ghost"
                >
                  Paths
                </Button>
              </div>
              {sceneSection === "hierarchy" ? (
                <div className="min-h-0 flex-1">
                  <SceneHierarchyPanel
                    effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
                    effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
                    entities={entities}
                    hiddenSceneItemIds={hiddenSceneItemIds}
                    interactive={selectionEnabled}
                    lockedSceneItemIds={lockedSceneItemIds}
                    nodes={nodes}
                    onFocusNode={onFocusNode}
                    onSelectNodes={onSelectNodes}
                    onToggleSceneItemLock={onToggleSceneItemLock}
                    onToggleSceneItemVisibility={onToggleSceneItemVisibility}
                    selectedNodeIds={selectedNodeIds}
                  />
                </div>
              ) : (
                <ScrollArea className="h-full pr-1">
                  <PathsPanel
                    activeToolId={activeToolId}
                    onSelectScenePath={onSelectScenePath}
                    onSetToolId={onSetToolId}
                    onUpdateSceneSettings={onUpdateSceneSettings}
                    sceneSettings={sceneSettings}
                    selectedPathId={selectedScenePathId}
                  />
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3 pt-2" value="world">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-4 px-1 pb-1">
                {selectedProceduralWorld ? (
                  <ProceduralWorldInspector node={selectedProceduralWorld} onUpdate={(data) => onUpdateNodeData(selectedProceduralWorld.id, data)} />
                ) : nodes.some(isProceduralWorldNode) ? (
                  <div className="text-xs text-foreground/55">Select the procedural-world node to edit its LAAS settings.</div>
                ) : (
                  <Button onClick={onCreateProceduralWorld} size="sm">Create LAAS World</Button>
                )}
                <ToolSection title="Physics">
                  <BooleanField
                    label="Physics Enabled"
                    onCheckedChange={(checked) => setDraftWorldSettingsState((current) => ({ ...current, physicsEnabled: checked }))}
                    checked={draftWorldSettings.physicsEnabled}
                  />
                  <TransformGroup
                    label="Gravity"
                    onCommit={commitWorldSettings}
                    onUpdate={(axis, value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        gravity: {
                          ...current.gravity,
                          [axis]: value
                        }
                      }))
                    }
                    precision={2}
                    step={0.1}
                    values={draftWorldSettings.gravity}
                  />
                  <div className="flex justify-end">
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save World Settings
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="Ambient">
                  <ColorField
                    label="Ambient Color"
                    onChange={(value) => setDraftWorldSettingsState((current) => ({ ...current, ambientColor: value }))}
                    value={draftWorldSettings.ambientColor}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Intensity"
                    onChange={(value) => setDraftWorldSettingsState((current) => ({ ...current, ambientIntensity: value }))}
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.ambientIntensity}
                  />
                </ToolSection>

                <ToolSection title="Grass">
                  <BooleanField
                    label="Enabled"
                    onCheckedChange={(checked) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        grass: {
                          ...current.grass,
                          enabled: checked
                        }
                      }))
                    }
                    checked={draftWorldSettings.grass.enabled}
                  />
                  <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
                    Grass is rendered as an editor viewport preview right now. It follows the scene center, sways in the wind,
                    and bends away from your pointer in perspective view.
                  </div>
                  {draftWorldSettings.grass.enabled ? (
                    <>
                      <DragInput
                        className="w-full"
                        compact
                        label="Density"
                        max={2.5}
                        min={0}
                        onChange={(value) =>
                          setDraftWorldSettingsState((current) => ({
                            ...current,
                            grass: {
                              ...current.grass,
                              density: Math.max(0, value)
                            }
                          }))
                        }
                        onValueCommit={commitWorldSettings}
                        precision={2}
                        step={0.05}
                        value={draftWorldSettings.grass.density}
                      />
                      <DragInput
                        className="w-full"
                        compact
                        label="Radius"
                        max={60}
                        min={4}
                        onChange={(value) =>
                          setDraftWorldSettingsState((current) => ({
                            ...current,
                            grass: {
                              ...current.grass,
                              radius: Math.max(4, value)
                            }
                          }))
                        }
                        onValueCommit={commitWorldSettings}
                        precision={2}
                        step={0.5}
                        value={draftWorldSettings.grass.radius}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <DragInput
                          className="min-w-0"
                          compact
                          label="Blade H"
                          max={2}
                          min={0.2}
                          onChange={(value) =>
                            setDraftWorldSettingsState((current) => ({
                              ...current,
                              grass: {
                                ...current.grass,
                                bladeHeight: Math.max(0.2, value)
                              }
                            }))
                          }
                          onValueCommit={commitWorldSettings}
                          precision={2}
                          step={0.05}
                          value={draftWorldSettings.grass.bladeHeight}
                        />
                        <DragInput
                          className="min-w-0"
                          compact
                          label="Blade W"
                          max={0.22}
                          min={0.02}
                          onChange={(value) =>
                            setDraftWorldSettingsState((current) => ({
                              ...current,
                              grass: {
                                ...current.grass,
                                bladeWidth: Math.max(0.02, value)
                              }
                            }))
                          }
                          onValueCommit={commitWorldSettings}
                          precision={3}
                          step={0.01}
                          value={draftWorldSettings.grass.bladeWidth}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <DragInput
                          className="min-w-0"
                          compact
                          label="Wind Speed"
                          max={6}
                          min={0}
                          onChange={(value) =>
                            setDraftWorldSettingsState((current) => ({
                              ...current,
                              grass: {
                                ...current.grass,
                                windSpeed: Math.max(0, value)
                              }
                            }))
                          }
                          onValueCommit={commitWorldSettings}
                          precision={2}
                          step={0.05}
                          value={draftWorldSettings.grass.windSpeed}
                        />
                        <DragInput
                          className="min-w-0"
                          compact
                          label="Wind Force"
                          max={1.5}
                          min={0}
                          onChange={(value) =>
                            setDraftWorldSettingsState((current) => ({
                              ...current,
                              grass: {
                                ...current.grass,
                                windStrength: Math.max(0, value)
                              }
                            }))
                          }
                          onValueCommit={commitWorldSettings}
                          precision={2}
                          step={0.01}
                          value={draftWorldSettings.grass.windStrength}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <DragInput
                          className="min-w-0"
                          compact
                          label="Push Radius"
                          max={5}
                          min={0}
                          onChange={(value) =>
                            setDraftWorldSettingsState((current) => ({
                              ...current,
                              grass: {
                                ...current.grass,
                                interactionRadius: Math.max(0, value)
                              }
                            }))
                          }
                          onValueCommit={commitWorldSettings}
                          precision={2}
                          step={0.05}
                          value={draftWorldSettings.grass.interactionRadius}
                        />
                        <DragInput
                          className="min-w-0"
                          compact
                          label="Push Force"
                          max={2}
                          min={0}
                          onChange={(value) =>
                            setDraftWorldSettingsState((current) => ({
                              ...current,
                              grass: {
                                ...current.grass,
                                interactionStrength: Math.max(0, value)
                              }
                            }))
                          }
                          onValueCommit={commitWorldSettings}
                          precision={2}
                          step={0.05}
                          value={draftWorldSettings.grass.interactionStrength}
                        />
                      </div>
                      <ColorField
                        label="Base Color"
                        onChange={(value) =>
                          setDraftWorldSettingsState((current) => ({
                            ...current,
                            grass: {
                              ...current.grass,
                              baseColor: value
                            }
                          }))
                        }
                        value={draftWorldSettings.grass.baseColor}
                      />
                      <ColorField
                        label="Tip Color"
                        onChange={(value) =>
                          setDraftWorldSettingsState((current) => ({
                            ...current,
                            grass: {
                              ...current.grass,
                              tipColor: value
                            }
                          }))
                        }
                        value={draftWorldSettings.grass.tipColor}
                      />
                    </>
                  ) : (
                    <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
                      Turn grass on to preview a soft instanced field around the current scene.
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save Grass
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="LOD Bake">
                  <BooleanField
                    label="Bake Runtime LODs"
                    onCheckedChange={(checked) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          enabled: checked
                        }
                      }))
                    }
                    checked={draftWorldSettings.lod.enabled}
                  />
                  <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
                    Runtime bundle export keeps the authored mesh as high detail and generates `mid` + `low` variants from
                    these ratios. Games choose the switch distances at load time.
                  </div>
                  <DragInput
                    className="w-full"
                    compact
                    label="Mid Detail"
                    max={0.95}
                    min={0.1}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          midDetailRatio: Math.max(Math.max(0.1, value), current.lod.lowDetailRatio)
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.02}
                    value={draftWorldSettings.lod.midDetailRatio}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Low Detail"
                    max={draftWorldSettings.lod.midDetailRatio}
                    min={0.05}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          lowDetailRatio: Math.min(current.lod.midDetailRatio, Math.max(0.05, value))
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.02}
                    value={draftWorldSettings.lod.lowDetailRatio}
                  />
                  <div className="rounded-xl bg-white/3 px-3 py-2 text-[11px] text-foreground/60">
                    There is no separate editor bake step. The runtime export writes the baked LOD tiers into the bundle.
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save LOD Settings
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="Skybox">
                  <BooleanField
                    label="Enabled"
                    onCheckedChange={(checked) =>
                      commitWorldSettingsDraft({
                        ...draftWorldSettings,
                        skybox: {
                          ...draftWorldSettings.skybox,
                          enabled: checked
                        }
                      })
                    }
                    checked={draftWorldSettings.skybox.enabled}
                  />
                  <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
                    HDRs are best when you want image-based lighting. Leave `Affect Lighting` off to use the skybox as backdrop only.
                  </div>
                  <Input
                    accept=".hdr,image/*"
                    className="h-9 rounded-xl border-white/8 bg-white/5 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:font-medium"
                    onChange={(event) => {
                      void handleSkyboxFileChange(event);
                    }}
                    type="file"
                  />
                  <div className="rounded-xl bg-white/3 px-3 py-2 text-xs text-foreground/72">
                    {draftWorldSettings.skybox.name || "No skybox selected"}
                  </div>
                  <BooleanField
                    label="Affect Lighting"
                    onCheckedChange={(checked) =>
                      commitWorldSettingsDraft({
                        ...draftWorldSettings,
                        skybox: {
                          ...draftWorldSettings.skybox,
                          affectsLighting: checked
                        }
                      })
                    }
                    checked={draftWorldSettings.skybox.affectsLighting}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Backdrop Intensity"
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        skybox: {
                          ...current.skybox,
                          intensity: Math.max(0, value)
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.skybox.intensity}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Lighting Intensity"
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        skybox: {
                          ...current.skybox,
                          lightingIntensity: Math.max(0, value)
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.skybox.lightingIntensity}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Blur"
                    max={1}
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        skybox: {
                          ...current.skybox,
                          blur: Math.max(0, Math.min(1, value))
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.skybox.blur}
                  />
                  <div className="flex justify-end gap-2">
                    <Button disabled={!draftWorldSettings.skybox.source} onClick={handleRemoveSkybox} size="xs" variant="ghost">
                      Remove Skybox
                    </Button>
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save Skybox
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="Fog">
                  <ColorField
                    label="Fog Color"
                    onChange={(value) => setDraftWorldSettingsState((current) => ({ ...current, fogColor: value }))}
                    value={draftWorldSettings.fogColor}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Near"
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        fogNear: Math.max(0, Math.min(value, current.fogFar - 0.01)),
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.5}
                    value={draftWorldSettings.fogNear}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Far"
                    min={0.01}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        fogFar: Math.max(value, current.fogNear + 0.01),
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={1}
                    value={draftWorldSettings.fogFar}
                  />
                </ToolSection>

                <AmbientAudioSection
                  onUpdateSceneSettings={onUpdateSceneSettings}
                  sceneSettings={sceneSettings}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3 pt-2" value="player">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-4 px-1 pb-1">
                <ToolSection title="Camera">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      ["fps", "FPS"],
                      ["third-person", "3rd Person"],
                      ["top-down", "Top Down"]
                    ] as const).map(([value, label]) => (
                      <Button
                        className={cn(draftPlayerSettings.cameraMode === value && "bg-emerald-500/18 text-emerald-200")}
                        key={value}
                        onClick={() => {
                          setDraftPlayerSettingsState((current) => ({ ...current, cameraMode: value }));
                          onUpdateSceneSettings(
                            {
                              ...sceneSettings,
                              player: {
                                ...sceneSettings.player,
                                cameraMode: value
                              }
                            },
                            sceneSettings
                          );
                        }}
                        size="xs"
                        variant="ghost"
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </ToolSection>

                <ToolSection title="Movement">
                  <DragInput
                    className="w-full"
                    compact
                    label="Height"
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, height: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.height}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Move Speed"
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, movementSpeed: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.1}
                    value={draftPlayerSettings.movementSpeed}
                  />
                  <BooleanField
                    label="Allow Run"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canRun: checked };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canRun}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Run Speed"
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, runningSpeed: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.1}
                    value={draftPlayerSettings.runningSpeed}
                  />
                </ToolSection>

                <ToolSection title="Traversal">
                  <BooleanField
                    label="Allow Jump"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canJump: checked };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canJump}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Jump Height"
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, jumpHeight: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.jumpHeight}
                  />
                  <BooleanField
                    label="Allow Crouch"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canCrouch: checked };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canCrouch}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Crouch Height"
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, crouchHeight: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.crouchHeight}
                  />
                </ToolSection>

                <ToolSection title="Interaction">
                  <BooleanField
                    label="Allow Interact"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canInteract: checked };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canInteract ?? true}
                  />
                  <InteractKeyField
                    value={draftPlayerSettings.interactKey ?? "KeyE"}
                    onChange={(code) => {
                      const nextPlayer = { ...draftPlayerSettings, interactKey: code };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                  />
                </ToolSection>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3 pt-2" value="inspector">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-4 px-1 pb-1">
                {selectedTarget ? (
                  <>
                    <div className="space-y-1">
                      <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
                        {"kind" in selectedTarget ? selectedTarget.kind : selectedTarget.type}
                      </div>
                      <div className="text-sm font-medium text-foreground">{selectedTarget.name}</div>
                    </div>

                    {draftTransform ? (
                      <div className="space-y-3">
                        <TransformGroup
                          label="Position"
                          onCommit={commitDraftTransform}
                          onUpdate={(axis, value) => updateDraftAxis("position", axis, value)}
                          precision={2}
                          step={0.05}
                          values={draftTransform.position}
                        />
                        {"kind" in selectedTarget ? (
                          <>
                            <TransformGroup
                              label="Rotation"
                              onCommit={commitDraftTransform}
                              onUpdate={(axis, value) => updateDraftAxis("rotation", axis, value)}
                              precision={1}
                              step={0.25}
                              values={draftTransform.rotation}
                            />
                            <TransformGroup
                              label="Scale"
                              onCommit={commitDraftTransform}
                              onUpdate={(axis, value) => updateDraftAxis("scale", axis, value)}
                              precision={2}
                              step={0.05}
                              values={draftTransform.scale}
                            />
                            {!selectedIsInstancing ? (
                              <TransformGroup
                                label="Pivot"
                                onCommit={commitDraftTransform}
                                onUpdate={(axis, value) => updateDraftAxis("pivot", axis, value)}
                                precision={2}
                                step={0.05}
                                values={draftTransform.pivot ?? vec3(0, 0, 0)}
                              />
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <ToolSection title="Quick Actions">
                      <div className="flex flex-wrap gap-1.5">
                        <Button onClick={() => onTranslateSelection("x", -1)} size="xs" variant="ghost">
                          X-
                        </Button>
                        <Button onClick={() => onTranslateSelection("x", 1)} size="xs" variant="ghost">
                          X+
                        </Button>
                        <Button onClick={() => onTranslateSelection("y", -1)} size="xs" variant="ghost">
                          Y-
                        </Button>
                        <Button onClick={() => onTranslateSelection("y", 1)} size="xs" variant="ghost">
                          Y+
                        </Button>
                        <Button onClick={() => onTranslateSelection("z", -1)} size="xs" variant="ghost">
                          Z-
                        </Button>
                        <Button onClick={() => onTranslateSelection("z", 1)} size="xs" variant="ghost">
                          Z+
                        </Button>
                      </div>
                      {"kind" in selectedTarget ? (
                        <div className="flex flex-wrap gap-1.5">
                          <Button onClick={() => onMirrorSelection("x")} size="xs" variant="ghost">
                            Mirror X
                          </Button>
                          <Button onClick={() => onMirrorSelection("y")} size="xs" variant="ghost">
                            Mirror Y
                          </Button>
                          <Button onClick={() => onMirrorSelection("z")} size="xs" variant="ghost">
                            Mirror Z
                          </Button>
                        </div>
                      ) : null}
                    </ToolSection>

                    {selectedPrimitive ? (
                      <PrimitiveInspector node={selectedPrimitive} onUpdateNodeData={onUpdateNodeData} />
                    ) : null}
                    {selectedMeshNode ? (
                      <MeshPhysicsInspector
                        node={selectedMeshNode}
                        onUpdateMeshData={onUpdateMeshData}
                      />
                    ) : null}
                    {selectedMeshNode ? (
                      <MeshModelingInspector
                        activeToolId={activeToolId}
                        meshEditMode={meshEditMode}
                        node={selectedMeshNode}
                        nodes={nodes}
                        onMeshEditToolbarAction={onMeshEditToolbarAction}
                        onUpdateMeshData={onUpdateMeshData}
                        selectedFaceIds={selectedFaceIds}
                      />
                    ) : null}
                    {selectedInstancingNode ? <InstancingInspector node={selectedInstancingNode} /> : null}
                    {selectedLight ? <LightInspector node={selectedLight} onUpdateNodeData={onUpdateNodeData} /> : null}
                    {selectedMeshTerrain ? (
                      <TerrainInspector
                        node={selectedMeshTerrain}
                        onUpdate={(data) => commitTerrainNodeData(selectedMeshTerrain.id, data)}
                      />
                    ) : null}
                    {selectedEntity ? (
                      <EntityInspector entity={selectedEntity} onUpdateEntityProperties={onUpdateEntityProperties} />
                    ) : null}
                    {selectedEntity && (selectedEntity.type === "npc-spawn" || selectedEntity.type === "smart-object") ? (
                      <NpcVoiceInspector entity={selectedEntity} onUpdateEntityProperties={onUpdateEntityProperties} />
                    ) : null}

                    {activeToolId === "clip" ? (
                      <ToolSection title="Clip">
                        <div className="flex flex-wrap gap-1.5">
                          <Button disabled={!selectedIsBrush} onClick={() => onClipSelection("x")} size="xs" variant="ghost">
                            Split X
                          </Button>
                          <Button disabled={!selectedIsBrush} onClick={() => onClipSelection("y")} size="xs" variant="ghost">
                            Split Y
                          </Button>
                          <Button disabled={!selectedIsBrush} onClick={() => onClipSelection("z")} size="xs" variant="ghost">
                            Split Z
                          </Button>
                        </div>
                      </ToolSection>
                    ) : null}

                    {activeToolId === "extrude" ? (
                      <ToolSection title="Extrude">
                        <div className="flex flex-wrap gap-1.5">
                          <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("x", -1)} size="xs" variant="ghost">
                            X-
                          </Button>
                          <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("x", 1)} size="xs" variant="ghost">
                            X+
                          </Button>
                          <Button onClick={() => onExtrudeSelection("y", -1)} size="xs" variant="ghost">
                            Y-
                          </Button>
                          <Button onClick={() => onExtrudeSelection("y", 1)} size="xs" variant="ghost">
                            Y+
                          </Button>
                          <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("z", -1)} size="xs" variant="ghost">
                            Z-
                          </Button>
                          <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("z", 1)} size="xs" variant="ghost">
                            Z+
                          </Button>
                        </div>
                      </ToolSection>
                    ) : null}

                    {activeToolId === "mesh-edit" ? (
                      <ToolSection title="Mesh Edit">
                        <div className="flex flex-wrap gap-1.5">
                          <Button disabled={!selectedIsMesh} onClick={() => onMeshEditToolbarAction("inflate")} size="xs" variant="ghost">
                            Inflate
                          </Button>
                          <Button disabled={!selectedIsMesh} onClick={() => onMeshEditToolbarAction("deflate")} size="xs" variant="ghost">
                            Deflate
                          </Button>
                          <Button disabled={!selectedIsMesh} onClick={() => onExtrudeSelection("y", 1)} size="xs" variant="ghost">
                            Raise Top
                          </Button>
                          <Button disabled={!selectedIsMesh} onClick={() => onExtrudeSelection("y", -1)} size="xs" variant="ghost">
                            Lower Top
                          </Button>
                        </div>
                      </ToolSection>
                    ) : null}
                  </>
                ) : (
                  <div className="pt-1 text-xs text-foreground/48">Select an object to inspect it.</div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3 pt-2" value="hooks">
            <ScrollArea className="h-full pr-1">
              <HooksPanel
                entities={entities}
                nodes={nodes}
                onUpdateEntityHooks={onUpdateEntityHooks}
                onUpdateNodeHooks={onUpdateNodeHooks}
                sceneSettings={sceneSettings}
                selectedEntity={selectedEntity}
                selectedNode={selectedNode}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3 pt-2" value="events">
            <ScrollArea className="h-full pr-1">
              <EventsPanel onUpdateSceneSettings={onUpdateSceneSettings} sceneSettings={sceneSettings} />
            </ScrollArea>
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 px-3 pb-3 pt-2" value="materials">
            <MaterialLibraryPanel
              materials={materials}
              onApplyMaterial={onApplyMaterial}
              onDeleteMaterial={onDeleteMaterial}
              onDeleteTexture={onDeleteTexture}
              onSelectMaterial={onSelectMaterial}
              onSetUvOffset={onSetUvOffset}
              onSetUvScale={onSetUvScale}
              onUpdateMeshData={onUpdateMeshData}
              onUpsertMaterial={onUpsertMaterial}
              onUpsertTexture={onUpsertTexture}
              selectedFaceIds={activeToolId === "mesh-edit" && meshEditMode === "face" ? selectedFaceIds : []}
              selectedMaterialId={selectedMaterialId}
              selectedNode={selectedNode}
              textures={textures}
            />
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2" value="surface">
            <SurfaceAuthoringPanel
              materials={materials}
              onUpdateMeshData={onUpdateMeshData}
              selectedFaceIds={activeToolId === "mesh-edit" && meshEditMode === "face" ? selectedFaceIds : []}
              selectedMaterialId={selectedMaterialId}
              selectedNode={selectedNode}
            />
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2" value="voices">
            <ScrollArea className="min-h-0 flex-1 pr-1">
              <VoicesPanel />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PrimitiveInspector({
  node,
  onUpdateNodeData
}: {
  node: Extract<GeometryNode, { kind: "primitive" }>;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
}) {
  const updateData = (next: PrimitiveNodeData) => onUpdateNodeData(node.id, next);

  return (
    <ToolSection title={node.data.role === "prop" ? "Prop" : "Primitive"}>
      <div className="grid grid-cols-3 gap-1.5">
        <DragInput
          className="min-w-0"
          compact
          label="W"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, x: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.x}
        />
        <DragInput
          className="min-w-0"
          compact
          label="H"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, y: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.y}
        />
        <DragInput
          className="min-w-0"
          compact
          label="D"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, z: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.z}
        />
      </div>

      {node.data.role === "prop" && node.data.physics ? (
        <PropPhysicsFields
          physics={node.data.physics}
          onChange={(physics) => updateData({ ...node.data, physics })}
        />
      ) : null}
    </ToolSection>
  );
}

function MeshPhysicsInspector({
  node,
  onUpdateMeshData
}: {
  node: Extract<GeometryNode, { kind: "mesh" }>;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
}) {
  const physics = node.data.physics;

  return (
    <ToolSection title="Mesh Physics">
      <BooleanField
        label="Enabled"
        onCheckedChange={(checked) => {
          if (checked) {
            onUpdateMeshData(
              node.id,
              {
                ...node.data,
                physics: physics ?? createDefaultMeshPhysics()
              },
              node.data
            );
            return;
          }

          onUpdateMeshData(
            node.id,
            {
              ...node.data,
              physics: undefined
            },
            node.data
          );
        }}
        checked={Boolean(physics)}
      />

      {physics ? (
        <PropPhysicsFields
          physics={physics}
          onChange={(nextPhysics) =>
            onUpdateMeshData(
              node.id,
              { ...node.data, physics: nextPhysics },
              node.data
            )
          }
        />
      ) : (
        <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
          Enable physics to simulate this mesh at runtime.
        </div>
      )}
    </ToolSection>
  );
}

function MeshModifierCard({
  modifier,
  onChange,
  onRemove,
  otherMeshNodes
}: {
  modifier: MeshModelingModifier;
  onChange: (modifier: MeshModelingModifier) => void;
  onRemove: () => void;
  otherMeshNodes: Array<Extract<GeometryNode, { kind: "mesh" }>>;
}) {
  return (
    <div className="editor-dock-note space-y-2 rounded-xl px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground/78">{modifier.label}</div>
          <div className="text-[10px] text-foreground/48">{modifier.type.toUpperCase()}</div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={modifier.enabled} onCheckedChange={(enabled) => onChange({ ...modifier, enabled })} />
          <Button onClick={onRemove} size="xs" variant="ghost">Remove</Button>
        </div>
      </div>
      {modifier.type === "boolean" ? (
        <MeshBooleanModifierFields
          modifier={modifier}
          onChange={onChange}
          otherMeshNodes={otherMeshNodes}
        />
      ) : null}
      {modifier.type === "mirror" ? (
        <>
          <EnumGrid
            activeValue={modifier.axis}
            entries={[
              { label: "X", value: "x" },
              { label: "Y", value: "y" },
              { label: "Z", value: "z" }
            ]}
            onSelect={(value) => onChange({ ...modifier, axis: value as "x" | "y" | "z" })}
          />
          <BooleanField
            checked={modifier.weld}
            label="Weld Mirrored Seam"
            onCheckedChange={(weld) => onChange({ ...modifier, weld })}
          />
        </>
      ) : null}
      {modifier.type === "solidify" ? (
        <NumberField label="Thickness" onChange={(thickness) => onChange({ ...modifier, thickness })} value={modifier.thickness} />
      ) : null}
      {modifier.type === "lattice" ? (
        <MeshLatticeModifierFields modifier={modifier} onChange={onChange} />
      ) : null}
      {modifier.type === "remesh" ? (
        <MeshRemeshModifierFields modifier={modifier} onChange={onChange} />
      ) : null}
      {modifier.type === "retopo" ? (
        <MeshRetopoModifierFields modifier={modifier} onChange={onChange} />
      ) : null}
    </div>
  );
}

function MeshBooleanModifierFields({
  modifier,
  onChange,
  otherMeshNodes
}: {
  modifier: MeshBooleanModifier;
  onChange: (modifier: MeshBooleanModifier) => void;
  otherMeshNodes: Array<Extract<GeometryNode, { kind: "mesh" }>>;
}) {
  return (
    <div className="space-y-2">
      <EnumGrid
        activeValue={modifier.operation}
        entries={[
          { label: "Union", value: "union" },
          { label: "Diff", value: "difference" },
          { label: "Intersect", value: "intersect" }
        ]}
        onSelect={(value) => onChange({ ...modifier, operation: value as MeshBooleanModifier["operation"] })}
      />
      <EnumGrid
        activeValue={modifier.mode}
        entries={[
          { label: "Live", value: "live" },
          { label: "Apply", value: "apply" }
        ]}
        onSelect={(value) => onChange({ ...modifier, mode: value as MeshBooleanModifier["mode"] })}
      />
      <TextField
        label="Target Mesh"
        onChange={(targetNodeId) => onChange({ ...modifier, targetNodeId })}
        value={modifier.targetNodeId ?? ""}
      />
      {otherMeshNodes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {otherMeshNodes.slice(0, 4).map((candidate) => (
            <Button
              key={candidate.id}
              onClick={() => onChange({ ...modifier, targetNodeId: candidate.id })}
              size="xs"
              variant="ghost"
            >
              {candidate.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MeshLatticeModifierFields({
  modifier,
  onChange
}: {
  modifier: MeshLatticeModifier;
  onChange: (modifier: MeshLatticeModifier) => void;
}) {
  return (
    <div className="space-y-2">
      <EnumGrid
        activeValue={modifier.mode}
        entries={[
          { label: "Bend", value: "bend" },
          { label: "Twist", value: "twist" },
          { label: "Taper", value: "taper" }
        ]}
        onSelect={(value) => onChange({ ...modifier, mode: value as MeshLatticeModifier["mode"] })}
      />
      <EnumGrid
        activeValue={modifier.axis}
        entries={[
          { label: "X", value: "x" },
          { label: "Y", value: "y" },
          { label: "Z", value: "z" }
        ]}
        onSelect={(value) => onChange({ ...modifier, axis: value as MeshLatticeModifier["axis"] })}
      />
      <NumberField label="Intensity" onChange={(intensity) => onChange({ ...modifier, intensity })} value={modifier.intensity} />
      <NumberField label="Falloff" onChange={(falloff) => onChange({ ...modifier, falloff })} value={modifier.falloff} />
    </div>
  );
}

function MeshRemeshModifierFields({
  modifier,
  onChange
}: {
  modifier: MeshRemeshModifier;
  onChange: (modifier: MeshRemeshModifier) => void;
}) {
  return (
    <div className="space-y-2">
      <EnumGrid
        activeValue={modifier.mode}
        entries={[
          { label: "Cleanup", value: "cleanup" },
          { label: "Quad", value: "quad" },
          { label: "Voxel", value: "voxel" }
        ]}
        onSelect={(value) => onChange({ ...modifier, mode: value as MeshRemeshModifier["mode"] })}
      />
      <NumberField label="Resolution" onChange={(resolution) => onChange({ ...modifier, resolution })} value={modifier.resolution} />
      <NumberField label="Smoothing" onChange={(smoothing) => onChange({ ...modifier, smoothing })} value={modifier.smoothing} />
      <NumberField label="Weld Dist" onChange={(weldDistance) => onChange({ ...modifier, weldDistance })} value={modifier.weldDistance} />
    </div>
  );
}

function MeshRetopoModifierFields({
  modifier,
  onChange
}: {
  modifier: MeshRetopoModifier;
  onChange: (modifier: MeshRetopoModifier) => void;
}) {
  return (
    <div className="space-y-2">
      <NumberField
        label="Target Faces"
        onChange={(targetFaceCount) => onChange({ ...modifier, targetFaceCount: Math.max(1, Math.round(targetFaceCount)) })}
        value={modifier.targetFaceCount}
      />
      <BooleanField
        checked={modifier.preserveBorders}
        label="Preserve Borders"
        onCheckedChange={(preserveBorders) => onChange({ ...modifier, preserveBorders })}
      />
    </div>
  );
}

function MeshFaceGroupCard({
  accentColor,
  faceCount,
  name,
  onAddSelection,
  onNameChange,
  onRemove
}: {
  accentColor: string;
  faceCount: number;
  name: string;
  onAddSelection?: () => void;
  onNameChange: (name: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="editor-dock-note rounded-xl px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <div className="min-w-0 flex-1">
          <TextField label="Name" onChange={onNameChange} value={name} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-foreground/56">
        <span>{faceCount} faces</span>
        <div className="flex gap-1.5">
          {onAddSelection ? <Button onClick={onAddSelection} size="xs" variant="ghost">Add Selection</Button> : null}
          <Button onClick={onRemove} size="xs" variant="ghost">Remove</Button>
        </div>
      </div>
    </div>
  );
}

function MeshLodCard({
  lod,
  onChange,
  onRemove
}: {
  lod: MeshLodProfile;
  onChange: (lod: MeshLodProfile) => void;
  onRemove: () => void;
}) {
  return (
    <div className="editor-dock-note rounded-xl px-3 py-2">
      <TextField label="Name" onChange={(name) => onChange({ ...lod, name })} value={lod.name} />
      <NumberField label="Ratio" onChange={(ratio) => onChange({ ...lod, ratio })} value={lod.ratio} />
      <div className="mt-2 flex items-center justify-between text-[11px] text-foreground/56">
        <span>{lod.faceCount ? `${lod.faceCount} faces` : "Face estimate pending"}</span>
        <Button onClick={onRemove} size="xs" variant="ghost">Remove</Button>
      </div>
    </div>
  );
}

function createDefaultModelingModifier(type: MeshModelingModifier["type"], index: number): MeshModelingModifier {
  const id = `modifier:${type}:${Date.now()}:${index}`;

  switch (type) {
    case "boolean":
      return { enabled: true, id, label: "Boolean", mode: "live", operation: "union", type };
    case "mirror":
      return { axis: "x", enabled: true, id, label: "Mirror", type, weld: true };
    case "solidify":
      return { enabled: true, id, label: "Solidify", thickness: 0.2, type };
    case "lattice":
      return { axis: "y", enabled: true, falloff: 1, id, intensity: 0.35, label: "Lattice", mode: "bend", type };
    case "remesh":
      return { enabled: true, id, label: "Remesh", mode: "cleanup", resolution: 32, smoothing: 0.4, type, weldDistance: 0.01 };
    case "retopo":
      return { enabled: true, id, label: "Retopo", preserveBorders: true, targetFaceCount: 128, type };
  }
}

function createDefaultLodProfiles(baseFaceCount: number): MeshLodProfile[] {
  return [
    { faceCount: Math.max(1, Math.round(baseFaceCount * 0.7)), generatedAt: new Date().toISOString(), id: "lod:mid", name: "LOD Mid", ratio: 0.7 },
    { faceCount: Math.max(1, Math.round(baseFaceCount * 0.4)), generatedAt: new Date().toISOString(), id: "lod:low", name: "LOD Low", ratio: 0.4 },
    { faceCount: Math.max(1, Math.round(baseFaceCount * 0.18)), generatedAt: new Date().toISOString(), id: "lod:proxy", name: "LOD Proxy", ratio: 0.18 }
  ];
}

function InstancingInspector({
  node
}: {
  node: Extract<GeometryNode, { kind: "instancing" }>;
}) {
  return (
    <ToolSection title="Instancing">
      <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
        This node instances <span className="font-mono text-foreground/72">{node.data.sourceNodeId}</span>. Only transform
        values are editable here.
      </div>
    </ToolSection>
  );
}

function PropPhysicsFields({
  physics,
  onChange
}: {
  physics: NonNullable<PrimitiveNodeData["physics"]>;
  onChange: (physics: NonNullable<PrimitiveNodeData["physics"]>) => void;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>Physics</SectionTitle>
      <BooleanField
        label="Physics Enabled"
        onCheckedChange={(checked) => onChange({ ...physics, enabled: checked })}
        checked={physics.enabled}
      />
      <EnumGrid
        activeValue={physics.bodyType}
        entries={[
          { label: "Static", value: "fixed" },
          { label: "Dynamic", value: "dynamic" },
          { label: "Kinematic", value: "kinematicPosition" }
        ]}
        onSelect={(value) => onChange({ ...physics, bodyType: value as PropBodyType })}
      />
      <EnumGrid
        activeValue={physics.colliderShape}
        entries={[
          { label: "Cuboid", value: "cuboid" },
          { label: "Ball", value: "ball" },
          { label: "Cylinder", value: "cylinder" },
          { label: "Cone", value: "cone" },
          { label: "Trimesh", value: "trimesh" }
        ]}
        onSelect={(value) => onChange({ ...physics, colliderShape: value as PropColliderShape })}
      />
      <NumberField label="Mass" onChange={(value) => onChange({ ...physics, mass: value })} value={physics.mass ?? 1} />
      <NumberField label="Density" onChange={(value) => onChange({ ...physics, density: value })} value={physics.density ?? 0} />
      <NumberField label="Friction" onChange={(value) => onChange({ ...physics, friction: value })} value={physics.friction} />
      <NumberField label="Restitution" onChange={(value) => onChange({ ...physics, restitution: value })} value={physics.restitution} />
      <NumberField label="Gravity Scale" onChange={(value) => onChange({ ...physics, gravityScale: value })} value={physics.gravityScale} />
      <BooleanField
        label="Sensor"
        onCheckedChange={(checked) => onChange({ ...physics, sensor: checked })}
        checked={physics.sensor}
      />
      <BooleanField
        label="CCD"
        onCheckedChange={(checked) => onChange({ ...physics, ccd: checked })}
        checked={physics.ccd}
      />
      <BooleanField
        label="Lock Rotations"
        onCheckedChange={(checked) => onChange({ ...physics, lockRotations: checked })}
        checked={physics.lockRotations}
      />
      <BooleanField
        label="Lock Translations"
        onCheckedChange={(checked) => onChange({ ...physics, lockTranslations: checked })}
        checked={physics.lockTranslations}
      />
    </div>
  );
}

function createDefaultMeshPhysics(): NonNullable<PrimitiveNodeData["physics"]> {
  return {
    angularDamping: 0.8,
    bodyType: "fixed",
    canSleep: true,
    ccd: false,
    colliderShape: "trimesh",
    contactSkin: 0,
    density: undefined,
    enabled: true,
    friction: 0.8,
    gravityScale: 1,
    linearDamping: 0.7,
    lockRotations: false,
    lockTranslations: false,
    mass: 1,
    restitution: 0.05,
    sensor: false
  };
}

function LightInspector({
  node,
  onUpdateNodeData
}: {
  node: Extract<GeometryNode, { kind: "light" }>;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
}) {
  const updateData = (next: LightNodeData) => onUpdateNodeData(node.id, next);

  return (
    <ToolSection title="Light">
      <BooleanField
        label="Enabled"
        onCheckedChange={(checked) => updateData({ ...node.data, enabled: checked })}
        checked={node.data.enabled}
      />
      <ColorField label="Color" onChange={(value) => updateData({ ...node.data, color: value })} value={node.data.color} />
      <NumberField label="Intensity" onChange={(value) => updateData({ ...node.data, intensity: value })} value={node.data.intensity} />
      {node.data.type === "point" || node.data.type === "spot" ? (
        <>
          <NumberField label="Distance" onChange={(value) => updateData({ ...node.data, distance: value })} value={node.data.distance ?? 0} />
          <NumberField label="Decay" onChange={(value) => updateData({ ...node.data, decay: value })} value={node.data.decay ?? 1} />
        </>
      ) : null}
      {node.data.type === "spot" ? (
        <>
          <NumberField label="Angle" onChange={(value) => updateData({ ...node.data, angle: value })} value={node.data.angle ?? Math.PI / 6} />
          <NumberField label="Penumbra" onChange={(value) => updateData({ ...node.data, penumbra: value })} value={node.data.penumbra ?? 0.35} />
        </>
      ) : null}
      {node.data.type === "hemisphere" ? (
        <ColorField
          label="Ground Color"
          onChange={(value) => updateData({ ...node.data, groundColor: value })}
          value={node.data.groundColor ?? "#0f1721"}
        />
      ) : null}
      <BooleanField
        label="Cast Shadow"
        onCheckedChange={(checked) => updateData({ ...node.data, castShadow: checked })}
        checked={node.data.castShadow}
      />
    </ToolSection>
  );
}

function EntityInspector({
  entity,
  onUpdateEntityProperties
}: {
  entity: Entity;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
}) {
  const updateProperty = (key: string, value: string | number | boolean) => {
    onUpdateEntityProperties(entity.id, {
      ...entity.properties,
      [key]: value
    });
  };

  return (
    <ToolSection title="Properties">
      {Object.entries(entity.properties).map(([key, value]) =>
        typeof value === "boolean" ? (
          <BooleanField key={key} label={startCase(key)} onCheckedChange={(checked) => updateProperty(key, checked)} checked={value} />
        ) : typeof value === "number" ? (
          <NumberField key={key} label={startCase(key)} onChange={(next) => updateProperty(key, next)} value={value} />
        ) : (
          <TextField key={key} label={startCase(key)} onChange={(next) => updateProperty(key, next)} value={value} />
        )
      )}
    </ToolSection>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="px-1 text-[10px] font-semibold tracking-[0.18em] text-[#f6d07d]/58 uppercase">{children}</div>;
}

function ToolSection({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="editor-dock-section space-y-2 rounded-[14px] p-2.5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function TransformGroup({
  label,
  onCommit,
  onUpdate,
  precision,
  step,
  values
}: {
  label: string;
  onCommit: () => void;
  onUpdate: (axis: (typeof AXES)[number], value: number) => void;
  precision: number;
  step: number;
  values: Vec3;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((axis) => (
          <DragInput
            className="min-w-0"
            compact
            key={axis}
            label={axis.toUpperCase()}
            onChange={(value) => onUpdate(axis, value)}
            onValueCommit={onCommit}
            precision={precision}
            step={step}
            value={values[axis]}
          />
        ))}
      </div>
    </div>
  );
}

function EnumGrid({
  activeValue,
  entries,
  onSelect
}: {
  activeValue: string;
  entries: Array<{ label: string; value: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {entries.map((entry) => (
        <Button
          className={cn(
            "editor-toolbar-button rounded-[10px] hover:translate-y-0 active:scale-100",
            activeValue === entry.value && "editor-toolbar-button-active text-[#fff0cb]"
          )}
          key={entry.value}
          onClick={() => onSelect(entry.value)}
          size="xs"
          variant="ghost"
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}

function BooleanField({
  checked,
  label,
  onCheckedChange
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="editor-toolbar-segment flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <span className="text-xs text-foreground/72">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-[0.16em] text-[#f6d07d]/42 uppercase">
          {checked ? "On" : "Off"}
        </span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

function NumberField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <DragInput
      className="w-full"
      compact
      label={label}
      onChange={onChange}
      onValueCommit={() => undefined}
      precision={2}
      step={0.05}
      value={value}
    />
  );
}

function TextField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-1 text-[10px] font-semibold tracking-[0.18em] text-[#f6d07d]/58 uppercase">{label}</div>
      <Input className="h-9 rounded-xl border-white/8 bg-black/24 text-xs" onChange={(event) => onChange(event.target.value)} value={value} />
    </div>
  );
}

function ColorField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="editor-toolbar-segment flex items-center gap-3 rounded-xl px-3 py-2">
      <span className="text-xs text-foreground/72">{label}</span>
      <Input
        className="h-8 flex-1 rounded-lg border-white/8 bg-black/24 text-xs"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </div>
  );
}

function InteractKeyField({
  value,
  onChange
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onChange(event.code);
      setListening(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [listening, onChange]);

  const displayLabel = value.replace(/^Key/, "").replace(/^Digit/, "");

  return (
    <div className="editor-toolbar-segment flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <span className="text-xs text-foreground/72">Interact Key</span>
      <Button
        className={cn(
          "editor-toolbar-button rounded-[10px] hover:translate-y-0 active:scale-100",
          listening && "editor-toolbar-button-active text-[#fff0cb]"
        )}
        onClick={() => setListening((current) => !current)}
        size="xs"
        variant="ghost"
      >
        {listening ? "Press a key..." : displayLabel}
      </Button>
    </div>
  );
}

function startCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function AmbientAudioSection({
  sceneSettings,
  onUpdateSceneSettings
}: {
  sceneSettings: SceneSettings;
  onUpdateSceneSettings: (settings: SceneSettings, before?: SceneSettings) => void;
}) {
  const [description, setDescription] = useState(
    sceneSettings.world.ambientAudio?.description ?? ""
  );
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const existing = sceneSettings.world.ambientAudio;

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) return;
    setLoading(true);
    try {
      const url = await generateSoundEffectUrl(description.trim());
      const next: SceneSettings = {
        ...sceneSettings,
        world: {
          ...sceneSettings.world,
          ambientAudio: { description: description.trim(), audioUrl: url }
        }
      };
      onUpdateSceneSettings(next, sceneSettings);
    } catch (err) {
      console.error("[AmbientAudio] generation failed", err);
    } finally {
      setLoading(false);
    }
  }, [description, sceneSettings.world, onUpdateSceneSettings]);

  const handlePlay = useCallback(() => {
    const url = existing?.audioUrl;
    if (!url) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  }, [existing?.audioUrl]);

  return (
    <ToolSection title="Ambient Audio">
      <div className="space-y-2">
        <textarea
          className="editor-dock-note w-full resize-none rounded-xl px-3 py-2 text-xs placeholder:text-foreground/40 focus:outline-none"
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the soundscape (e.g. wind through pine trees, distant waterfall)"
          rows={2}
          value={description}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1 text-xs"
            disabled={loading || !description.trim()}
            onClick={handleGenerate}
            size="xs"
            variant="ghost"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate Soundscape"}
          </Button>
          {existing?.audioUrl && (
            <Button onClick={handlePlay} size="xs" variant="ghost">
              ▶
            </Button>
          )}
        </div>
        {existing?.audioUrl && (
          <p className="truncate text-[10px] text-foreground/50">{existing.description}</p>
        )}
      </div>
    </ToolSection>
  );
}

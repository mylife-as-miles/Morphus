import type { Command, EditorCore, SceneDocument } from "@blud/editor-core";
import {
  buildQuarterPipe,
  buildHalfPipe,
  buildBank,
  buildSpine,
  buildBowl,
  buildFunBox,
  buildLedge,
  buildRail,
  buildStairSet,
  buildKicker,
  buildManualPad,
  buildPyramid,
  buildHip,
  buildHubbaLedge,
  skateparkMaterials
} from "@blud/skatepark";
import {
  buildWall,
  buildSlab,
  buildCeiling,
  buildRoof,
  buildItem,
  architectureMaterials
} from "@blud/architecture";
import {
  createAssignMaterialCommand,
  createProceduralWorldNodeCommand,
  createAssignMaterialToBrushesCommand,
  createDeleteSelectionCommand,
  createDuplicateNodesCommand,
  createExtrudeBrushNodesCommand,
  createGroupSelectionCommand,
  createMeshInflateCommand,
  createMirrorNodesCommand,
  createOffsetBrushFaceCommand,
  createPlaceBlockoutPlatformCommand,
  createPlaceBlockoutRoomCommand,
  createPlaceBlockoutStairCommand,
  createPlaceEntityCommand,
  createPlaceLightNodeCommand,
  createPlaceMeshNodeCommand,
  createPlacePrimitiveNodeCommand,
  createReplaceNodesCommand,
  createSetEntityCommand,
  createSetMeshDataCommand,
  createSetNodeCommand,
  createSetNodeTransformCommand,
  createSetSceneSettingsCommand,
  createSetUvScaleCommand,
  createSplitBrushNodeAtCoordinateCommand,
  createSplitBrushNodesCommand,
  createTranslateNodesCommand,
  updateProceduralWorldNodeCommand,
  createUpsertMaterialCommand
} from "@blud/editor-core";
import {
  applyEditableMeshModeling,
  arcEditableMeshEdges,
  bevelEditableMeshEdges,
  bridgeEditableMeshEdges,
  captureEditableMeshModelingBase,
  computePolygonNormal,
  convertBrushToEditableMesh,
  createAxisAlignedBrushFromBounds,
  cutEditableMeshBetweenEdges,
  cutEditableMeshFace,
  deleteEditableMeshFaces,
  extrudeEditableMeshEdge,
  extrudeEditableMeshFaces,
  fillEditableMeshFaceFromVertices,
  getFaceVertices,
  initializeEditableMeshModeling,
  insetEditableMeshFaces,
  invertEditableMeshNormals,
  mergeEditableMeshFaces,
  mergeEditableMeshVertices,
  mirrorEditableMesh,
  pokeEditableMeshFaces,
  quadrangulateEditableMeshFaces,
  markEditableMeshUvSeams,
  normalizeEditableMeshTexelDensity,
  packEditableMeshUvs,
  paintEditableMeshFacesMaterial,
  paintEditableMeshTextureBlend,
  paintEditableMeshVertexColors,
  projectEditableMeshUvs,
  scaleEditableMeshVertices,
  solidifyEditableMesh,
  smartUnwrapEditableMesh,
  translateEditableMeshVertices,
  subdivideEditableMeshFace,
  triangulateEditableMeshFaces,
  updateEditableMeshModeling,
  upsertEditableMeshBlendLayer,
  weldEditableMeshVerticesByDistance,
  weldEditableMeshVerticesToTarget,
  createEditableMeshFromPolygons
} from "@blud/geometry-kernel";
import {
  classifyProceduralWorldConfigChange,
  createDefaultProceduralWorldNodeData,
  diffProceduralWorldConfig,
  isBrushNode,
  isMeshNode,
  isProceduralWorldNode,
  makeTransform,
  normalizeProceduralWorldConfig,
  resolveProceduralWorldPreset,
  resolveSceneGraph,
  validateProceduralWorldConfig,
  createDefaultTerrainNodeData,
  isMeshTerrainNode,
  vec2,
  vec3
} from "@blud/shared";
// Copilot-authored terrain goes through the same factories as hand authoring, so
// a stroke placed by the model is indistinguishable from one placed by hand. The
// authoring subpath keeps the CSG evaluator and three-bvh-csg out of this module.
import {
  appendBrushPoint,
  createBooleanVolumeModifier,
  createBrushStroke,
  createRemeshModifier,
  createTessellateModifier,
  createTunnelModifier,
  createWeightPaintStroke
} from "@blud/terrain/authoring";
import { isVfxViewportReady, pendingVfxCastCount, requestVfxCast } from "@/state/vfx-runtime";
import { ELEMENT_META, ELEMENTS, castShapeOf, type ElementId } from "@blud/vfx";
import { forestStore } from "@/state/forest-store";
import { FOREST_PRESETS, type ForestField, type ForestPresetId } from "@blud/forest";
import { getProceduralWorldRuntimeStatus } from "@/lib/procedural-world/runtime-diagnostics";
import { requestProceduralWorldRuntimeAction } from "@/lib/procedural-world/runtime-actions";
import type {
  Asset,
  ColorRGBA,
  EditableMesh,
  GeometryNode,
  GameplayObject,
  GameplayValue,
  GroupNode,
  Material,
  PrimitiveNode,
  ProceduralWorldNode,
  ProceduralWorldNodeData,
  PrimitiveShape,
  MeshBakeMapKind,
  MeshLodProfile,
  MeshModelingModifier,
  MeshPolyGroup,
  MeshSmoothingGroup,
  MeshBrushDomain,
  MeshBrushMode,
  MeshTerrainState,
  ModelNode,
  SceneHook,
  ScenePathDefinition,
  SceneSettings,
  CutterVolume,
  TerrainCutterSurfaceProfile,
  TerrainMaterialChannel,
  TerrainModifier,
  TerrainNode,
  TerrainPaintChannelId,
  TerrainPaintMode,
  Transform,
  Vec3,
  SkateparkElementType
} from "@blud/shared";
import { Euler, Quaternion, Vector3 } from "three";
import {
  createDefaultEntity,
  createDefaultLightData,
  createLightNodeLabel,
  createPrimitiveNodeData,
  createPrimitiveNodeLabel
} from "@/lib/authoring";
import { createSceneHook, HOOK_DEFINITION_MAP, HOOK_DEFINITIONS, resolveGameplayEvents, setGameplayValue } from "@/lib/gameplay";
import {
  createBehaviorTreeNode,
  deleteBehaviorTree,
  layoutBehaviorTree,
  listBehaviorTrees,
  loadBehaviorTree,
  makeDefaultBehaviorTree,
  saveBehaviorTree,
  slugifyBehaviorTreeId,
  type BehaviorTree,
  type BtNodeData,
  type BtNodeType
} from "@/lib/behavior-tree-storage";
import type { ArticraftMaterializeRequest, ArticraftMaterializeResponse } from "@/lib/articraft-contract";
import { materializeArticraftAsset } from "@/lib/articraft-client";
import { bundledCopilotSkills } from "@/generated/copilot-skills-manifest";
import type { CopilotToolCall, CopilotToolResult } from "./types";
import {
  listCopilotSkillReferences,
  readCopilotSkillReference,
  searchCopilotSkillReferences
} from "./skill-service";

type Args = Record<string, unknown>;

export type CopilotToolExecutionContext = {
  captureViewportScreenshot?: () => Promise<{
    dataUrl: string;
    height: number;
    mimeType: string;
    width: number;
  }>;
  requestScenePush?: (options: {
    forceSwitch?: boolean;
    gameId?: string;
    projectName?: string;
    projectSlug?: string;
  }) => void;
  copilotListSkillReferences?: (skillId?: string) => Record<string, unknown>;
  copilotReadSkillReference?: (skillId: string, referenceId: string, options?: { endLine?: number; maxChars?: number; startLine?: number }) => Record<string, unknown>;
  copilotSearchSkillReferences?: (query: string, options?: { maxResults?: number; referenceIds?: string[]; skillId?: string }) => Record<string, unknown>;
  morphusCreateFile?: (path: string, content: string) => Record<string, unknown>;
  morphusListFiles?: () => Record<string, unknown>;
  morphusReadFile?: (path: string, options?: { endLine?: number; maxChars?: number; startLine?: number }) => Record<string, unknown>;
  morphusSearchFiles?: (query: string, options?: { includeAssets?: boolean; maxResults?: number; pathGlob?: string; useRegex?: boolean }) => Record<string, unknown>;
  morphusRequestDeleteFile?: (path: string, reason: string) => Record<string, unknown>;
  morphusRequestRenameFile?: (fromPath: string, toPath: string, reason: string) => Record<string, unknown>;
  morphusWriteFile?: (path: string, content: string) => Record<string, unknown>;
  onGeneratedGame?: (title: string, html: string, files?: Array<{ content: string; path: string }>) => void;
  /**
   * Called after a terrain tool has committed a change to a mesh terrain node.
   *
   * The document edit itself is undoable and complete without this; the hook
   * exists because the mesh terrain surface is a compiled artifact, and a host
   * that caches compiled sections needs to know which node's stack moved.
   * Optional: terrain tools work without it, they just may not repaint until
   * the viewport notices the document revision on its own.
   */
  onTerrainStateChanged?: (nodeId: string) => void;
};

function num(args: Args, key: string, fallback = 0): number {
  const v = args[key];
  return typeof v === "number" ? v : fallback;
}

function str(args: Args, key: string, fallback = ""): string {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
}

function optionalStr(args: Args, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function optionalNum(args: Args, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" ? v : undefined;
}

function strArray(args: Args, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function bool(args: Args, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === "boolean" ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordArray(args: Args, key: string): Record<string, unknown>[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : [];
}

function fileBundle(value: unknown): Array<{ content: string; path: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const path = typeof entry.path === "string" ? entry.path.trim() : "";
    const content = typeof entry.content === "string" ? entry.content : "";
    return path && content ? [{ content, path }] : [];
  });
}

const MODELING_GROUP_COLORS = ["#f59e0b", "#10b981", "#38bdf8", "#f472b6", "#a78bfa", "#fb7185"];
const BAKE_MAP_KINDS: MeshBakeMapKind[] = ["normals", "ao", "curvature", "id-mask", "vertex-colors"];
const ARTICULATED_ASSET_SCHEMA_VERSION = 1;
const ARTICULATED_METADATA = {
  asset: "articraft.asset",
  baseTransform: "articraft.baseTransform",
  joint: "articraft.joint",
  joints: "articraft.joints",
  part: "articraft.part",
  partId: "articraft.partId",
  parts: "articraft.parts",
  pose: "articraft.pose",
  rootId: "articraft.assetRootId",
  schemaVersion: "articraft.schemaVersion",
  source: "articraft.source"
} as const;

type ArticulatedJointType = "ball" | "continuous" | "fixed" | "prismatic" | "revolute";

type ArticulatedPartRecord = {
  id: string;
  materialId: string;
  mass?: number;
  name: string;
  nodeId: string;
  parentPartId?: string;
  semanticRole?: string;
  shape: PrimitiveShape;
  size: Vec3;
};

type ArticulatedJointRecord = {
  axis: Vec3;
  childNodeId?: string;
  childPartId: string;
  defaultValue?: number;
  effort?: number;
  id: string;
  lower?: number;
  mimicJointId?: string;
  mimicMultiplier?: number;
  mimicOffset?: number;
  name: string;
  origin: Vec3;
  parentPartId: string;
  type: ArticulatedJointType;
  upper?: number;
  velocity?: number;
};

type ArticulatedBuildResult = {
  assets?: Asset[];
  jointRecords: ArticulatedJointRecord[];
  materials: Material[];
  nodes: GeometryNode[];
  partRecords: ArticulatedPartRecord[];
  rootId: string;
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function modifierTypeFromArgs(args: Args): MeshModelingModifier["type"] {
  const type = str(args, "type", "solidify");
  return ["boolean", "mirror", "solidify", "lattice", "remesh", "retopo"].includes(type)
    ? type as MeshModelingModifier["type"]
    : "solidify";
}

function createCopilotModelingModifier(args: Args, index: number): MeshModelingModifier {
  const type = modifierTypeFromArgs(args);
  const id = str(args, "id") || `modifier:${type}:${Date.now()}:${index}`;
  const enabled = bool(args, "enabled") ?? true;
  const label = str(args, "label") || type.charAt(0).toUpperCase() + type.slice(1);

  switch (type) {
    case "boolean":
      return {
        enabled,
        id,
        label,
        mode: (str(args, "mode", "live") === "apply" ? "apply" : "live"),
        operation: (str(args, "operation", "union") || "union") as "difference" | "intersect" | "union",
        targetNodeId: str(args, "targetNodeId") || undefined,
        type
      };
    case "mirror":
      return {
        axis: (str(args, "axis", "x") || "x") as "x" | "y" | "z",
        enabled,
        id,
        label,
        type,
        weld: bool(args, "weld") ?? true
      };
    case "solidify":
      return {
        enabled,
        id,
        label,
        thickness: num(args, "thickness", 0.2),
        type
      };
    case "lattice":
      return {
        axis: (str(args, "axis", "y") || "y") as "x" | "y" | "z",
        enabled,
        falloff: num(args, "falloff", 1),
        id,
        intensity: num(args, "intensity", 0.35),
        label,
        mode: (str(args, "mode", "bend") || "bend") as "bend" | "shear" | "taper" | "twist",
        type
      };
    case "remesh":
      return {
        enabled,
        id,
        label,
        mode: (str(args, "mode", "cleanup") || "cleanup") as "cleanup" | "quad" | "voxel",
        resolution: num(args, "resolution", 32),
        smoothing: num(args, "smoothing", 0.4),
        type,
        weldDistance: num(args, "weldDistance", 0.01)
      };
    case "retopo":
      return {
        enabled,
        id,
        label,
        preserveBorders: bool(args, "preserveBorders") ?? true,
        targetFaceCount: Math.max(1, Math.round(num(args, "targetFaceCount", 128))),
        type
      };
  }
}

function patchCopilotModelingModifier(modifier: MeshModelingModifier, args: Args): MeshModelingModifier {
  const enabled = bool(args, "enabled");
  const label = optionalStr(args, "label");
  const base = {
    ...modifier,
    ...(enabled === undefined ? {} : { enabled }),
    ...(label ? { label } : {})
  };

  switch (base.type) {
    case "boolean":
      return {
        ...base,
        ...(optionalStr(args, "mode") ? { mode: str(args, "mode") as "apply" | "live" } : {}),
        ...(optionalStr(args, "operation") ? { operation: str(args, "operation") as "difference" | "intersect" | "union" } : {}),
        ...(optionalStr(args, "targetNodeId") ? { targetNodeId: str(args, "targetNodeId") } : {})
      };
    case "mirror":
      return {
        ...base,
        ...(optionalStr(args, "axis") ? { axis: str(args, "axis") as "x" | "y" | "z" } : {}),
        ...(bool(args, "weld") === undefined ? {} : { weld: bool(args, "weld")! })
      };
    case "solidify":
      return {
        ...base,
        ...(optionalNum(args, "thickness") === undefined ? {} : { thickness: num(args, "thickness", base.thickness) })
      };
    case "lattice":
      return {
        ...base,
        ...(optionalStr(args, "axis") ? { axis: str(args, "axis") as "x" | "y" | "z" } : {}),
        ...(optionalNum(args, "falloff") === undefined ? {} : { falloff: num(args, "falloff", base.falloff) }),
        ...(optionalNum(args, "intensity") === undefined ? {} : { intensity: num(args, "intensity", base.intensity) }),
        ...(optionalStr(args, "mode") ? { mode: str(args, "mode") as "bend" | "shear" | "taper" | "twist" } : {})
      };
    case "remesh":
      return {
        ...base,
        ...(optionalStr(args, "mode") ? { mode: str(args, "mode") as "cleanup" | "quad" | "voxel" } : {}),
        ...(optionalNum(args, "resolution") === undefined ? {} : { resolution: num(args, "resolution", base.resolution) }),
        ...(optionalNum(args, "smoothing") === undefined ? {} : { smoothing: num(args, "smoothing", base.smoothing) }),
        ...(optionalNum(args, "weldDistance") === undefined ? {} : { weldDistance: num(args, "weldDistance", base.weldDistance) })
      };
    case "retopo":
      return {
        ...base,
        ...(bool(args, "preserveBorders") === undefined ? {} : { preserveBorders: bool(args, "preserveBorders")! }),
        ...(optionalNum(args, "targetFaceCount") === undefined
          ? {}
          : { targetFaceCount: Math.max(1, Math.round(num(args, "targetFaceCount", base.targetFaceCount))) })
      };
  }
}

function gameplayObject(value: unknown): GameplayObject | undefined {
  return isRecord(value) ? value as GameplayObject : undefined;
}

function mergeGameplayObject(base: GameplayObject, patch: unknown): GameplayObject {
  if (!isRecord(patch)) {
    return structuredClone(base);
  }

  const next: GameplayObject = structuredClone(base);

  Object.entries(patch).forEach(([key, value]) => {
    const current = next[key];

    next[key] =
      isRecord(current) && isRecord(value)
        ? mergeGameplayObject(current as GameplayObject, value)
        : structuredClone(value) as GameplayValue;
  });

  return next;
}

function pointFromUnknown(value: unknown): Vec3 | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value;

    if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
      return { x, y, z };
    }
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value.position)) {
    const { x, y, z } = value.position;

    if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
      return { x, y, z };
    }
  }

  const { x, y, z } = value;

  if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
    return { x, y, z };
  }

  return undefined;
}

function pointArray(value: unknown): Vec3[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const point = pointFromUnknown(entry);
    return point ? [point] : [];
  });
}

function edgeArray(args: Args, key: string): Array<[string, string]> {
  const value = args[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string"
      ? [[entry[0], entry[1]] as [string, string]]
      : []
  );
}

function colorFromArgs(args: Args): ColorRGBA {
  const hex = str(args, "color", "#ffffff");

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const value = Number.parseInt(hex.slice(1), 16);
    return {
      a: clamp01(num(args, "alpha", 1)),
      b: ((value >> 0) & 255) / 255,
      g: ((value >> 8) & 255) / 255,
      r: ((value >> 16) & 255) / 255
    };
  }

  return {
    a: clamp01(num(args, "alpha", 1)),
    b: clamp01(num(args, "b", 1)),
    g: clamp01(num(args, "g", 1)),
    r: clamp01(num(args, "r", 1))
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function slugifyId(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function numFromRecord(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strFromRecord(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function boolFromRecord(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function vec3FromRecord(record: Record<string, unknown>, prefix = "", fallback = vec3(0, 0, 0)): Vec3 {
  const xKey = prefix ? `${prefix}X` : "x";
  const yKey = prefix ? `${prefix}Y` : "y";
  const zKey = prefix ? `${prefix}Z` : "z";

  return vec3(
    numFromRecord(record, xKey, fallback.x),
    numFromRecord(record, yKey, fallback.y),
    numFromRecord(record, zKey, fallback.z)
  );
}

function normalizeAxis(axis: Vec3, fallback = vec3(0, 1, 0)): Vec3 {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (!Number.isFinite(length) || length < 0.0001) {
    return fallback;
  }

  return vec3(axis.x / length, axis.y / length, axis.z / length);
}

function uniqueSceneNodeId(scene: SceneDocument, base: string, reserved: Set<string>) {
  const safeBase = base.replace(/[^a-zA-Z0-9:._-]+/g, "-") || "node:generated";
  let candidate = safeBase;
  let attempt = 1;

  while (scene.getNode(candidate) || reserved.has(candidate)) {
    candidate = `${safeBase}:copy:${attempt++}`;
  }

  reserved.add(candidate);
  return candidate;
}

function normalizePrimitiveShape(value: string): PrimitiveShape {
  if (value === "box") {
    return "cube";
  }

  return ["cube", "sphere", "cylinder", "cone"].includes(value)
    ? value as PrimitiveShape
    : "cube";
}

function createArticulatedMaterial(assetSlug: string, partSlug: string, part: Record<string, unknown>, fallbackColor: string): Material {
  const explicitColor = strFromRecord(part, "color");
  return {
    id: `material:articraft:${assetSlug}:${partSlug}`,
    name: strFromRecord(part, "materialName", strFromRecord(part, "name", partSlug)),
    category: "custom",
    color: /^#[0-9a-f]{6}$/i.test(explicitColor) ? explicitColor : fallbackColor,
    metalness: clamp01(numFromRecord(part, "metalness", 0.05)),
    roughness: clamp01(numFromRecord(part, "roughness", 0.72))
  };
}

function jsonMetadata(value: unknown) {
  return JSON.stringify(value);
}

function parseMetadataJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isArticulatedAssetNode(node: GeometryNode | undefined): node is GroupNode {
  return Boolean(node && node.kind === "group" && node.metadata?.[ARTICULATED_METADATA.asset] === true);
}

function axisQuaternion(axis: Vec3, value: number) {
  return new Quaternion().setFromAxisAngle(new Vector3(axis.x, axis.y, axis.z).normalize(), value);
}

function eulerVecFromQuaternion(quaternion: Quaternion): Vec3 {
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return vec3(euler.x, euler.y, euler.z);
}

function rotationWithAxisOffset(base: Vec3, axis: Vec3, value: number): Vec3 {
  const baseQuaternion = new Quaternion().setFromEuler(new Euler(base.x, base.y, base.z, "XYZ"));
  return eulerVecFromQuaternion(baseQuaternion.multiply(axisQuaternion(axis, value)));
}

function createArticulatedAssetCommand(scene: SceneDocument, build: ArticulatedBuildResult): Command {
  const assetSnapshots = (build.assets ?? []).map((asset) => ({
    before: scene.assets.get(asset.id) ? structuredClone(scene.assets.get(asset.id)!) : undefined,
    next: structuredClone(asset)
  }));
  const materialSnapshots = build.materials.map((material) => ({
    before: scene.materials.get(material.id) ? structuredClone(scene.materials.get(material.id)!) : undefined,
    next: structuredClone(material)
  }));
  const nodes = build.nodes.map((node) => structuredClone(node));

  return {
    label: "create articulated asset",
    execute(nextScene) {
      assetSnapshots.forEach(({ next }) => nextScene.setAsset(structuredClone(next)));
      materialSnapshots.forEach(({ next }) => nextScene.setMaterial(structuredClone(next)));
      nodes.forEach((node) => nextScene.addNode(structuredClone(node)));
    },
    undo(nextScene) {
      nodes.slice().reverse().forEach((node) => {
        nextScene.removeNode(node.id);
      });
      assetSnapshots.forEach(({ before, next }) => {
        if (before) {
          nextScene.setAsset(structuredClone(before));
          return;
        }

        nextScene.assets.delete(next.id);
        nextScene.touch();
      });
      materialSnapshots.forEach(({ before, next }) => {
        if (before) {
          nextScene.setMaterial(structuredClone(before));
          return;
        }

        nextScene.removeMaterial(next.id);
      });
    }
  };
}

function buildArticulatedAsset(scene: SceneDocument, args: Args): ArticulatedBuildResult | string {
  const partInputs = recordArray(args, "parts");
  const jointInputs = recordArray(args, "joints");

  if (partInputs.length === 0) {
    return "At least one articulated part is required.";
  }

  const name = str(args, "name", "Articulated Asset");
  const assetSlug = slugifyId(name, "asset");
  const rootIdReserved = new Set<string>();
  const rootId = uniqueSceneNodeId(scene, `node:articulated:${assetSlug}`, rootIdReserved);
  const showJointGuides = bool(args, "showJointGuides") ?? true;
  const materialPalette = ["#d7c27a", "#69d6c2", "#8aa2bd", "#d86f5d", "#a98de8", "#f1f5f9"];
  const materialsById = new Map<string, Material>();
  const partNodeIds = new Map<string, string>();
  const partRecords: ArticulatedPartRecord[] = [];
  const nodeIds = new Set<string>(rootIdReserved);

  const normalizedJoints: ArticulatedJointRecord[] = jointInputs.map((joint, index) => {
    const id = slugifyId(strFromRecord(joint, "id", strFromRecord(joint, "name", `joint-${index + 1}`)), `joint-${index + 1}`);
    const typeInput = strFromRecord(joint, "type", "fixed");
    const type: ArticulatedJointType = ["fixed", "revolute", "continuous", "prismatic", "ball"].includes(typeInput)
      ? typeInput as ArticulatedJointType
      : "fixed";

    return {
      axis: normalizeAxis(vec3FromRecord(joint, "axis", vec3(0, 1, 0))),
      childPartId: slugifyId(strFromRecord(joint, "childPartId"), `child-${index + 1}`),
      defaultValue: typeof joint.defaultValue === "number" ? joint.defaultValue : undefined,
      effort: typeof joint.effort === "number" ? joint.effort : undefined,
      id,
      lower: typeof joint.lower === "number" ? joint.lower : undefined,
      mimicJointId: strFromRecord(joint, "mimicJointId") || undefined,
      mimicMultiplier: typeof joint.mimicMultiplier === "number" ? joint.mimicMultiplier : undefined,
      mimicOffset: typeof joint.mimicOffset === "number" ? joint.mimicOffset : undefined,
      name: strFromRecord(joint, "name", id),
      origin: vec3FromRecord(joint, "origin", vec3(0, 0, 0)),
      parentPartId: slugifyId(strFromRecord(joint, "parentPartId"), "root"),
      type,
      upper: typeof joint.upper === "number" ? joint.upper : undefined,
      velocity: typeof joint.velocity === "number" ? joint.velocity : undefined
    };
  });

  const parentByChildPartId = new Map(normalizedJoints.map((joint) => [joint.childPartId, joint.parentPartId]));

  const nodes: GeometryNode[] = [];
  const rootTransform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
  const rootNode: GroupNode = {
    data: {},
    id: rootId,
    kind: "group",
    metadata: {
      [ARTICULATED_METADATA.asset]: true,
      [ARTICULATED_METADATA.schemaVersion]: ARTICULATED_ASSET_SCHEMA_VERSION,
      [ARTICULATED_METADATA.source]: "dream-studio-copilot"
    },
    name,
    tags: ["articulated-asset", "articraft"],
    transform: rootTransform
  };
  nodes.push(rootNode);

  partInputs.forEach((part, index) => {
    const partId = slugifyId(strFromRecord(part, "id", strFromRecord(part, "name", `part-${index + 1}`)), `part-${index + 1}`);
    const partSlug = slugifyId(partId, `part-${index + 1}`);
    const shape = normalizePrimitiveShape(strFromRecord(part, "shape", "cube"));
    const materialId = strFromRecord(part, "materialId") || `material:articraft:${assetSlug}:${partSlug}`;

    if (!strFromRecord(part, "materialId") && !scene.materials.get(materialId)) {
      materialsById.set(materialId, createArticulatedMaterial(assetSlug, partSlug, part, materialPalette[index % materialPalette.length]!));
    }

    const data = createPrimitiveNodeData("prop", shape, vec3(
      Math.max(0.01, numFromRecord(part, "sizeX", 1)),
      Math.max(0.01, numFromRecord(part, "sizeY", 1)),
      Math.max(0.01, numFromRecord(part, "sizeZ", 1))
    ));
    data.materialId = materialId;
    if (typeof part.mass === "number" && data.physics) {
      data.physics.mass = part.mass;
    }

    const transform = makeTransform(vec3FromRecord(part, "", vec3(0, 0, 0)));
    transform.rotation = vec3FromRecord(part, "rotation", vec3(0, 0, 0));
    if (["pivotX", "pivotY", "pivotZ"].some((key) => typeof part[key] === "number")) {
      transform.pivot = vec3FromRecord(part, "pivot", vec3(0, 0, 0));
    }

    const requestedParentPartId = slugifyId(strFromRecord(part, "parentPartId"), "");
    const parentPartId = requestedParentPartId && requestedParentPartId !== "root"
      ? requestedParentPartId
      : parentByChildPartId.get(partId);
    const nodeId = uniqueSceneNodeId(scene, `node:articulated:${assetSlug}:part:${partSlug}`, nodeIds);
    partNodeIds.set(partId, nodeId);
    const parentNodeId = parentPartId ? partNodeIds.get(parentPartId) : undefined;
    const partRecord: ArticulatedPartRecord = {
      id: partId,
      materialId,
      mass: typeof part.mass === "number" ? part.mass : undefined,
      name: strFromRecord(part, "name", partId),
      nodeId,
      parentPartId,
      semanticRole: strFromRecord(part, "semanticRole") || undefined,
      shape,
      size: structuredClone(data.size)
    };
    partRecords.push(partRecord);

    const node: PrimitiveNode = {
      data,
      id: nodeId,
      kind: "primitive",
      metadata: {
        [ARTICULATED_METADATA.baseTransform]: jsonMetadata(transform),
        [ARTICULATED_METADATA.part]: true,
        [ARTICULATED_METADATA.partId]: partId,
        [ARTICULATED_METADATA.rootId]: rootId,
        "articraft.semanticRole": partRecord.semanticRole ?? "",
        "articraft.mass": partRecord.mass ?? 0
      },
      name: partRecord.name,
      parentId: parentNodeId ?? rootId,
      tags: ["articulated-part", `part:${partId}`],
      transform
    };

    nodes.push(node);
  });

  partRecords.forEach((partRecord) => {
    const node = nodes.find((candidate) => candidate.id === partRecord.nodeId);
    if (!node) {
      return;
    }

    node.parentId = partRecord.parentPartId
      ? partNodeIds.get(partRecord.parentPartId) ?? rootId
      : rootId;
  });

  normalizedJoints.forEach((joint) => {
    joint.childNodeId = partNodeIds.get(joint.childPartId);
  });

  if (showJointGuides && normalizedJoints.length > 0) {
    const guideMaterials: Material[] = [
      {
        id: "material:articraft:joint-pivot",
        name: "Articraft Joint Pivot",
        category: "custom",
        color: "#3ee6d1",
        emissiveColor: "#1ecfc1",
        emissiveIntensity: 0.35,
        metalness: 0.1,
        roughness: 0.35
      },
      {
        id: "material:articraft:joint-axis",
        name: "Articraft Joint Axis",
        category: "custom",
        color: "#d9bd73",
        emissiveColor: "#d9bd73",
        emissiveIntensity: 0.25,
        metalness: 0.2,
        roughness: 0.42
      }
    ];
    guideMaterials.forEach((material) => {
      if (!scene.materials.get(material.id)) {
        materialsById.set(material.id, material);
      }
    });

    normalizedJoints.forEach((joint) => {
      const parentNodeId = partNodeIds.get(joint.parentPartId) ?? rootId;
      const pivotTransform = makeTransform(structuredClone(joint.origin));
      const pivotData = createPrimitiveNodeData("prop", "sphere", vec3(0.16, 0.16, 0.16));
      pivotData.materialId = "material:articraft:joint-pivot";
      if (pivotData.physics) {
        pivotData.physics.enabled = false;
      }
      const pivotNode: PrimitiveNode = {
        data: pivotData,
        id: uniqueSceneNodeId(scene, `node:articulated:${assetSlug}:joint:${joint.id}:pivot`, nodeIds),
        kind: "primitive",
        metadata: {
          [ARTICULATED_METADATA.joint]: joint.id,
          [ARTICULATED_METADATA.rootId]: rootId,
          "articraft.guide": "pivot"
        },
        name: `${joint.name} Pivot`,
        parentId: parentNodeId,
        tags: ["articulated-guide", "joint-pivot"],
        transform: pivotTransform
      };
      nodes.push(pivotNode);

      if (joint.type === "fixed" || joint.type === "ball") {
        return;
      }

      const axis = normalizeAxis(joint.axis);
      const axisTransform = makeTransform(vec3(
        joint.origin.x + axis.x * 0.32,
        joint.origin.y + axis.y * 0.32,
        joint.origin.z + axis.z * 0.32
      ));
      const axisQuaternionValue = new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(axis.x, axis.y, axis.z).normalize()
      );
      axisTransform.rotation = eulerVecFromQuaternion(axisQuaternionValue);
      const axisData = createPrimitiveNodeData("prop", "cylinder", vec3(0.05, 0.64, 0.05));
      axisData.materialId = "material:articraft:joint-axis";
      if (axisData.physics) {
        axisData.physics.enabled = false;
      }
      const axisNode: PrimitiveNode = {
        data: axisData,
        id: uniqueSceneNodeId(scene, `node:articulated:${assetSlug}:joint:${joint.id}:axis`, nodeIds),
        kind: "primitive",
        metadata: {
          [ARTICULATED_METADATA.joint]: joint.id,
          [ARTICULATED_METADATA.rootId]: rootId,
          "articraft.guide": "axis"
        },
        name: `${joint.name} Axis`,
        parentId: parentNodeId,
        tags: ["articulated-guide", "joint-axis"],
        transform: axisTransform
      };
      nodes.push(axisNode);
    });
  }

  rootNode.metadata = {
    ...rootNode.metadata,
    [ARTICULATED_METADATA.parts]: jsonMetadata(partRecords),
    [ARTICULATED_METADATA.joints]: jsonMetadata(normalizedJoints),
    [ARTICULATED_METADATA.pose]: jsonMetadata({})
  };

  return {
    jointRecords: normalizedJoints,
    materials: Array.from(materialsById.values()),
    nodes,
    partRecords,
    rootId
  };
}

function buildArticraftMaterializeRequest(args: Args): ArticraftMaterializeRequest | string {
  const partInputs = recordArray(args, "parts");
  const jointInputs = recordArray(args, "joints");

  if (partInputs.length === 0) {
    return "At least one articulated part is required.";
  }

  return {
    joints: jointInputs.map((joint, index) => ({
      axisX: numFromRecord(joint, "axisX", 0),
      axisY: numFromRecord(joint, "axisY", 1),
      axisZ: numFromRecord(joint, "axisZ", 0),
      childPartId: strFromRecord(joint, "childPartId", `child-${index + 1}`),
      defaultValue: typeof joint.defaultValue === "number" ? joint.defaultValue : undefined,
      effort: typeof joint.effort === "number" ? joint.effort : undefined,
      id: strFromRecord(joint, "id", strFromRecord(joint, "name", `joint-${index + 1}`)),
      lower: typeof joint.lower === "number" ? joint.lower : undefined,
      mimicJointId: strFromRecord(joint, "mimicJointId") || undefined,
      mimicMultiplier: typeof joint.mimicMultiplier === "number" ? joint.mimicMultiplier : undefined,
      mimicOffset: typeof joint.mimicOffset === "number" ? joint.mimicOffset : undefined,
      name: strFromRecord(joint, "name") || undefined,
      originX: numFromRecord(joint, "originX", 0),
      originY: numFromRecord(joint, "originY", 0),
      originZ: numFromRecord(joint, "originZ", 0),
      parentPartId: strFromRecord(joint, "parentPartId", "root"),
      type: strFromRecord(joint, "type", "fixed"),
      upper: typeof joint.upper === "number" ? joint.upper : undefined,
      velocity: typeof joint.velocity === "number" ? joint.velocity : undefined
    })),
    name: str(args, "name", "Articulated Asset"),
    parts: partInputs.map((part, index) => ({
      color: strFromRecord(part, "color") || undefined,
      id: strFromRecord(part, "id", strFromRecord(part, "name", `part-${index + 1}`)),
      mass: typeof part.mass === "number" ? part.mass : undefined,
      materialId: strFromRecord(part, "materialId") || undefined,
      materialName: strFromRecord(part, "materialName") || strFromRecord(part, "name") || undefined,
      metalness: typeof part.metalness === "number" ? part.metalness : undefined,
      name: strFromRecord(part, "name", `Part ${index + 1}`),
      parentPartId: strFromRecord(part, "parentPartId") || undefined,
      pivotX: typeof part.pivotX === "number" ? part.pivotX : undefined,
      pivotY: typeof part.pivotY === "number" ? part.pivotY : undefined,
      pivotZ: typeof part.pivotZ === "number" ? part.pivotZ : undefined,
      rotationX: typeof part.rotationX === "number" ? part.rotationX : undefined,
      rotationY: typeof part.rotationY === "number" ? part.rotationY : undefined,
      rotationZ: typeof part.rotationZ === "number" ? part.rotationZ : undefined,
      roughness: typeof part.roughness === "number" ? part.roughness : undefined,
      semanticRole: strFromRecord(part, "semanticRole") || undefined,
      shape: strFromRecord(part, "shape", "cube"),
      sizeX: Math.max(0.01, numFromRecord(part, "sizeX", 1)),
      sizeY: Math.max(0.01, numFromRecord(part, "sizeY", 1)),
      sizeZ: Math.max(0.01, numFromRecord(part, "sizeZ", 1)),
      x: numFromRecord(part, "x", 0),
      y: numFromRecord(part, "y", 0),
      z: numFromRecord(part, "z", 0)
    })),
    prompt: str(args, "prompt") || undefined,
    showJointGuides: bool(args, "showJointGuides") ?? true,
    x: num(args, "x"),
    y: num(args, "y"),
    z: num(args, "z")
  };
}

function buildArticraftEngineAsset(
  scene: SceneDocument,
  args: Args,
  materialized: ArticraftMaterializeResponse
): ArticulatedBuildResult | string {
  const partInputs = recordArray(args, "parts");
  const jointInputs = recordArray(args, "joints");

  if (partInputs.length === 0) {
    return "At least one articulated part is required.";
  }

  const name = str(args, "name", "Articulated Asset");
  const assetSlug = slugifyId(name, "asset");
  const rootIdReserved = new Set<string>();
  const rootId = uniqueSceneNodeId(scene, `node:articraft:${assetSlug}`, rootIdReserved);
  const showJointGuides = bool(args, "showJointGuides") ?? true;
  const partNodeIds = new Map<string, string>();
  const materializedParts = new Map(materialized.parts.map((part) => [slugifyId(part.id, part.id), part]));
  const partRecords: ArticulatedPartRecord[] = [];
  const assets: Asset[] = [];
  const materialsById = new Map<string, Material>();
  const nodeIds = new Set<string>(rootIdReserved);
  const normalizedJoints: ArticulatedJointRecord[] = jointInputs.map((joint, index) => {
    const id = slugifyId(strFromRecord(joint, "id", strFromRecord(joint, "name", `joint-${index + 1}`)), `joint-${index + 1}`);
    const typeInput = strFromRecord(joint, "type", "fixed");
    const type: ArticulatedJointType = ["fixed", "revolute", "continuous", "prismatic", "ball"].includes(typeInput)
      ? typeInput as ArticulatedJointType
      : "fixed";

    return {
      axis: normalizeAxis(vec3FromRecord(joint, "axis", vec3(0, 1, 0))),
      childPartId: slugifyId(strFromRecord(joint, "childPartId"), `child-${index + 1}`),
      defaultValue: typeof joint.defaultValue === "number" ? joint.defaultValue : undefined,
      effort: typeof joint.effort === "number" ? joint.effort : undefined,
      id,
      lower: typeof joint.lower === "number" ? joint.lower : undefined,
      mimicJointId: strFromRecord(joint, "mimicJointId") || undefined,
      mimicMultiplier: typeof joint.mimicMultiplier === "number" ? joint.mimicMultiplier : undefined,
      mimicOffset: typeof joint.mimicOffset === "number" ? joint.mimicOffset : undefined,
      name: strFromRecord(joint, "name", id),
      origin: vec3FromRecord(joint, "origin", vec3(0, 0, 0)),
      parentPartId: slugifyId(strFromRecord(joint, "parentPartId"), "root"),
      type,
      upper: typeof joint.upper === "number" ? joint.upper : undefined,
      velocity: typeof joint.velocity === "number" ? joint.velocity : undefined
    };
  });
  const parentByChildPartId = new Map(normalizedJoints.map((joint) => [joint.childPartId, joint.parentPartId]));
  const nodes: GeometryNode[] = [];
  const rootNode: GroupNode = {
    data: {},
    id: rootId,
    kind: "group",
    metadata: {
      [ARTICULATED_METADATA.asset]: true,
      [ARTICULATED_METADATA.schemaVersion]: ARTICULATED_ASSET_SCHEMA_VERSION,
      [ARTICULATED_METADATA.source]: "articraft-engine",
      "articraft.engine": "sdk-compiler",
      "articraft.modelPath": materialized.modelPath,
      "articraft.rootDir": materialized.rootDir,
      "articraft.urdf": materialized.urdfXml,
      "articraft.urdfPath": materialized.urdfPath
    },
    name,
    tags: ["articulated-asset", "articraft", "articraft-engine"],
    transform: makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")))
  };
  nodes.push(rootNode);

  partInputs.forEach((part, index) => {
    const partId = slugifyId(strFromRecord(part, "id", strFromRecord(part, "name", `part-${index + 1}`)), `part-${index + 1}`);
    const partSlug = slugifyId(partId, `part-${index + 1}`);
    const shape = normalizePrimitiveShape(strFromRecord(part, "shape", "cube"));
    const size = vec3(
      Math.max(0.01, numFromRecord(part, "sizeX", 1)),
      Math.max(0.01, numFromRecord(part, "sizeY", 1)),
      Math.max(0.01, numFromRecord(part, "sizeZ", 1))
    );
    const materializedPart = materializedParts.get(partId);
    const assetId = `asset:model:articraft:${assetSlug}:${partSlug}:${crypto.randomUUID()}`;
    const previewColor = strFromRecord(part, "color") || ["#d7c27a", "#69d6c2", "#8aa2bd", "#d86f5d", "#a98de8", "#f1f5f9"][index % 6]!;
    const asset: Asset | undefined = materializedPart?.modelDataUrl
      ? {
          id: assetId,
          metadata: {
            materialMtlText: "",
            modelFormat: "obj",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: size.x,
            nativeSizeY: size.y,
            nativeSizeZ: size.z,
            previewColor,
            prompt: str(args, "prompt") || name,
            source: "articraft-engine",
            texturePath: ""
          },
          path: materializedPart.modelDataUrl,
          type: "model"
        }
      : undefined;

    if (asset) {
      assets.push(asset);
    }

    const transform = makeTransform(vec3FromRecord(part, "", vec3(0, 0, 0)));
    transform.rotation = vec3FromRecord(part, "rotation", vec3(0, 0, 0));
    if (asset) {
      transform.rotation = vec3(transform.rotation.x - Math.PI / 2, transform.rotation.y, transform.rotation.z);
    }
    if (["pivotX", "pivotY", "pivotZ"].some((key) => typeof part[key] === "number")) {
      transform.pivot = vec3FromRecord(part, "pivot", vec3(0, 0, 0));
    }

    const requestedParentPartId = slugifyId(strFromRecord(part, "parentPartId"), "");
    const parentPartId = requestedParentPartId && requestedParentPartId !== "root"
      ? requestedParentPartId
      : parentByChildPartId.get(partId);
    const nodeId = uniqueSceneNodeId(scene, `node:articraft:${assetSlug}:part:${partSlug}`, nodeIds);
    partNodeIds.set(partId, nodeId);

    const partRecord: ArticulatedPartRecord = {
      id: partId,
      materialId: asset?.id ?? (strFromRecord(part, "materialId") || `material:articraft:${assetSlug}:${partSlug}`),
      mass: typeof part.mass === "number" ? part.mass : undefined,
      name: strFromRecord(part, "name", partId),
      nodeId,
      parentPartId,
      semanticRole: strFromRecord(part, "semanticRole") || undefined,
      shape,
      size
    };
    partRecords.push(partRecord);

    if (asset) {
      const node: ModelNode = {
        data: {
          assetId: asset.id,
          path: asset.path
        },
        id: nodeId,
        kind: "model",
        metadata: {
          [ARTICULATED_METADATA.baseTransform]: jsonMetadata(transform),
          [ARTICULATED_METADATA.part]: true,
          [ARTICULATED_METADATA.partId]: partId,
          [ARTICULATED_METADATA.rootId]: rootId,
          "articraft.mass": partRecord.mass ?? 0,
          "articraft.meshPath": materializedPart?.meshPath ?? "",
          "articraft.semanticRole": partRecord.semanticRole ?? ""
        },
        name: partRecord.name,
        parentId: parentPartId ? partNodeIds.get(parentPartId) ?? rootId : rootId,
        tags: ["articulated-part", "articraft-mesh", `part:${partId}`],
        transform
      };
      nodes.push(node);
      return;
    }

    const data = createPrimitiveNodeData("prop", shape, structuredClone(size));
    data.materialId = partRecord.materialId;
    if (typeof part.mass === "number" && data.physics) {
      data.physics.mass = part.mass;
    }
    if (!scene.materials.get(partRecord.materialId)) {
      materialsById.set(partRecord.materialId, createArticulatedMaterial(assetSlug, partSlug, part, previewColor));
    }
    const node: PrimitiveNode = {
      data,
      id: nodeId,
      kind: "primitive",
      metadata: {
        [ARTICULATED_METADATA.baseTransform]: jsonMetadata(transform),
        [ARTICULATED_METADATA.part]: true,
        [ARTICULATED_METADATA.partId]: partId,
        [ARTICULATED_METADATA.rootId]: rootId,
        "articraft.mass": partRecord.mass ?? 0,
        "articraft.semanticRole": partRecord.semanticRole ?? ""
      },
      name: partRecord.name,
      parentId: parentPartId ? partNodeIds.get(parentPartId) ?? rootId : rootId,
      tags: ["articulated-part", "articraft-fallback-primitive", `part:${partId}`],
      transform
    };
    nodes.push(node);
  });

  partRecords.forEach((partRecord) => {
    const node = nodes.find((candidate) => candidate.id === partRecord.nodeId);
    if (!node) {
      return;
    }

    node.parentId = partRecord.parentPartId
      ? partNodeIds.get(partRecord.parentPartId) ?? rootId
      : rootId;
  });
  normalizedJoints.forEach((joint) => {
    joint.childNodeId = partNodeIds.get(joint.childPartId);
  });

  if (showJointGuides && normalizedJoints.length > 0) {
    appendArticulatedJointGuides(scene, nodes, materialsById, nodeIds, assetSlug, rootId, partNodeIds, normalizedJoints);
  }

  rootNode.metadata = {
    ...rootNode.metadata,
    [ARTICULATED_METADATA.parts]: jsonMetadata(partRecords),
    [ARTICULATED_METADATA.joints]: jsonMetadata(normalizedJoints),
    [ARTICULATED_METADATA.pose]: jsonMetadata({})
  };

  return {
    assets,
    jointRecords: normalizedJoints,
    materials: Array.from(materialsById.values()),
    nodes,
    partRecords,
    rootId
  };
}

function appendArticulatedJointGuides(
  scene: SceneDocument,
  nodes: GeometryNode[],
  materialsById: Map<string, Material>,
  nodeIds: Set<string>,
  assetSlug: string,
  rootId: string,
  partNodeIds: Map<string, string>,
  normalizedJoints: ArticulatedJointRecord[]
) {
  const guideMaterials: Material[] = [
    {
      id: "material:articraft:joint-pivot",
      name: "Articraft Joint Pivot",
      category: "custom",
      color: "#3ee6d1",
      emissiveColor: "#1ecfc1",
      emissiveIntensity: 0.35,
      metalness: 0.1,
      roughness: 0.35
    },
    {
      id: "material:articraft:joint-axis",
      name: "Articraft Joint Axis",
      category: "custom",
      color: "#d9bd73",
      emissiveColor: "#d9bd73",
      emissiveIntensity: 0.25,
      metalness: 0.2,
      roughness: 0.42
    }
  ];
  guideMaterials.forEach((material) => {
    if (!scene.materials.get(material.id)) {
      materialsById.set(material.id, material);
    }
  });

  normalizedJoints.forEach((joint) => {
    const parentNodeId = partNodeIds.get(joint.parentPartId) ?? rootId;
    const pivotTransform = makeTransform(structuredClone(joint.origin));
    const pivotData = createPrimitiveNodeData("prop", "sphere", vec3(0.16, 0.16, 0.16));
    pivotData.materialId = "material:articraft:joint-pivot";
    if (pivotData.physics) {
      pivotData.physics.enabled = false;
    }
    nodes.push({
      data: pivotData,
      id: uniqueSceneNodeId(scene, `node:articraft:${assetSlug}:joint:${joint.id}:pivot`, nodeIds),
      kind: "primitive",
      metadata: {
        [ARTICULATED_METADATA.joint]: joint.id,
        [ARTICULATED_METADATA.rootId]: rootId,
        "articraft.guide": "pivot"
      },
      name: `${joint.name} Pivot`,
      parentId: parentNodeId,
      tags: ["articulated-guide", "joint-pivot"],
      transform: pivotTransform
    });

    if (joint.type === "fixed" || joint.type === "ball") {
      return;
    }

    const axis = normalizeAxis(joint.axis);
    const axisTransform = makeTransform(vec3(
      joint.origin.x + axis.x * 0.32,
      joint.origin.y + axis.y * 0.32,
      joint.origin.z + axis.z * 0.32
    ));
    const axisQuaternionValue = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      new Vector3(axis.x, axis.y, axis.z).normalize()
    );
    axisTransform.rotation = eulerVecFromQuaternion(axisQuaternionValue);
    const axisData = createPrimitiveNodeData("prop", "cylinder", vec3(0.05, 0.64, 0.05));
    axisData.materialId = "material:articraft:joint-axis";
    if (axisData.physics) {
      axisData.physics.enabled = false;
    }
    nodes.push({
      data: axisData,
      id: uniqueSceneNodeId(scene, `node:articraft:${assetSlug}:joint:${joint.id}:axis`, nodeIds),
      kind: "primitive",
      metadata: {
        [ARTICULATED_METADATA.joint]: joint.id,
        [ARTICULATED_METADATA.rootId]: rootId,
        "articraft.guide": "axis"
      },
      name: `${joint.name} Axis`,
      parentId: parentNodeId,
      tags: ["articulated-guide", "joint-axis"],
      transform: axisTransform
    });
  });
}

function getArticulatedAssetPayload(scene: SceneDocument, assetNodeId: string) {
  const root = scene.getNode(assetNodeId);

  if (!isArticulatedAssetNode(root)) {
    return undefined;
  }

  const parts = parseMetadataJson<ArticulatedPartRecord[]>(root.metadata?.[ARTICULATED_METADATA.parts], []);
  const joints = parseMetadataJson<ArticulatedJointRecord[]>(root.metadata?.[ARTICULATED_METADATA.joints], []);
  const pose = parseMetadataJson<Record<string, number>>(root.metadata?.[ARTICULATED_METADATA.pose], {});

  return { root, parts, joints, pose };
}

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data });
}

function fail(error: string): string {
  return JSON.stringify({ success: false, error });
}

function buildSceneOutline(editor: EditorCore) {
  const scene = editor.scene;
  const graph = resolveSceneGraph(scene.nodes.values(), scene.entities.values());

  const buildEntityOutline = (entityId: string) => {
    const entity = scene.getEntity(entityId);

    if (!entity) {
      return { id: entityId, missing: true };
    }

    return {
      id: entity.id,
      name: entity.name,
      type: entity.type
    };
  };

  const buildNodeOutline = (nodeId: string): Record<string, unknown> => {
    const node = scene.getNode(nodeId);

    if (!node) {
      return { id: nodeId, missing: true };
    }

    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      children: (graph.nodeChildrenByParentId.get(nodeId) ?? []).map(buildNodeOutline),
      entities: (graph.entityChildrenByParentId.get(nodeId) ?? []).map(buildEntityOutline)
    };
  };

  return {
    graph,
    outline: {
      totalNodes: scene.nodes.size,
      totalEntities: scene.entities.size,
      rootNodes: graph.rootNodeIds.map(buildNodeOutline),
      rootEntities: graph.rootEntityIds.map(buildEntityOutline)
    }
  };
}

function buildHookCatalog() {
  return HOOK_DEFINITIONS.map((definition) => ({
    ...definition,
    defaultConfig: structuredClone(HOOK_DEFINITION_MAP.get(definition.type)?.defaultConfig ?? {})
  }));
}

function resolvePathId(paths: ScenePathDefinition[], requestedId: string, requestedName: string) {
  const slugSource = requestedId || requestedName || `path_${paths.length + 1}`;
  const baseId = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `path_${paths.length + 1}`;
  let nextId = baseId;
  let suffix = 2;

  while (paths.some((pathDefinition) => pathDefinition.id === nextId)) {
    nextId = `${baseId}_${suffix++}`;
  }

  return nextId;
}

function updateHooksOnTarget(
  editor: EditorCore,
  targetKind: "entity" | "node",
  targetId: string,
  update: (hooks: SceneHook[]) => { hooks: SceneHook[]; result: Record<string, unknown> }
): string {
  if (targetKind === "node") {
    const node = editor.scene.getNode(targetId);

    if (!node) {
      return fail("Node not found");
    }

    const currentHooks = structuredClone(node.hooks ?? []);
    const { hooks, result } = update(currentHooks);
    editor.execute(createSetNodeCommand(editor.scene, targetId, { ...structuredClone(node), hooks }));
    return ok(result);
  }

  const entity = editor.scene.getEntity(targetId);

  if (!entity) {
    return fail("Entity not found");
  }

  const currentHooks = structuredClone(entity.hooks ?? []);
  const { hooks, result } = update(currentHooks);
  editor.execute(createSetEntityCommand(editor.scene, targetId, { ...structuredClone(entity), hooks }));
  return ok(result);
}

function loadBehaviorTreeOrFail(treeId: string) {
  const tree = loadBehaviorTree(treeId);
  return tree ?? null;
}

function saveBehaviorTreeResult(tree: BehaviorTree, extra: Record<string, unknown> = {}) {
  saveBehaviorTree(tree);
  return ok({
    edgeCount: tree.edges.length,
    nodeCount: tree.nodes.length,
    treeId: tree.id,
    treeName: tree.name,
    ...extra
  });
}

function updateBehaviorTreeNodeData(tree: BehaviorTree, nodeId: string, args: Args) {
  let found = false;

  const nodes = tree.nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    found = true;
    const nextData: BtNodeData = {
      ...node.data
    };

    const label = optionalStr(args, "label");
    const event = optionalStr(args, "event");
    const mode = optionalStr(args, "mode");
    const actionType = optionalStr(args, "actionType");
    const actionTarget = optionalStr(args, "actionTarget");
    const actionValue = optionalStr(args, "actionValue");
    const count = optionalNum(args, "count");
    const positionX = optionalNum(args, "positionX");
    const positionY = optionalNum(args, "positionY");

    if (label !== undefined) nextData.label = label;
    if (event !== undefined) nextData.event = event;
    if (mode === "allOf" || mode === "anyOf") nextData.mode = mode;
    if (actionType !== undefined) nextData.actionType = actionType;
    if (actionTarget !== undefined) nextData.actionTarget = actionTarget;
    if (actionValue !== undefined) nextData.actionValue = actionValue;
    if (count !== undefined) nextData.count = count;

    return {
      ...node,
      data: nextData,
      position: {
        x: positionX ?? node.position.x,
        y: positionY ?? node.position.y
      }
    };
  });

  return found ? { ...tree, nodes } : null;
}

function isForestPreset(value: string): value is ForestPresetId {
  return FOREST_PRESETS.some((preset) => preset.id === value);
}

function findForestField(fieldId: string): ForestField | undefined {
  return forestStore.getSnapshot().fields.find((field) => field.id === fieldId);
}

/**
 * Resolves the field a forest tool acts on, or an error string to return.
 *
 * Omitting the id is allowed only when there is exactly one field, matching how
 * the terrain tools treat a single mesh terrain: convenient in the common case,
 * and explicitly ambiguous rather than silently arbitrary once there are two.
 */
function resolveForestField(fieldId: string | undefined): ForestField | string {
  const fields = forestStore.getSnapshot().fields;
  if (fieldId) {
    const match = fields.find((field) => field.id === fieldId);
    return match ?? fail(`Forest field "${fieldId}" was not found.`);
  }
  if (fields.length === 1) return fields[0]!;
  if (fields.length === 0) return fail("No forest fields exist. Call create_forest_field first.");
  return fail(`The scene has ${fields.length} forest fields; pass fieldId to say which one.`);
}

/** Ground-plane control points from a tool argument. */
function forestPoints(args: Args): Array<{ x: number; z: number }> {
  return recordArray(args, "points")
    .map((record) => ({ x: numFromRecord(record, "x"), z: numFromRecord(record, "z") }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
}

function finiteArg(args: Args, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveProceduralWorldNode(scene: SceneDocument, requestedId?: string): ProceduralWorldNode {
  if (requestedId) {
    const node = scene.getNode(requestedId);
    if (node && isProceduralWorldNode(node)) return node;
    throw new Error(`Procedural world node "${requestedId}" was not found.`);
  }
  const worlds = Array.from(scene.nodes.values()).filter(isProceduralWorldNode);
  if (worlds.length === 1) return worlds[0]!;
  if (worlds.length === 0) throw new Error("No procedural world exists. Create one first.");
  throw new Error("More than one procedural world exists. Provide nodeId explicitly.");
}

function updateProceduralWorld(
  editor: EditorCore,
  requestedId: string | undefined,
  label: string,
  mutate: (data: ProceduralWorldNodeData) => void,
): ProceduralWorldNodeData {
  const node = resolveProceduralWorldNode(editor.scene, requestedId);
  const next = structuredClone(node.data);
  mutate(next);
  const normalized = normalizeProceduralWorldConfig(next);
  const validation = validateProceduralWorldConfig(normalized);
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) throw new Error(errors.map((issue) => `${issue.path}: ${issue.message}`).join(" "));
  const change = classifyProceduralWorldConfigChange(node.data, normalized);
  if (change.changedFields.length === 0) throw new Error("No procedural-world configuration fields changed.");
  editor.execute(updateProceduralWorldNodeCommand(node.id, node.data, normalized, label));
  proceduralUpdateMetadata.set(normalized, {
    affectedSystems: change.affectedSystems,
    changedFields: change.changedFields,
    nodeId: node.id,
    requiredAction: change.action,
    validationWarnings: validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
  });
  return normalized;
}

type ProceduralUpdateMetadata = {
  affectedSystems: string[];
  changedFields: string[];
  nodeId: string;
  requiredAction: string;
  validationWarnings: string[];
};

const proceduralUpdateMetadata = new WeakMap<ProceduralWorldNodeData, ProceduralUpdateMetadata>();

function proceduralWorldToolResult(data: ProceduralWorldNodeData, detail: Record<string, unknown> = {}): Record<string, unknown> {
  const metadata = proceduralUpdateMetadata.get(data);
  if (!metadata) throw new Error("Procedural-world update metadata is unavailable.");
  const runtime = getProceduralWorldRuntimeStatus(metadata.nodeId);
  const runtimeConfirmed = Boolean(runtime && diffProceduralWorldConfig(runtime.authoredConfig, data).length === 0);
  return {
    ...detail,
    affectedSystems: metadata.affectedSystems,
    appliedFields: runtimeConfirmed ? runtime?.bindingResult.appliedFields ?? [] : [],
    changedFields: metadata.changedFields,
    nodeId: metadata.nodeId,
    queued: !runtimeConfirmed,
    regeneratedSystems: runtimeConfirmed ? runtime?.bindingResult.regeneratedSystems ?? [] : [],
    requiredAction: metadata.requiredAction,
    requiresScreenshotVerification: true,
    runtimeConfirmed,
    unsupportedFields: runtimeConfirmed ? runtime?.bindingResult.unsupportedFields ?? [] : [],
    updated: true,
    warnings: [
      ...metadata.validationWarnings,
      ...(runtimeConfirmed ? runtime?.bindingResult.warnings ?? [] : ["The authored command is committed; runtime application is still pending or no WebGPU runtime is active."]),
    ],
  };
}

function applyFiniteArg(args: Args, key: string, apply: (value: number) => void): void {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) apply(value);
}

// --- Mesh terrain -----------------------------------------------------------

const MESH_BRUSH_MODES: MeshBrushMode[] = [
  "raise", "lower", "smooth", "flatten", "clay", "pinch", "scrape", "terrace", "noise"
];

const TERRAIN_PAINT_CHANNELS: TerrainPaintChannelId[] = ["channel0", "channel1", "channel2", "channel3"];

const TERRAIN_CUTTER_SURFACES = ["cave", "arch", "overhang", "canyon", "hoodoo", "default", "none"];

type TerrainPathSample = {
  normal: Vec3;
  point: Vec3;
  weight: number;
};

function resolveMeshTerrainNode(scene: SceneDocument, requestedId?: string): TerrainNode {
  if (requestedId) {
    const node = scene.getNode(requestedId);
    if (node && isMeshTerrainNode(node)) return node;
    throw new Error(`Mesh terrain node "${requestedId}" was not found.`);
  }
  const terrains = Array.from(scene.nodes.values()).filter(isMeshTerrainNode);
  if (terrains.length === 1) return terrains[0]!;
  if (terrains.length === 0) throw new Error("No mesh terrain exists. Call create_mesh_terrain first.");
  throw new Error(`The scene has ${terrains.length} mesh terrain nodes. Provide nodeId explicitly.`);
}

function meshTerrainState(node: TerrainNode): MeshTerrainState {
  const state = node.data.meshTerrain;
  if (!state) throw new Error(`Terrain node "${node.id}" carries no mesh terrain state.`);
  return state;
}

/**
 * Runs `mutate` against a clone of the node's terrain state and commits it.
 *
 * Every terrain tool goes through here so a Copilot edit is one undoable
 * document command, exactly like a hand edit: mutate a clone, then hand the
 * whole node to the command stack rather than editing live scene state.
 */
function updateMeshTerrain(
  editor: EditorCore,
  context: CopilotToolExecutionContext,
  requestedId: string | undefined,
  label: string,
  mutate: (state: MeshTerrainState, node: TerrainNode) => Record<string, unknown>
): string {
  const node = resolveMeshTerrainNode(editor.scene, requestedId);
  const nextNode = structuredClone(node);
  const detail = mutate(meshTerrainState(nextNode), nextNode);
  editor.execute(createSetNodeCommand(editor.scene, node.id, nextNode, node));
  context.onTerrainStateChanged?.(node.id);
  return ok({ label, modifierCount: meshTerrainState(nextNode).modifiers.length, nodeId: node.id, ...detail });
}

/**
 * Appends a modifier to a serialized stack, keeping authored order explicit.
 *
 * `ModifierStack` stamps `sequence` when a live editor gesture adds a modifier;
 * a document-level append has to do the same, or an equal-priority stroke could
 * evaluate before the surface it was drawn against.
 */
function appendTerrainModifier(state: MeshTerrainState, modifier: TerrainModifier): TerrainModifier {
  const highest = state.modifiers.reduce((max, entry) => Math.max(max, entry.sequence ?? 0), 0);
  modifier.sequence = highest + 1;
  state.modifiers.push(modifier);
  return modifier;
}

function terrainNormalFromArgs(entry: Args, prefix: string, fallback: Vec3): Vec3 {
  const keys = [`${prefix}X`, `${prefix}Y`, `${prefix}Z`];
  if (!keys.some((key) => typeof entry[key] === "number")) return fallback;
  const normal = vec3(num(entry, keys[0]!), num(entry, keys[1]!), num(entry, keys[2]!));
  return Math.hypot(normal.x, normal.y, normal.z) > 1e-6 ? normal : fallback;
}

function terrainPathSamples(args: Args, key = "path"): TerrainPathSample[] {
  return recordArray(args, key).map((entry) => ({
    normal: terrainNormalFromArgs(entry, "normal", vec3(0, 1, 0)),
    point: vec3(num(entry, "x"), num(entry, "y"), num(entry, "z")),
    weight: clamp01(optionalNum(entry, "weight") ?? 1)
  }));
}

function terrainPortalNormal(args: Args, prefix: string, from: Vec3, toward: Vec3): Vec3 {
  const outward = vec3(from.x - toward.x, from.y - toward.y, from.z - toward.z);
  const length = Math.hypot(outward.x, outward.y, outward.z);
  const fallback = length > 1e-6
    ? vec3(outward.x / length, outward.y / length, outward.z / length)
    : vec3(0, 1, 0);
  return terrainNormalFromArgs(args, prefix, fallback);
}

function parseTerrainChannelColor(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(0xffffff, Math.floor(value)));
  }
  if (typeof value !== "string") return undefined;
  const hex = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(hex) ? Number.parseInt(hex, 16) : undefined;
}

type TerrainCutterBaseFields = {
  interior?: "ember" | "rock";
  noise?: number;
  noiseScale?: number;
  surface?: TerrainCutterSurfaceProfile;
};

function terrainCutterBaseFromArgs(entry: Args): TerrainCutterBaseFields {
  const surface = optionalStr(entry, "surface");
  const interior = optionalStr(entry, "interior");
  return {
    ...(surface && TERRAIN_CUTTER_SURFACES.includes(surface) ? { surface } : {}),
    ...(optionalNum(entry, "noise") === undefined ? {} : { noise: Math.max(0, num(entry, "noise")) }),
    ...(optionalNum(entry, "noiseScale") === undefined ? {} : { noiseScale: Math.max(0.05, num(entry, "noiseScale")) }),
    ...(interior === "rock" || interior === "ember" ? { interior } : {})
  };
}

/** Builds one world-space CSG operand, or throws with the reason it could not. */
function terrainCutterFromArgs(entry: Args, index: number): CutterVolume {
  const base = terrainCutterBaseFromArgs(entry);
  const kind = str(entry, "kind");
  const center = vec3(num(entry, "centerX"), num(entry, "centerY"), num(entry, "centerZ"));
  const forward = terrainNormalFromArgs(entry, "forward", vec3(1, 0, 0));
  const up = terrainNormalFromArgs(entry, "up", vec3(0, 1, 0));

  switch (kind) {
    case "capsule": {
      const radius = finiteArg(entry, "radiusMeters", 0);
      if (!(radius > 0)) throw new Error(`volumes[${index}]: capsule needs radiusMeters greater than 0.`);
      return {
        ...base,
        end: vec3(num(entry, "endX"), num(entry, "endY"), num(entry, "endZ")),
        kind: "capsule",
        radius,
        start: vec3(num(entry, "startX"), num(entry, "startY"), num(entry, "startZ"))
      };
    }
    case "ellipsoid": {
      const radii = vec3(
        finiteArg(entry, "radiusX", 0),
        finiteArg(entry, "radiusY", 0),
        finiteArg(entry, "radiusZ", 0)
      );
      if (radii.x <= 0 || radii.y <= 0 || radii.z <= 0) {
        throw new Error(`volumes[${index}]: ellipsoid needs radiusX, radiusY, and radiusZ greater than 0.`);
      }
      return { ...base, center, forward, kind: "ellipsoid", radii, up };
    }
    case "box": {
      const halfExtents = vec3(
        finiteArg(entry, "halfExtentX", 0),
        finiteArg(entry, "halfExtentY", 0),
        finiteArg(entry, "halfExtentZ", 0)
      );
      if (halfExtents.x <= 0 || halfExtents.y <= 0 || halfExtents.z <= 0) {
        throw new Error(`volumes[${index}]: box needs halfExtentX, halfExtentY, and halfExtentZ greater than 0.`);
      }
      return { ...base, center, forward, halfExtents, kind: "box", up };
    }
    case "sweep": {
      const rings = recordArray(entry, "rings").map((ring) => ({
        horizontalRadius: Math.max(0.01, finiteArg(ring, "horizontalRadius", 1)),
        verticalRadius: Math.max(0.01, finiteArg(ring, "verticalRadius", 1)),
        x: num(ring, "x"),
        y: num(ring, "y"),
        z: num(ring, "z")
      }));
      if (rings.length < 2) throw new Error(`volumes[${index}]: sweep needs at least 2 rings.`);
      return { ...base, kind: "sweep", rings };
    }
    default:
      throw new Error(`volumes[${index}]: kind must be capsule, ellipsoid, box, or sweep.`);
  }
}

/** Modifier summary for `get_terrain_state`: shape and extent, never point lists. */
function summarizeTerrainModifier(modifier: TerrainModifier): Record<string, unknown> {
  const base = {
    bounds: modifier.bounds,
    enabled: modifier.enabled,
    id: modifier.id,
    sequence: modifier.sequence ?? null,
    type: modifier.type
  };

  switch (modifier.type) {
    case "brush-stroke":
      return {
        ...base,
        domain: modifier.domain,
        mode: modifier.mode,
        pointCount: modifier.points.length,
        radiusMeters: modifier.radius,
        strength: modifier.strength
      };
    case "weight-paint":
      return {
        ...base,
        channel: modifier.channel,
        mode: modifier.mode,
        pointCount: modifier.points.length,
        radiusMeters: modifier.radius
      };
    case "boolean-subtract":
      return {
        ...base,
        branchCount: modifier.carves?.length ?? 0,
        depthMeters: modifier.depth,
        portals: modifier.portals,
        radiusMeters: modifier.radius,
        shape: modifier.shape
      };
    case "boolean-volume":
      return {
        ...base,
        operation: modifier.operation,
        volumeCount: modifier.volumes.length,
        volumeKinds: modifier.volumes.map((volume) => volume.kind)
      };
    case "remesh":
    case "tessellate":
      return { ...base, center: modifier.center, radiusMeters: modifier.radius, targetEdgeLengthMeters: modifier.targetEdgeLength };
    case "material-settings":
      return { ...base, channels: modifier.settings.channels };
    case "sculpt-layer":
      return { ...base, name: modifier.name, opacity: modifier.opacity };
    case "noise":
      return { ...base, amplitude: modifier.amplitude, frequency: modifier.frequency };
    case "field-displacement":
      return { ...base, fieldId: modifier.fieldId, scale: modifier.scale };
    default:
      return base;
  }
}

export async function executeTool(
  editor: EditorCore,
  toolCall: CopilotToolCall,
  context: CopilotToolExecutionContext = {}
): Promise<CopilotToolResult> {
  const { name, args } = toolCall;

  try {
    if (name === "capture_viewport_screenshot" || name === "capture_world_verification_screenshot") {
      if (!context.captureViewportScreenshot) {
        return {
          callId: toolCall.id,
          name,
          result: fail("Viewport screenshot capture is unavailable in this context.")
        };
      }

      const screenshot = await context.captureViewportScreenshot();
      return {
        callId: toolCall.id,
        images: [
          {
            dataUrl: screenshot.dataUrl,
            mimeType: screenshot.mimeType,
            name: name === "capture_world_verification_screenshot" ? "procedural-world-verification.png" : "viewport-screenshot.png"
          }
        ],
        name,
        result: ok({
          captured: true,
          height: screenshot.height,
          message: "Viewport screenshot captured and attached for the next model step.",
          width: screenshot.width
        })
      };
    }

    const result = await executeToolInner(editor, name, args, context);
    return { callId: toolCall.id, name, result };
  } catch (error) {
    return {
      callId: toolCall.id,
      name,
      result: fail(error instanceof Error ? error.message : "Unknown error")
    };
  }
}

async function executeToolInner(editor: EditorCore, name: string, args: Args, context: CopilotToolExecutionContext): Promise<string> {
  const scene = editor.scene;

  switch (name) {
    case "list_copilot_skill_references": {
      const result = context.copilotListSkillReferences?.(optionalStr(args, "skillId")) ??
        listCopilotSkillReferences({ skills: bundledCopilotSkills }, optionalStr(args, "skillId"));
      return ok(result);
    }

    case "read_copilot_skill_reference": {
      const skillId = str(args, "skillId");
      const referenceId = str(args, "referenceId");
      if (!skillId || !referenceId) return fail("skillId and referenceId are required.");
      const result = context.copilotReadSkillReference?.(skillId, referenceId, {
        endLine: optionalNum(args, "endLine"),
        maxChars: optionalNum(args, "maxChars"),
        startLine: optionalNum(args, "startLine")
      }) ?? readCopilotSkillReference({ skills: bundledCopilotSkills }, skillId, referenceId, {
        endLine: optionalNum(args, "endLine"),
        maxChars: optionalNum(args, "maxChars"),
        startLine: optionalNum(args, "startLine")
      });
      return ok(result);
    }

    case "search_copilot_skill_references": {
      const query = str(args, "query");
      if (!query) return fail("query is required.");
      const options = {
        maxResults: optionalNum(args, "maxResults"),
        referenceIds: strArray(args, "referenceIds"),
        skillId: optionalStr(args, "skillId")
      };
      const result = context.copilotSearchSkillReferences?.(query, options) ??
        searchCopilotSkillReferences({ skills: bundledCopilotSkills }, query, options);
      return ok(result);
    }

    case "create_procedural_world": {
      const existing = Array.from(scene.nodes.values()).filter(isProceduralWorldNode);
      if (existing.length > 0 && bool(args, "allowDuplicate") !== true) {
        return fail("A procedural world already exists. Set allowDuplicate to true only when multiple worlds are intentional.");
      }
      const data = createDefaultProceduralWorldNodeData(finiteArg(args, "seed", 1));
      const preset = str(args, "preset", data.preset);
      if (preset === "low" || preset === "high" || preset === "ultra") data.preset = preset;
      data.worldSizeMeters = Math.max(256, finiteArg(args, "worldSizeMeters", data.worldSizeMeters));
      data.timeOfDay = Math.min(24, Math.max(0, finiteArg(args, "timeOfDay", data.timeOfDay)));
      const node: ProceduralWorldNode = {
        data,
        id: uniqueSceneNodeId(scene, "node:procedural-world", new Set<string>()),
        kind: "procedural-world",
        name: str(args, "name", "LAAS Procedural World"),
        transform: makeTransform()
      };
      editor.execute(createProceduralWorldNodeCommand(node));
      return ok({ nodeId: node.id, queued: true, seed: data.seed, preset: data.preset });
    }

    case "inspect_procedural_world": {
      const node = resolveProceduralWorldNode(scene, optionalStr(args, "nodeId"));
      const runtime = getProceduralWorldRuntimeStatus(node.id);
      const resolution = resolveProceduralWorldPreset(node.data);
      return ok({
        activeGpuResources: runtime?.activeGpuResources ?? [],
        activePasses: runtime?.activePasses ?? [],
        authoredConfig: node.data,
        bindingResult: runtime?.bindingResult ?? null,
        effectiveRuntimeConfig: runtime?.effectiveRuntimeConfig ?? resolution.config,
        hardwareClamps: runtime?.hardwareClamps ?? [],
        lastGenerationDurationMs: runtime?.lastGenerationDurationMs ?? null,
        name: node.name,
        nodeId: node.id,
        presetOverrides: runtime?.presetOverrides ?? resolution.presetOverrides,
        runtimeActive: Boolean(runtime),
        systems: runtime?.systems ?? null,
        waitingForRegeneration: runtime?.waitingForRegeneration ?? [],
      });
    }

    case "regenerate_procedural_world": {
      const node = resolveProceduralWorldNode(scene, optionalStr(args, "nodeId"));
      const binding = await requestProceduralWorldRuntimeAction(node.id, "world");
      return ok({ ...binding, nodeId: node.id, requiresScreenshotVerification: true, updated: true });
    }

    case "set_procedural_world_seed": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Set procedural world seed", (next) => {
        next.seed = Math.floor(finiteArg(args, "seed", next.seed)) >>> 0;
      });
      return ok(proceduralWorldToolResult(data, { seed: data.seed }));
    }

    case "set_procedural_world_preset": {
      const preset = str(args, "preset");
      if (preset !== "low" && preset !== "high" && preset !== "ultra") return fail("preset must be low, high, or ultra.");
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Set procedural world preset", (next) => { next.preset = preset; });
      return ok(proceduralWorldToolResult(data, { preset: data.preset }));
    }

    case "configure_procedural_terrain": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural terrain", (next) => {
        applyFiniteArg(args, "heightAmplitude", (value) => { next.terrain.heightAmplitude = Math.max(0, value); });
        applyFiniteArg(args, "noiseScale", (value) => { next.terrain.noiseScale = Math.max(0.01, value); });
        applyFiniteArg(args, "hydraulicErosion", (value) => { next.terrain.hydraulicErosion = Math.max(0, value); });
        applyFiniteArg(args, "thermalErosion", (value) => { next.terrain.thermalErosion = Math.max(0, value); });
        applyFiniteArg(args, "riverThreshold", (value) => { next.terrain.riverThreshold = Math.max(0, value); });
        applyFiniteArg(args, "moisture", (value) => { next.terrain.moisture = Math.max(0, value); });
        applyFiniteArg(args, "snow", (value) => { next.terrain.snow = Math.max(0, value); });
        applyFiniteArg(args, "terrainRange", (value) => { next.terrain.terrainRange = Math.max(256, value); });
        const lakeBehavior = str(args, "lakeBehavior");
        if (lakeBehavior === "connected" || lakeBehavior === "natural" || lakeBehavior === "off") next.terrain.lakeBehavior = lakeBehavior;
        const farShell = bool(args, "farShell");
        if (farShell !== undefined) next.terrain.farShell = farShell;
      });
      return ok(proceduralWorldToolResult(data, { terrain: data.terrain }));
    }

    case "configure_procedural_vegetation": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural vegetation", (next) => {
        const species = strArray(args, "enabledSpecies");
        if (species.length > 0) next.vegetation.enabledSpecies = species;
        applyFiniteArg(args, "treeDensity", (value) => { next.vegetation.treeDensity = Math.max(0, value); });
        applyFiniteArg(args, "understoryDensity", (value) => { next.vegetation.understoryDensity = Math.max(0, value); });
        applyFiniteArg(args, "grassDensity", (value) => { next.vegetation.grassDensity = Math.max(0, value); });
        applyFiniteArg(args, "slopeLimit", (value) => { next.vegetation.slopeLimit = Math.max(0, value); });
        applyFiniteArg(args, "scatterSeedOffset", (value) => { next.vegetation.scatterSeedOffset = Math.floor(value); });
        applyFiniteArg(args, "impostorRange", (value) => { next.vegetation.impostorRange = Math.max(0, value); });
        applyFiniteArg(args, "windResponse", (value) => { next.vegetation.windResponse = Math.max(0, value); });
      });
      return ok(proceduralWorldToolResult(data, { vegetation: data.vegetation }));
    }

    case "configure_procedural_lighting": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural lighting", (next) => {
        const giEnabled = bool(args, "giEnabled");
        if (giEnabled !== undefined) next.lighting.giEnabled = giEnabled;
        const quality = str(args, "shadowQuality");
        if (quality === "low" || quality === "high" || quality === "ultra") next.lighting.shadowQuality = quality;
        applyFiniteArg(args, "sunAzimuth", (value) => { next.lighting.sunAzimuth = value; });
        applyFiniteArg(args, "sunElevation", (value) => { next.lighting.sunElevation = value; });
      });
      return ok(proceduralWorldToolResult(data, { lighting: data.lighting }));
    }

    case "configure_procedural_atmosphere": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural atmosphere", (next) => {
        applyFiniteArg(args, "cloudCoverage", (value) => { next.atmosphere.cloudCoverage = clamp01(value); });
        applyFiniteArg(args, "cloudSpeed", (value) => { next.atmosphere.cloudSpeed = Math.max(0, value); });
        applyFiniteArg(args, "fogDensity", (value) => { next.atmosphere.fogDensity = Math.max(0, value); });
        const volumetrics = bool(args, "volumetrics");
        if (volumetrics !== undefined) next.atmosphere.volumetrics = volumetrics;
      });
      return ok(proceduralWorldToolResult(data, { atmosphere: data.atmosphere }));
    }

    case "configure_procedural_water": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural water", (next) => {
        const enabled = bool(args, "enabled"); const caustics = bool(args, "caustics"); const foam = bool(args, "foam"); const wetMargins = bool(args, "wetMargins");
        if (enabled !== undefined) next.water.enabled = enabled;
        if (caustics !== undefined) next.water.caustics = caustics;
        if (foam !== undefined) next.water.foam = foam;
        if (wetMargins !== undefined) next.water.wetMargins = wetMargins;
        const quality = str(args, "reflectionQuality");
        if (quality === "low" || quality === "high" || quality === "ultra") next.water.reflectionQuality = quality;
        applyFiniteArg(args, "clipmapDistance", (value) => { next.water.clipmapDistance = Math.max(64, value); });
      });
      return ok(proceduralWorldToolResult(data, { water: data.water }));
    }

    case "configure_procedural_motion": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural motion", (next) => {
        applyFiniteArg(args, "windDirection", (value) => { next.motion.windDirection = value; });
        applyFiniteArg(args, "windStrength", (value) => { next.motion.windStrength = Math.max(0, value); });
        applyFiniteArg(args, "cloudSpeed", (value) => { next.motion.cloudSpeed = Math.max(0, value); });
        const particlePreset = str(args, "particlePreset");
        if (particlePreset === "low" || particlePreset === "high" || particlePreset === "ultra") next.motion.particlePreset = particlePreset;
        const particleTypes = strArray(args, "particleTypes").filter((value): value is "leaves" | "pollen" | "snow" => value === "leaves" || value === "pollen" || value === "snow");
        if (particleTypes.length > 0) next.motion.particleTypes = particleTypes;
        const freeze = bool(args, "freezeSimulation"); if (freeze !== undefined) next.motion.freezeSimulation = freeze;
      });
      return ok(proceduralWorldToolResult(data, { motion: data.motion }));
    }

    case "configure_procedural_post": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Configure procedural post", (next) => {
        const fields = ["taa", "gtao", "screenSpaceBounce", "bloom", "autoExposure"] as const;
        fields.forEach((field) => { const value = bool(args, field); if (value !== undefined) next.post[field] = value; });
        const debugView = str(args, "debugView");
        if (debugView === "none" || debugView === "ao" || debugView === "clouds" || debugView === "velocity") next.post.debugView = debugView;
      });
      return ok(proceduralWorldToolResult(data, { post: data.post }));
    }

    case "set_world_time_of_day": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Set world time of day", (next) => { next.timeOfDay = Math.min(24, Math.max(0, finiteArg(args, "timeOfDay", next.timeOfDay))); });
      return ok(proceduralWorldToolResult(data, { timeOfDay: data.timeOfDay }));
    }

    case "set_world_weather": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Set world weather", (next) => {
        applyFiniteArg(args, "cloudCoverage", (value) => { next.atmosphere.cloudCoverage = clamp01(value); });
        applyFiniteArg(args, "fogDensity", (value) => { next.atmosphere.fogDensity = Math.max(0, value); });
        const particles = strArray(args, "particleTypes").filter((value): value is "leaves" | "pollen" | "snow" => value === "leaves" || value === "pollen" || value === "snow");
        if (particles.length > 0) next.motion.particleTypes = particles;
      });
      return ok(proceduralWorldToolResult(data, { atmosphere: data.atmosphere, motion: data.motion }));
    }

    case "set_world_exploration_mode": {
      const mode = str(args, "mode");
      if (mode !== "editor" && mode !== "walk" && mode !== "fly") return fail("mode must be editor, walk, or fly.");
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Set world exploration mode", (next) => { next.exploration.mode = mode; });
      return ok(proceduralWorldToolResult(data, { mode: data.exploration.mode }));
    }

    case "create_world_bookmark": {
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Create world bookmark", (next) => {
        if (next.bookmarks.length >= 9) throw new Error("LAAS supports a maximum of nine composed bookmarks.");
        next.bookmarks.push({ id: `bookmark:${crypto.randomUUID()}`, name: str(args, "name", `Bookmark ${next.bookmarks.length + 1}`), pitch: finiteArg(args, "pitch", 0), timeOfDay: Math.min(24, Math.max(0, finiteArg(args, "timeOfDay", next.timeOfDay))), x: finiteArg(args, "x", 0), y: finiteArg(args, "y", 2), yaw: finiteArg(args, "yaw", 0), z: finiteArg(args, "z", 0) });
      });
      return ok(proceduralWorldToolResult(data, { bookmark: data.bookmarks[data.bookmarks.length - 1] }));
    }

    case "update_world_bookmark": {
      const bookmarkId = str(args, "bookmarkId");
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Update world bookmark", (next) => {
        const bookmark = next.bookmarks.find((candidate) => candidate.id === bookmarkId); if (!bookmark) throw new Error(`Bookmark "${bookmarkId}" was not found.`);
        if (typeof args.name === "string") bookmark.name = args.name;
        applyFiniteArg(args, "x", (value) => { bookmark.x = value; }); applyFiniteArg(args, "y", (value) => { bookmark.y = value; }); applyFiniteArg(args, "z", (value) => { bookmark.z = value; }); applyFiniteArg(args, "yaw", (value) => { bookmark.yaw = value; }); applyFiniteArg(args, "pitch", (value) => { bookmark.pitch = value; }); applyFiniteArg(args, "timeOfDay", (value) => { bookmark.timeOfDay = Math.min(24, Math.max(0, value)); });
      });
      return ok(proceduralWorldToolResult(data, { bookmark: data.bookmarks.find((candidate) => candidate.id === bookmarkId) }));
    }

    case "delete_world_bookmark": {
      const bookmarkId = str(args, "bookmarkId");
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), "Delete world bookmark", (next) => {
        const initialLength = next.bookmarks.length; next.bookmarks = next.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId); if (next.bookmarks.length === initialLength) throw new Error(`Bookmark "${bookmarkId}" was not found.`);
      });
      return ok(proceduralWorldToolResult(data, { bookmarks: data.bookmarks }));
    }

    case "play_world_flythrough":
    case "stop_world_flythrough": {
      const mode = name === "play_world_flythrough" ? "fly" : "editor";
      const data = updateProceduralWorld(editor, optionalStr(args, "nodeId"), name === "play_world_flythrough" ? "Play world flythrough" : "Stop world flythrough", (next) => { next.exploration.mode = mode; });
      return ok(proceduralWorldToolResult(data, { mode: data.exploration.mode }));
    }

    case "inspect_world_performance": {
      const node = resolveProceduralWorldNode(scene, optionalStr(args, "nodeId"));
      const runtime = getProceduralWorldRuntimeStatus(node.id);
      if (!runtime) return fail("Live performance inspection requires an active WebGPU procedural-world runtime.");
      return ok({
        activeGpuResources: runtime.activeGpuResources,
        activePasses: runtime.activePasses,
        adapter: runtime.diagnostic,
        generationDurationMs: runtime.lastGenerationDurationMs,
        nodeId: node.id,
        preset: runtime.effectiveRuntimeConfig.preset,
        systems: runtime.systems,
      });
    }

    // ── Mesh terrain ──────────────────────────────────────────
    case "create_mesh_terrain": {
      const existing = Array.from(scene.nodes.values()).filter(isMeshTerrainNode);
      if (existing.length > 0 && bool(args, "allowDuplicate") !== true) {
        return fail("A mesh terrain already exists. Pass its nodeId to the terrain tools, or set allowDuplicate to true only when a second terrain is intentional.");
      }

      const seed = Math.floor(finiteArg(args, "seed", 1));
      const data = createDefaultTerrainNodeData("mesh", seed);
      const state = data.meshTerrain;
      if (!state) return fail("Mesh terrain state was not initialized.");

      state.worldSize = Math.min(16_384, Math.max(256, finiteArg(args, "worldSizeMeters", state.worldSize)));
      state.sectionSize = Math.min(1024, Math.max(16, finiteArg(args, "sectionSizeMeters", state.sectionSize)));
      state.lodLevels = Math.min(5, Math.max(1, Math.round(finiteArg(args, "lodLevels", state.lodLevels))));
      const profile = str(args, "profile", state.profile);
      if (profile === "natural" || profile === "flat") state.profile = profile;
      // Keep the generic terrain footprint in step with the authored world size so
      // bounds, selection, and export read the same extent the mesh actually covers.
      data.size = vec3(state.worldSize, data.size.y, state.worldSize);

      const node: TerrainNode = {
        data,
        id: uniqueSceneNodeId(scene, "node:terrain", new Set<string>()),
        kind: "terrain",
        name: str(args, "name", "Mesh Terrain"),
        transform: makeTransform(vec3(finiteArg(args, "x", 0), finiteArg(args, "y", 0), finiteArg(args, "z", 0)))
      };
      const snapshot = structuredClone(node);
      const command: Command = {
        label: "Create mesh terrain",
        execute(nextScene) {
          nextScene.addNode(structuredClone(snapshot));
        },
        undo(nextScene) {
          nextScene.removeNode(snapshot.id);
        }
      };
      editor.execute(command);
      context.onTerrainStateChanged?.(node.id);

      return ok({
        lodLevels: state.lodLevels,
        materialChannels: state.materialSettings.channels.map((channel) => ({ id: channel.id, name: channel.name })),
        mode: "mesh",
        nodeId: node.id,
        profile: state.profile,
        sectionSizeMeters: state.sectionSize,
        seed: state.seed,
        worldSizeMeters: state.worldSize
      });
    }

    case "terrain_sculpt_stroke": {
      const mode = str(args, "mode");
      if (!MESH_BRUSH_MODES.includes(mode as MeshBrushMode)) {
        return fail(`mode must be one of ${MESH_BRUSH_MODES.join(", ")}.`);
      }
      const samples = terrainPathSamples(args);
      if (samples.length === 0) return fail("path must contain at least one world-space point.");
      const radius = finiteArg(args, "radiusMeters", 0);
      if (!(radius > 0)) return fail("radiusMeters must be greater than 0.");
      const strength = finiteArg(args, "strength", 0);
      if (strength === 0) return fail("strength must be non-zero; it is the peak displacement in meters.");

      const domain: MeshBrushDomain = str(args, "domain", "mesh") === "heightfield" ? "heightfield" : "mesh";
      const first = samples[0]!;

      return updateMeshTerrain(editor, context, optionalStr(args, "nodeId"), "Sculpt terrain", (state) => {
        const stroke = createBrushStroke({
          accumulate: bool(args, "accumulate"),
          domain,
          falloff: clamp01(finiteArg(args, "falloff", 0.5)),
          mode: mode as MeshBrushMode,
          noiseScale: optionalNum(args, "noiseScale"),
          normal: first.normal,
          point: first.point,
          radius,
          sampleWeight: first.weight,
          sculptLayerId: optionalStr(args, "sculptLayerId"),
          strength,
          targetY: optionalNum(args, "targetY") ?? (mode === "flatten" ? first.point.y : undefined),
          terraceStep: optionalNum(args, "terraceStepMeters")
        });

        for (const sample of samples.slice(1)) {
          appendBrushPoint(stroke, sample.point, sample.normal, sample.weight);
        }
        appendTerrainModifier(state, stroke);

        return {
          bounds: stroke.bounds,
          domain,
          mode,
          modifierId: stroke.id,
          pointCount: stroke.points.length,
          radiusMeters: radius,
          strength
        };
      });
    }

    case "terrain_paint_weights": {
      const channel = str(args, "channel");
      if (!TERRAIN_PAINT_CHANNELS.includes(channel as TerrainPaintChannelId)) {
        return fail(`channel must be one of ${TERRAIN_PAINT_CHANNELS.join(", ")}.`);
      }
      const samples = terrainPathSamples(args);
      if (samples.length === 0) return fail("path must contain at least one world-space point.");
      const radius = finiteArg(args, "radiusMeters", 0);
      if (!(radius > 0)) return fail("radiusMeters must be greater than 0.");

      const paintMode: TerrainPaintMode = str(args, "mode", "add") === "subtract" ? "subtract" : "add";
      const first = samples[0]!;

      return updateMeshTerrain(editor, context, optionalStr(args, "nodeId"), "Paint terrain weights", (state) => {
        const stroke = createWeightPaintStroke({
          channel: channel as TerrainPaintChannelId,
          falloff: clamp01(finiteArg(args, "falloff", 0.7)),
          mode: paintMode,
          normal: first.normal,
          point: first.point,
          radius,
          sampleWeight: first.weight,
          strength: clamp01(finiteArg(args, "strength", 0.5))
        });

        for (const sample of samples.slice(1)) {
          appendBrushPoint(stroke, sample.point, sample.normal, sample.weight);
        }
        appendTerrainModifier(state, stroke);

        return {
          bounds: stroke.bounds,
          channel,
          mode: paintMode,
          modifierId: stroke.id,
          pointCount: stroke.points.length,
          radiusMeters: radius
        };
      });
    }

    case "terrain_carve_tunnel": {
      const startPoint = vec3(finiteArg(args, "startX", 0), finiteArg(args, "startY", 0), finiteArg(args, "startZ", 0));
      const endPoint = vec3(finiteArg(args, "endX", 0), finiteArg(args, "endY", 0), finiteArg(args, "endZ", 0));
      const span = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y, endPoint.z - startPoint.z);
      if (span < 1e-3) return fail("The two tunnel portals must be at different world positions.");

      const radius = Math.max(0.1, finiteArg(args, "radiusMeters", 8));
      if (span < radius) {
        return fail(`The portals are ${span.toFixed(1)} m apart but the bore radius is ${radius} m. Move the portals further apart or reduce radiusMeters.`);
      }

      return updateMeshTerrain(editor, context, optionalStr(args, "nodeId"), "Carve terrain tunnel", (state) => {
        const tunnel = createTunnelModifier({
          depth: optionalNum(args, "depthMeters"),
          end: { ...endPoint, normal: terrainPortalNormal(args, "endNormal", endPoint, startPoint) },
          noise: optionalNum(args, "noise"),
          noiseScale: optionalNum(args, "noiseScale"),
          radius,
          start: { ...startPoint, normal: terrainPortalNormal(args, "startNormal", startPoint, endPoint) }
        });
        appendTerrainModifier(state, tunnel);

        return {
          bounds: tunnel.bounds,
          depthMeters: tunnel.depth,
          lengthMeters: span,
          modifierId: tunnel.id,
          portals: tunnel.portals,
          radiusMeters: tunnel.radius
        };
      });
    }

    case "terrain_add_csg_volume": {
      const entries = recordArray(args, "volumes");
      if (entries.length === 0) return fail("volumes must contain at least one cutter volume.");
      const volumes = entries.map((entry, index) => terrainCutterFromArgs(entry, index));
      const operation = str(args, "operation", "subtract") === "add" ? "add" : "subtract";

      return updateMeshTerrain(editor, context, optionalStr(args, "nodeId"), "Combine terrain volumes", (state) => {
        const modifier = createBooleanVolumeModifier({ operation, volumes });
        appendTerrainModifier(state, modifier);

        return {
          bounds: modifier.bounds,
          modifierId: modifier.id,
          operation,
          volumeCount: modifier.volumes.length,
          volumeKinds: modifier.volumes.map((volume) => volume.kind)
        };
      });
    }

    case "terrain_refine_density": {
      const center = vec3(finiteArg(args, "x", 0), finiteArg(args, "y", 0), finiteArg(args, "z", 0));
      const radius = finiteArg(args, "radiusMeters", 0);
      if (!(radius > 0)) return fail("radiusMeters must be greater than 0.");
      const targetEdgeLength = finiteArg(args, "targetEdgeLengthMeters", 0);
      if (!(targetEdgeLength > 0)) return fail("targetEdgeLengthMeters must be greater than 0.");
      if (targetEdgeLength >= radius) {
        return fail("targetEdgeLengthMeters must be smaller than radiusMeters, otherwise the region gains no detail.");
      }
      const refineMode = str(args, "mode", "tessellate") === "remesh" ? "remesh" : "tessellate";

      return updateMeshTerrain(editor, context, optionalStr(args, "nodeId"), "Refine terrain density", (state) => {
        const modifier = refineMode === "remesh"
          ? createRemeshModifier({ center, radius, targetEdgeLength })
          : createTessellateModifier({ center, radius, targetEdgeLength });
        appendTerrainModifier(state, modifier);

        return {
          bounds: modifier.bounds,
          mode: refineMode,
          modifierId: modifier.id,
          radiusMeters: radius,
          targetEdgeLengthMeters: targetEdgeLength
        };
      });
    }

    case "terrain_set_material_channels": {
      const entries = recordArray(args, "channels");
      if (entries.length === 0) return fail("channels must contain at least one channel entry.");
      const invalid = entries.find((entry) => !TERRAIN_PAINT_CHANNELS.includes(str(entry, "id") as TerrainPaintChannelId));
      if (invalid) return fail(`Each channel entry needs an id of ${TERRAIN_PAINT_CHANNELS.join(", ")}.`);

      return updateMeshTerrain(editor, context, optionalStr(args, "nodeId"), "Set terrain material channels", (state) => {
        const patches = new Map(entries.map((entry) => [str(entry, "id"), entry] as const));
        const channels = state.materialSettings.channels.map((channel) => {
          const patch = patches.get(channel.id);
          if (!patch) return { ...channel };
          return {
            color: parseTerrainChannelColor(patch.color) ?? channel.color,
            id: channel.id,
            name: optionalStr(patch, "name") ?? channel.name,
            roughness: optionalNum(patch, "roughness") === undefined
              ? channel.roughness
              : clamp01(num(patch, "roughness"))
          };
        }) as [TerrainMaterialChannel, TerrainMaterialChannel, TerrainMaterialChannel, TerrainMaterialChannel];

        state.materialSettings = { channels };
        return { channels };
      });
    }

    // -- Forests -----------------------------------------------------------

    case "create_forest_field": {
      const preset = str(args, "preset", "mossy-old-growth");
      if (!isForestPreset(preset)) {
        return fail(`preset must be one of ${FOREST_PRESETS.map((entry) => entry.id).join(", ")}.`);
      }

      const fieldId = forestStore.createField(preset);
      const patch: Partial<ForestField> = {};
      const name = optionalStr(args, "name");
      if (name) patch.name = name;
      const closed = bool(args, "closed");
      if (closed !== undefined) patch.closed = closed;
      if (Object.keys(patch).length > 0) forestStore.patchField(fieldId, patch);

      const points = forestPoints(args);
      for (const point of points) forestStore.appendNode(fieldId, point);
      if (points.length > 0) forestStore.finishDrawing();

      // Growing is normally its own step, but a field created with its whole
      // shape in one call has nothing left to wait for.
      const shouldGrow = bool(args, "grow") ?? points.length >= 2;
      if (shouldGrow && points.length >= 2) forestStore.requestGrow(fieldId);

      const field = findForestField(fieldId);
      return ok({
        closed: field?.closed ?? true,
        density: field?.density,
        feather: field?.feather,
        fieldId,
        growRequested: shouldGrow && points.length >= 2,
        name: field?.name,
        points: points.length,
        preset,
        note:
          points.length < 2
            ? "Add at least two points with add_forest_points, then call grow_forest_field."
            : undefined
      });
    }

    case "add_forest_points": {
      const field = resolveForestField(optionalStr(args, "fieldId"));
      if (typeof field === "string") return field;

      const points = forestPoints(args);
      if (points.length === 0) return fail("points must contain at least one { x, z } entry.");
      for (const point of points) forestStore.appendNode(field.id, point);
      forestStore.finishDrawing();

      const updated = findForestField(field.id);
      return ok({
        added: points.length,
        fieldId: field.id,
        readyToGrow: (updated?.nodes.length ?? 0) >= 2,
        totalPoints: updated?.nodes.length ?? points.length
      });
    }

    case "configure_forest_field": {
      const field = resolveForestField(optionalStr(args, "fieldId"));
      if (typeof field === "string") return field;

      const patch: Partial<ForestField> = {};
      const preset = optionalStr(args, "preset");
      if (preset) {
        if (!isForestPreset(preset)) {
          return fail(`preset must be one of ${FOREST_PRESETS.map((entry) => entry.id).join(", ")}.`);
        }
        patch.preset = preset;
      }
      if (typeof args.density === "number") patch.density = Math.max(0.01, Math.min(4, args.density));
      if (typeof args.feather === "number") patch.feather = Math.max(0, Math.min(400, args.feather));
      if (typeof args.width === "number") patch.width = Math.max(1, Math.min(1000, args.width));
      if (typeof args.seed === "number") patch.seed = Math.floor(args.seed);
      const closed = bool(args, "closed");
      if (closed !== undefined) patch.closed = closed;
      const visible = bool(args, "visible");
      if (visible !== undefined) patch.visible = visible;
      const name = optionalStr(args, "name");
      if (name) patch.name = name;

      if (Object.keys(patch).length === 0) return fail("No settings were supplied to change.");
      forestStore.patchField(field.id, patch);

      const updated = findForestField(field.id);
      return ok({
        changed: Object.keys(patch),
        closed: updated?.closed,
        density: updated?.density,
        feather: updated?.feather,
        fieldId: field.id,
        note: "The stand is marked dirty. Call grow_forest_field to rebuild it.",
        preset: updated?.preset
      });
    }

    case "grow_forest_field": {
      const requestedId = optionalStr(args, "fieldId");
      if (requestedId) {
        const field = resolveForestField(requestedId);
        if (typeof field === "string") return field;
        if (field.nodes.length < 2) {
          return fail(`Field ${field.id} has ${field.nodes.length} point(s); a stand needs at least two.`);
        }
      }
      forestStore.requestGrow(requestedId);

      // The viewport growth driver does the bake, one field per tick, so the
      // stems are not counted here -- get_forest_state reports them once it has.
      return ok({
        fieldId: requestedId ?? "all dirty fields",
        note: "Growing runs in the viewport. Call get_forest_state to read the stem count.",
        requested: true
      });
    }

    case "get_forest_state": {
      const snapshot = forestStore.getSnapshot();
      return ok({
        fieldCount: snapshot.fields.length,
        fields: snapshot.fields.map((field) => {
          const bake = snapshot.bakes[field.id];
          return {
            closed: field.closed,
            density: field.density,
            feather: field.feather,
            fieldId: field.id,
            name: field.name,
            needsGrow: field.dirty,
            points: field.nodes.length,
            preset: field.preset,
            seed: field.seed,
            visible: field.visible,
            width: field.closed ? undefined : field.width,
            ...(bake
              ? {
                  boulders: bake.rocks.length,
                  growMs: Math.round(bake.elapsedMs),
                  stems: bake.placements.length,
                  treePrototypes: bake.prototypeIds
                }
              : {})
          };
        }),
        status: snapshot.status
      });
    }

    case "delete_forest_field": {
      const field = resolveForestField(str(args, "fieldId"));
      if (typeof field === "string") return field;
      forestStore.removeField(field.id);
      return ok({ deleted: true, fieldId: field.id, name: field.name });
    }

    // -- Combat VFX --------------------------------------------------------

    case "cast_vfx_ability": {
      const element = str(args, "element");
      if (!(ELEMENTS as readonly string[]).includes(element)) {
        return fail(`element must be one of ${ELEMENTS.join(", ")}.`);
      }
      const distance = Math.max(1, Math.min(400, finiteArg(args, "distance", 20)));
      const outcome = requestVfxCast({
        direction: { x: finiteArg(args, "directionX", 0), z: finiteArg(args, "directionZ", 1) },
        distance,
        element: element as ElementId,
        origin: {
          x: finiteArg(args, "x", 0),
          y: finiteArg(args, "y", 0),
          z: finiteArg(args, "z", 0)
        }
      });

      if (!outcome.accepted) return fail(outcome.reason ?? "The cast was refused.");

      const meta = ELEMENT_META[element as ElementId];
      return ok({
        cast: meta.label,
        castShape: castShapeOf(element as ElementId),
        distanceMeters: distance,
        element,
        // Deferred means no viewport is mounted yet. The cast is held rather
        // than refused, and plays as soon as one appears.
        pending: outcome.deferred,
        note: outcome.deferred
          ? "No viewport is running yet, so the cast is queued and will play as soon as one is. It expires after 10 seconds if none appears."
          : "The cast plays once in the viewport and is not saved with the scene."
      });
    }

    case "list_vfx_abilities": {
      return ok({
        abilities: ELEMENTS.map((element) => ({
          castShape: castShapeOf(element),
          element,
          key: ELEMENT_META[element].key,
          label: ELEMENT_META[element].label
        })),
        pendingCasts: pendingVfxCastCount(),
        viewportReady: isVfxViewportReady()
      });
    }

    case "get_terrain_state": {
      const node = resolveMeshTerrainNode(scene, optionalStr(args, "nodeId"));
      const state = meshTerrainState(node);
      const limit = Math.max(1, Math.floor(optionalNum(args, "maxModifiers") ?? 60));
      const visible = state.modifiers.slice(-limit);

      return ok({
        lodLevels: state.lodLevels,
        materialChannels: state.materialSettings.channels,
        modifierCount: state.modifiers.length,
        modifiers: visible.map(summarizeTerrainModifier),
        name: node.name,
        nodeId: node.id,
        origin: node.transform.position,
        profile: state.profile,
        sectionSizeMeters: state.sectionSize,
        seed: state.seed,
        truncated: state.modifiers.length > visible.length,
        worldSizeMeters: state.worldSize
      });
    }

    // ── Placement ─────────────────────────────────────────────
    case "place_blockout_room": {
      const { command, groupId, nodeIds } = createPlaceBlockoutRoomCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        size: vec3(num(args, "sizeX", 10), num(args, "sizeY", 4), num(args, "sizeZ", 10)),
        openSides: strArray(args, "openSides") as Array<"bottom" | "east" | "north" | "south" | "top" | "west">,
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ groupId, nodeIds });
    }

    case "place_blockout_platform": {
      const { command, nodeId } = createPlaceBlockoutPlatformCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        size: vec3(num(args, "sizeX", 8), num(args, "sizeY", 0.5), num(args, "sizeZ", 8)),
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_blockout_stairs": {
      const { command, groupId, nodeIds, topLandingCenter } = createPlaceBlockoutStairCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        stepCount: num(args, "stepCount", 10),
        stepHeight: num(args, "stepHeight", 0.2),
        treadDepth: num(args, "treadDepth", 0.3),
        width: num(args, "width", 2),
        direction: (str(args, "direction") || "north") as "east" | "north" | "south" | "west",
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ groupId, nodeIds, topLandingCenter });
    }

    case "place_primitive": {
      const role = str(args, "role", "brush") as "brush" | "prop";
      const shape = str(args, "shape", "cube") as "cone" | "cube" | "cylinder" | "sphere";
      const size = vec3(num(args, "sizeX", 2), num(args, "sizeY", shape === "cylinder" || shape === "cone" ? 3 : 2), num(args, "sizeZ", 2));
      const data = createPrimitiveNodeData(role, shape, size);
      const matId = str(args, "materialId");
      if (matId) {
        data.materialId = matId;
      }
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const label = str(args, "name") || createPrimitiveNodeLabel(role, shape);
      const { command, nodeId } = createPlacePrimitiveNodeCommand(scene, transform, { data, name: label });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_brush": {
      const halfX = num(args, "sizeX", 4) * 0.5;
      const halfY = num(args, "sizeY", 3) * 0.5;
      const halfZ = num(args, "sizeZ", 4) * 0.5;
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const brushData = createAxisAlignedBrushFromBounds({
        x: { min: -halfX, max: halfX },
        y: { min: -halfY, max: halfY },
        z: { min: -halfZ, max: halfZ }
      });
      const meshData = convertBrushToEditableMesh(brushData);

      if (!meshData) {
        return fail("Failed to create mesh box");
      }

      const { command, nodeId } = createPlaceMeshNodeCommand(scene, transform, {
        data: meshData,
        name: str(args, "name") || "Mesh Box"
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_light": {
      const lightType = str(args, "type", "point") as "ambient" | "directional" | "hemisphere" | "point" | "spot";
      const data = createDefaultLightData(lightType);
      data.castShadow = false;

      if (args.color && typeof args.color === "string") {
        data.color = args.color;
      }

      if (typeof args.intensity === "number") {
        data.intensity = args.intensity;
      }

      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const label = str(args, "name") || createLightNodeLabel(lightType);
      const { command, nodeId } = createPlaceLightNodeCommand(scene, transform, { data, name: label });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_entity": {
      const entityType = str(args, "type", "player-spawn") as "npc-spawn" | "player-spawn" | "smart-object";
      const entityCount = Array.from(scene.entities.values()).filter((e) => e.type === entityType).length;
      const entity = createDefaultEntity(entityType, vec3(num(args, "x"), num(args, "y"), num(args, "z")), entityCount);

      if (typeof args.rotationY === "number") {
        entity.transform.rotation.y = args.rotationY as number;
      }

      if (str(args, "name")) {
        entity.name = str(args, "name");
      }

      const command = createPlaceEntityCommand(entity);
      editor.execute(command);
      return ok({ entityId: entity.id });
    }

    case "place_player_spawn": {
      const entityCount = Array.from(scene.entities.values()).filter((e) => e.type === "player-spawn").length;
      const entity = createDefaultEntity("player-spawn", vec3(num(args, "x"), num(args, "y"), num(args, "z")), entityCount);

      if (typeof args.rotationY === "number") {
        entity.transform.rotation.y = args.rotationY as number;
      }

      if (str(args, "name")) {
        entity.name = str(args, "name");
      }

      editor.execute(createPlaceEntityCommand(entity));
      return ok({ entityId: entity.id });
    }

    case "place_skatepark_element": {
      const type = str(args, "type") as SkateparkElementType;
      const width = num(args, "width", 4);
      const height = num(args, "height", 2);
      const length = num(args, "length", 4);
      const materialId = str(args, "materialId") || "concrete-smooth";

      // Register material if needed (skateparkMaterials uses IDs like 'concrete-smooth')
      const existingMat = scene.materials.get(materialId);
      if (!existingMat) {
        const skateMat = skateparkMaterials[materialId];
        if (skateMat) {
          editor.execute(createUpsertMaterialCommand(scene, skateMat));
        }
      }

      let meshData: EditableMesh | undefined;
      const segments = 12;

      switch (type) {
        case "quarter-pipe":
          meshData = buildQuarterPipe({ width, height, radius: length, segments, materialId });
          break;
        case "half-pipe":
          meshData = buildHalfPipe({ width, height, flatLength: length * 0.5, radius: length * 0.5, segments, materialId });
          break;
        case "bank":
          meshData = buildBank({ width, height, depth: length, materialId });
          break;
        case "spine":
          meshData = buildSpine({ width, height, radius: length * 0.5, segments, materialId });
          break;
        case "bowl":
          meshData = buildBowl({ radiusX: width * 0.5, radiusZ: length * 0.5, depth: height, segments, materialId });
          break;
        case "fun-box":
          meshData = buildFunBox({ width, height, length, rampLength: 2, materialId });
          break;
        case "ledge":
          meshData = buildLedge({ width, height, length, materialId });
          break;
        case "manual-pad":
          meshData = buildManualPad({ width, height, length, materialId });
          break;
        case "rail":
          meshData = buildRail({ length, railHeight: height, railRadius: 0.1, legCount: Math.ceil(length / 2), materialId });
          break;
        case "stair-set":
          meshData = buildStairSet({ width, stepCount: Math.floor(height / 0.2), stepDepth: 0.3, stepHeight: 0.2, materialId });
          break;
        case "kicker":
          meshData = buildKicker({ width, height, depth: length, materialId });
          break;
        case "pyramid":
          meshData = buildPyramid({ width, height, length, rampLength: 2, materialId });
          break;
        case "hip":
          meshData = buildHip({ radius: length, height, width, segments, materialId });
          break;
        case "hubba-ledge":
          meshData = buildHubbaLedge({ width, height, length, stairHeight: height * 0.5, materialId });
          break;
      }

      if (!meshData) {
        return fail(`Unsupported skatepark element type: ${type}`);
      }

      meshData.role = "prop";

      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      if (typeof args.rotationY === "number") {
        transform.rotation.y = args.rotationY as number;
      }

      const { command, nodeId } = createPlaceMeshNodeCommand(scene, transform, {
        data: meshData,
        name: str(args, "name") || `Skate ${type}`
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_architecture_element": {
      const type = str(args, "type") as "wall" | "slab" | "ceiling" | "roof" | "item";
      const materialId = str(args, "materialId") || `arch-${type === "item" ? "wall" : type}`;

      // Register architecture default material if needed
      const existingMat = scene.materials.get(materialId);
      if (!existingMat) {
        const archMat = architectureMaterials[materialId];
        if (archMat) {
          editor.execute(createUpsertMaterialCommand(scene, archMat));
        }
      }

      let meshData: EditableMesh | undefined;

      switch (type) {
        case "wall":
          meshData = buildWall({
            width: num(args, "width", 4),
            height: num(args, "height", 3),
            thickness: num(args, "thickness", 0.2),
            materialId
          });
          break;
        case "slab":
          meshData = buildSlab({
            width: num(args, "width", 4),
            depth: num(args, "depth", 4),
            thickness: num(args, "thickness", 0.2),
            materialId
          });
          break;
        case "ceiling":
          meshData = buildCeiling({
            width: num(args, "width", 4),
            depth: num(args, "depth", 4),
            thickness: num(args, "thickness", 0.15),
            height: num(args, "height", 3),
            materialId
          });
          break;
        case "roof":
          meshData = buildRoof({
            width: num(args, "width", 4),
            depth: num(args, "depth", 4),
            pitchAngle: num(args, "pitchAngle", 30),
            overhang: num(args, "overhang", 0.3),
            materialId
          });
          break;
        case "item":
          meshData = buildItem({
            itemType: (str(args, "itemType") || "door") as "door" | "window" | "light-fixture",
            width: num(args, "width", 1),
            height: num(args, "height", 2.1),
            materialId
          });
          break;
      }

      if (!meshData) {
        return fail(`Unsupported architecture element type: ${type}`);
      }

      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      if (typeof args.rotationY === "number") {
        transform.rotation.y = args.rotationY as number;
      }

      const typeLabel = type === "item" ? str(args, "itemType", "item") : type;
      const { command, nodeId } = createPlaceMeshNodeCommand(scene, transform, {
        data: meshData,
        name: str(args, "name") || `Architecture: ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}`
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    // ── Transform ─────────────────────────────────────────────
    case "translate_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      const delta = vec3(num(args, "dx"), num(args, "dy"), num(args, "dz"));
      const command = createTranslateNodesCommand(nodeIds, delta);
      editor.execute(command);
      return ok({});
    }

    case "set_node_transform": {
      const nodeId = str(args, "nodeId");
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));

      if (typeof args.rotationX === "number") transform.rotation.x = args.rotationX as number;
      if (typeof args.rotationY === "number") transform.rotation.y = args.rotationY as number;
      if (typeof args.rotationZ === "number") transform.rotation.z = args.rotationZ as number;
      if (typeof args.scaleX === "number") transform.scale.x = args.scaleX as number;
      if (typeof args.scaleY === "number") transform.scale.y = args.scaleY as number;
      if (typeof args.scaleZ === "number") transform.scale.z = args.scaleZ as number;

      const command = createSetNodeTransformCommand(scene, nodeId, transform);
      editor.execute(command);
      return ok({});
    }

    case "duplicate_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      const offset = vec3(num(args, "offsetX"), num(args, "offsetY"), num(args, "offsetZ"));
      const { command, duplicateIds } = createDuplicateNodesCommand(scene, nodeIds, offset);
      editor.execute(command);
      return ok({ duplicateIds });
    }

    case "mirror_nodes": {
      const command = createMirrorNodesCommand(strArray(args, "nodeIds"), str(args, "axis", "x") as "x" | "y" | "z");
      editor.execute(command);
      return ok({});
    }

    case "delete_nodes": {
      const command = createDeleteSelectionCommand(scene, strArray(args, "ids"));
      editor.execute(command);
      return ok({});
    }

    // ── Brush ─────────────────────────────────────────────────
    case "split_brush": {
      const { command, splitIds } = createSplitBrushNodesCommand(
        scene,
        strArray(args, "nodeIds"),
        str(args, "axis", "x") as "x" | "y" | "z"
      );
      editor.execute(command);
      return ok({ splitIds });
    }

    case "extrude_brush": {
      const command = createExtrudeBrushNodesCommand(
        scene,
        strArray(args, "nodeIds"),
        str(args, "axis", "y") as "x" | "y" | "z",
        num(args, "amount", 1),
        (String(args.direction ?? "1") === "-1" ? -1 : 1) as -1 | 1
      );
      editor.execute(command);
      return ok({});
    }

    case "offset_brush_face": {
      const command = createOffsetBrushFaceCommand(
        scene,
        str(args, "nodeId"),
        str(args, "axis", "y") as "x" | "y" | "z",
        str(args, "side", "max") as "max" | "min",
        num(args, "amount")
      );
      editor.execute(command);
      return ok({});
    }

    case "assign_material_to_brushes": {
      const command = createAssignMaterialToBrushesCommand(scene, strArray(args, "nodeIds"), str(args, "materialId"));
      editor.execute(command);
      return ok({});
    }

    // ── Materials ─────────────────────────────────────────────
    case "create_material": {
      const materialName = str(args, "name", "Custom Material");
      const slug = materialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const id = str(args, "id") || `material:custom:${slug}`;
      const material: Material = {
        id,
        name: materialName,
        color: str(args, "color", "#808080"),
        category: (str(args, "category") || "custom") as "blockout" | "custom" | "flat",
        metalness: num(args, "metalness", 0),
        roughness: num(args, "roughness", 0.8)
      };
      const command = createUpsertMaterialCommand(scene, material);
      editor.execute(command);
      return ok({ materialId: id });
    }

    case "assign_material": {
      const targets = (args.targets as Array<{ nodeId: string; faceIds?: string[] }>) ?? [];
      const materialId = str(args, "materialId");
      const command = createAssignMaterialCommand(scene, targets, materialId);
      editor.execute(command);
      return ok({});
    }

    case "set_uv_scale": {
      const targets = (args.targets as Array<{ nodeId: string; faceIds?: string[] }>) ?? [];
      const uvScale = { x: num(args, "scaleX", 1), y: num(args, "scaleY", 1) };
      const command = createSetUvScaleCommand(scene, targets, uvScale);
      editor.execute(command);
      return ok({});
    }

    // ── Scene management ──────────────────────────────────────
    case "group_nodes": {
      const result = createGroupSelectionCommand(scene, strArray(args, "ids"));

      if (!result) {
        return fail("No valid nodes to group");
      }

      editor.execute(result.command);
      return ok({ groupId: result.groupId });
    }

    case "select_nodes": {
      editor.select(strArray(args, "ids"), "object");
      return ok({});
    }

    case "clear_selection": {
      editor.clearSelection();
      return ok({});
    }

    case "undo": {
      editor.undo();
      return ok({});
    }

    case "set_scene_settings": {
      const current = scene.settings;
      const next: SceneSettings = structuredClone(current);

      if (typeof args.gravityX === "number" || typeof args.gravityY === "number" || typeof args.gravityZ === "number") {
        next.world.gravity = vec3(
          num(args, "gravityX", current.world.gravity.x),
          num(args, "gravityY", current.world.gravity.y),
          num(args, "gravityZ", current.world.gravity.z)
        );
      }

      if (typeof args.physicsEnabled === "boolean") next.world.physicsEnabled = args.physicsEnabled;
      if (typeof args.ambientColor === "string") next.world.ambientColor = args.ambientColor as string;
      if (typeof args.ambientIntensity === "number") next.world.ambientIntensity = args.ambientIntensity;
      if (typeof args.fogColor === "string") next.world.fogColor = args.fogColor as string;
      if (typeof args.fogNear === "number") next.world.fogNear = args.fogNear;
      if (typeof args.fogFar === "number") next.world.fogFar = args.fogFar;

      if (typeof args.skyboxEnabled === "boolean") next.world.skybox.enabled = args.skyboxEnabled;
      if (typeof args.skyboxSource === "string") next.world.skybox.source = args.skyboxSource;
      if (args.skyboxFormat === "hdr" || args.skyboxFormat === "image") {
        next.world.skybox.format = args.skyboxFormat;
      }
      if (typeof args.skyboxName === "string") next.world.skybox.name = args.skyboxName;
      if (typeof args.skyboxIntensity === "number") next.world.skybox.intensity = args.skyboxIntensity;
      if (typeof args.skyboxLightingIntensity === "number") {
        next.world.skybox.lightingIntensity = args.skyboxLightingIntensity;
      }
      if (typeof args.skyboxBlur === "number") next.world.skybox.blur = args.skyboxBlur;
      if (typeof args.skyboxAffectsLighting === "boolean") {
        next.world.skybox.affectsLighting = args.skyboxAffectsLighting;
      }

      if (typeof args.grassEnabled === "boolean") next.world.grass.enabled = args.grassEnabled;
      if (typeof args.grassWindSpeed === "number") next.world.grass.windSpeed = args.grassWindSpeed;
      if (typeof args.grassWindStrength === "number") next.world.grass.windStrength = args.grassWindStrength;

      if (typeof args.cameraMode === "string") next.player.cameraMode = args.cameraMode as "fps" | "third-person" | "top-down";
      if (typeof args.playerHeight === "number") next.player.height = args.playerHeight;
      if (typeof args.movementSpeed === "number") next.player.movementSpeed = args.movementSpeed;
      if (typeof args.jumpHeight === "number") next.player.jumpHeight = args.jumpHeight;

      const command = createSetSceneSettingsCommand(scene, next);
      editor.execute(command);
      return ok({});
    }

    case "push_scene_to_connected_game": {
      if (!context.requestScenePush) {
        return fail("Editor-to-game sync is unavailable in this session.");
      }

      context.requestScenePush({
        forceSwitch: bool(args, "forceSwitch") ?? true,
        gameId: str(args, "gameId") || undefined,
        projectName: str(args, "projectName") || undefined,
        projectSlug: str(args, "projectSlug") || undefined
      });
      return ok({ queued: true });
    }

    // ── Read-only queries ─────────────────────────────────────
    case "create_articulated_asset": {
      const request = buildArticraftMaterializeRequest(args);
      if (typeof request === "string") {
        return fail(request);
      }

      const materialized = await materializeArticraftAsset(request);
      const build = buildArticraftEngineAsset(scene, args, materialized);
      if (typeof build === "string") {
        return fail(build);
      }

      editor.execute(createArticulatedAssetCommand(scene, build));
      return ok({
        assetNodeId: build.rootId,
        engine: "articraft",
        jointCount: build.jointRecords.length,
        modelPath: materialized.modelPath,
        materialIds: build.materials.map((material) => material.id),
        nodeIds: build.nodes.map((node) => node.id),
        partCount: build.partRecords.length,
        partNodeIds: build.partRecords.map((part) => ({ nodeId: part.nodeId, partId: part.id })),
        urdfPath: materialized.urdfPath,
        warnings: materialized.warnings
      });
    }

    case "pose_articulated_joint": {
      const payload = getArticulatedAssetPayload(scene, str(args, "assetNodeId"));
      if (!payload) {
        return fail("Articulated asset root not found.");
      }

      const requestedJointId = str(args, "jointId");
      const joint = payload.joints.find((candidate) => candidate.id === requestedJointId || candidate.name === requestedJointId);
      if (!joint) {
        return fail("Joint not found on articulated asset.");
      }

      const childNodeId = joint.childNodeId ?? payload.parts.find((part) => part.id === joint.childPartId)?.nodeId;
      const childNode = childNodeId ? scene.getNode(childNodeId) : undefined;
      if (!childNode) {
        return fail("Joint child part node not found.");
      }

      const baseTransform = parseMetadataJson<Transform>(
        childNode.metadata?.[ARTICULATED_METADATA.baseTransform],
        structuredClone(childNode.transform)
      );
      const unclampedValue = num(args, "value");
      const shouldClamp = bool(args, "clampToLimits") ?? true;
      const value = shouldClamp && joint.type !== "continuous"
        ? Math.min(joint.upper ?? unclampedValue, Math.max(joint.lower ?? unclampedValue, unclampedValue))
        : unclampedValue;
      const nextTransform = structuredClone(baseTransform);

      if (joint.type === "revolute" || joint.type === "continuous") {
        nextTransform.rotation = rotationWithAxisOffset(baseTransform.rotation, normalizeAxis(joint.axis), value);
      } else if (joint.type === "prismatic") {
        const axis = normalizeAxis(joint.axis);
        nextTransform.position = vec3(
          baseTransform.position.x + axis.x * value,
          baseTransform.position.y + axis.y * value,
          baseTransform.position.z + axis.z * value
        );
      }

      const nextPose = {
        ...payload.pose,
        [joint.id]: value
      };
      const beforeRoot = structuredClone(payload.root);
      const beforeChild = structuredClone(childNode);
      const nextRoot: GroupNode = {
        ...structuredClone(payload.root),
        metadata: {
          ...(payload.root.metadata ?? {}),
          [ARTICULATED_METADATA.pose]: jsonMetadata(nextPose)
        }
      };
      const nextChild: GeometryNode = {
        ...structuredClone(childNode),
        transform: nextTransform
      };

      editor.execute({
        label: "pose articulated joint",
        execute(nextScene) {
          nextScene.addNode(structuredClone(nextRoot));
          nextScene.addNode(structuredClone(nextChild));
        },
        undo(nextScene) {
          nextScene.addNode(structuredClone(beforeRoot));
          nextScene.addNode(structuredClone(beforeChild));
        }
      });

      return ok({
        assetNodeId: payload.root.id,
        childNodeId: childNode.id,
        jointId: joint.id,
        value
      });
    }

    case "list_nodes": {
      return JSON.stringify(buildSceneOutline(editor).outline);
    }

    case "list_entities": {
      const entities = Array.from(scene.entities.values()).map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        parentId: e.parentId ?? null
      }));
      return JSON.stringify({ entities });
    }

    case "list_materials": {
      const materials = Array.from(scene.materials.values()).map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        category: m.category
      }));
      return JSON.stringify({ materials });
    }

    case "list_scene_paths": {
      return JSON.stringify({ paths: scene.settings.paths ?? [] });
    }

    case "list_scene_events": {
      return JSON.stringify({ events: resolveGameplayEvents(scene.settings.events ?? []) });
    }

    case "list_hook_types": {
      return JSON.stringify({ hookTypes: buildHookCatalog() });
    }

    case "list_articulated_assets": {
      const assets = Array.from(scene.nodes.values())
        .filter(isArticulatedAssetNode)
        .map((root) => {
          const payload = getArticulatedAssetPayload(scene, root.id);
          return {
            id: root.id,
            jointCount: payload?.joints.length ?? 0,
            name: root.name,
            partCount: payload?.parts.length ?? 0,
            pose: payload?.pose ?? {},
            transform: root.transform
          };
        });
      return JSON.stringify({ assets });
    }

    case "get_articulated_asset_details": {
      const payload = getArticulatedAssetPayload(scene, str(args, "assetNodeId"));
      if (!payload) {
        return fail("Articulated asset root not found.");
      }

      return JSON.stringify({
        id: payload.root.id,
        joints: payload.joints,
        name: payload.root.name,
        nodes: payload.parts.map((part) => {
          const node = scene.getNode(part.nodeId);
          return {
            data: node?.data,
            id: part.nodeId,
            metadata: node?.metadata,
            name: node?.name,
            parentId: node?.parentId ?? null,
            partId: part.id,
            transform: node?.transform
          };
        }),
        parts: payload.parts,
        pose: payload.pose,
        rootMetadata: payload.root.metadata,
        transform: payload.root.transform
      });
    }

    case "get_node_details": {
      const node = scene.getNode(str(args, "nodeId"));

      if (!node) {
        return fail("Node not found");
      }

      const { graph } = buildSceneOutline(editor);

      return JSON.stringify({
        id: node.id,
        name: node.name,
        kind: node.kind,
        parentId: node.parentId ?? null,
        childIds: graph.nodeChildrenByParentId.get(node.id) ?? [],
        attachedEntityIds: graph.entityChildrenByParentId.get(node.id) ?? [],
        transform: node.transform,
        worldTransform: graph.nodeWorldTransforms.get(node.id) ?? node.transform,
        tags: node.tags,
        metadata: node.metadata,
        hooks: node.hooks,
        data: node.data
      });
    }

    case "get_entity_details": {
      const entity = scene.getEntity(str(args, "entityId"));

      if (!entity) {
        return fail("Entity not found");
      }

      const { graph } = buildSceneOutline(editor);

      return JSON.stringify({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        parentId: entity.parentId ?? null,
        transform: entity.transform,
        worldTransform: graph.entityWorldTransforms.get(entity.id) ?? entity.transform,
        properties: entity.properties,
        hooks: entity.hooks
      });
    }

    case "get_scene_settings": {
      return JSON.stringify(scene.settings);
    }

    case "create_scene_path": {
      const currentPaths = scene.settings.paths ?? [];
      const points = pointArray(args.points);

      if (points.length === 0) {
        return fail("Path must include at least one valid point");
      }

      const nextPath: ScenePathDefinition = {
        id: resolvePathId(currentPaths, str(args, "id"), str(args, "name")),
        loop: bool(args, "loop") ?? false,
        name: str(args, "name", "Path"),
        points
      };
      const nextSettings: SceneSettings = {
        ...structuredClone(scene.settings),
        paths: [...currentPaths, nextPath]
      };
      editor.execute(createSetSceneSettingsCommand(scene, nextSettings));
      return ok({ path: nextPath });
    }

    case "update_scene_path": {
      const pathId = str(args, "pathId");
      const currentPaths = scene.settings.paths ?? [];
      const existingPath = currentPaths.find((pathDefinition) => pathDefinition.id === pathId);

      if (!existingPath) {
        return fail("Path not found");
      }

      const nextPoints = Array.isArray(args.points) ? pointArray(args.points) : undefined;

      if (Array.isArray(args.points) && (nextPoints?.length ?? 0) === 0) {
        return fail("Path must include at least one valid point");
      }

      const nextPath: ScenePathDefinition = {
        ...structuredClone(existingPath),
        ...(str(args, "name") ? { name: str(args, "name") } : {}),
        ...(typeof args.loop === "boolean" ? { loop: args.loop as boolean } : {}),
        ...(nextPoints ? { points: nextPoints } : {})
      };
      const nextSettings: SceneSettings = {
        ...structuredClone(scene.settings),
        paths: currentPaths.map((pathDefinition) => (pathDefinition.id === pathId ? nextPath : pathDefinition))
      };
      editor.execute(createSetSceneSettingsCommand(scene, nextSettings));
      return ok({ path: nextPath });
    }

    case "delete_scene_path": {
      const pathId = str(args, "pathId");
      const currentPaths = scene.settings.paths ?? [];

      if (!currentPaths.some((pathDefinition) => pathDefinition.id === pathId)) {
        return fail("Path not found");
      }

      const nextSettings: SceneSettings = {
        ...structuredClone(scene.settings),
        paths: currentPaths.filter((pathDefinition) => pathDefinition.id !== pathId)
      };
      editor.execute(createSetSceneSettingsCommand(scene, nextSettings));
      return ok({ pathId });
    }

    case "add_hook": {
      const targetKind = str(args, "targetKind") as "entity" | "node";
      const targetId = str(args, "targetId");
      const hookType = str(args, "hookType");
      const hook = createSceneHook(hookType, {
        defaultPathId: str(args, "defaultPathId") || undefined,
        targetId
      });

      if (!hook) {
        return fail("Unknown hook type");
      }

      const configPatch = gameplayObject(args.config);
      if (configPatch) {
        hook.config = mergeGameplayObject(hook.config, configPatch);
      }

      if (typeof args.enabled === "boolean") {
        hook.enabled = args.enabled as boolean;
      }

      return updateHooksOnTarget(editor, targetKind, targetId, (hooks) => ({
        hooks: [...hooks, hook],
        result: { hook, hookId: hook.id, targetId, targetKind }
      }));
    }

    case "set_hook_value": {
      const targetKind = str(args, "targetKind") as "entity" | "node";
      const targetId = str(args, "targetId");
      const hookId = str(args, "hookId");
      const path = str(args, "path");

      return updateHooksOnTarget(editor, targetKind, targetId, (hooks) => {
        const hookIndex = hooks.findIndex((hook) => hook.id === hookId);

        if (hookIndex === -1) {
          throw new Error("Hook not found");
        }

        const nextHooks = structuredClone(hooks);
        const nextHook = structuredClone(nextHooks[hookIndex]);
        nextHook.config = setGameplayValue(nextHook.config, path, structuredClone(args.value) as GameplayValue);
        nextHooks[hookIndex] = nextHook;

        return {
          hooks: nextHooks,
          result: { hook: nextHook, hookId, path, targetId, targetKind }
        };
      });
    }

    case "remove_hook": {
      const targetKind = str(args, "targetKind") as "entity" | "node";
      const targetId = str(args, "targetId");
      const hookId = str(args, "hookId");

      return updateHooksOnTarget(editor, targetKind, targetId, (hooks) => {
        if (!hooks.some((hook) => hook.id === hookId)) {
          throw new Error("Hook not found");
        }

        return {
          hooks: hooks.filter((hook) => hook.id !== hookId),
          result: { hookId, targetId, targetKind }
        };
      });
    }

    // ── Mesh topology query ─────────────────────────────────
    case "list_behavior_trees": {
      return ok({ trees: listBehaviorTrees() });
    }

    case "get_behavior_tree": {
      const tree = loadBehaviorTreeOrFail(str(args, "treeId"));
      if (!tree) {
        return fail("Behavior tree not found.");
      }

      return ok({ tree });
    }

    case "create_behavior_tree": {
      const name = str(args, "name", "New Tree");
      const treeId = slugifyBehaviorTreeId(optionalStr(args, "treeId") || name);

      if (loadBehaviorTreeOrFail(treeId)) {
        return fail("Behavior tree id already exists.");
      }

      const useDefaultTemplate = bool(args, "useDefaultTemplate") ?? false;
      const tree: BehaviorTree = useDefaultTemplate
        ? { ...makeDefaultBehaviorTree(), id: treeId, name }
        : {
            id: treeId,
            name,
            nodes: [
              createBehaviorTreeNode("root", {
                position: { x: 0, y: 0 }
              })
            ],
            edges: []
          };

      return saveBehaviorTreeResult(tree, { created: true });
    }

    case "add_behavior_tree_node": {
      const tree = loadBehaviorTreeOrFail(str(args, "treeId"));
      if (!tree) {
        return fail("Behavior tree not found.");
      }

      const nodeType = str(args, "nodeType") as BtNodeType;
      const knownTypes: BtNodeType[] = [
        "root",
        "selector",
        "sequence",
        "parallel",
        "inverter",
        "repeater",
        "condition",
        "action"
      ];

      if (!knownTypes.includes(nodeType)) {
        return fail("Unsupported behavior tree node type.");
      }

      if (nodeType === "root" && tree.nodes.some((node) => node.data.btType === "root")) {
        return fail("Behavior trees can only have one root node.");
      }

      const mode = optionalStr(args, "mode");
      const node = createBehaviorTreeNode(
        nodeType,
        {
          position: {
            x: optionalNum(args, "positionX") ?? 120,
            y: optionalNum(args, "positionY") ?? 160
          }
        },
        {
          ...(optionalStr(args, "label") !== undefined ? { label: str(args, "label") } : {}),
          ...(optionalStr(args, "event") !== undefined ? { event: str(args, "event") } : {}),
          ...(mode === "allOf" || mode === "anyOf" ? { mode } : {}),
          ...(optionalStr(args, "actionType") !== undefined ? { actionType: str(args, "actionType") } : {}),
          ...(optionalStr(args, "actionTarget") !== undefined ? { actionTarget: str(args, "actionTarget") } : {}),
          ...(optionalStr(args, "actionValue") !== undefined ? { actionValue: str(args, "actionValue") } : {}),
          ...(optionalNum(args, "count") !== undefined ? { count: num(args, "count") } : {})
        }
      );

      const nextTree: BehaviorTree = {
        ...tree,
        nodes: [...tree.nodes, node]
      };

      const parentNodeId = optionalStr(args, "parentNodeId");
      if (parentNodeId) {
        if (!tree.nodes.some((candidate) => candidate.id === parentNodeId)) {
          return fail("Parent behavior tree node not found.");
        }

        nextTree.edges = [
          ...nextTree.edges,
          {
            id: `${parentNodeId}-${node.id}-${Date.now()}`,
            source: parentNodeId,
            target: node.id
          }
        ];
      }

      return saveBehaviorTreeResult(nextTree, { nodeId: node.id });
    }

    case "update_behavior_tree_node": {
      const tree = loadBehaviorTreeOrFail(str(args, "treeId"));
      if (!tree) {
        return fail("Behavior tree not found.");
      }

      const nodeId = str(args, "nodeId");
      const nextTree = updateBehaviorTreeNodeData(tree, nodeId, args);
      if (!nextTree) {
        return fail("Behavior tree node not found.");
      }

      return saveBehaviorTreeResult(nextTree, { nodeId, updated: true });
    }

    case "connect_behavior_tree_nodes": {
      const tree = loadBehaviorTreeOrFail(str(args, "treeId"));
      if (!tree) {
        return fail("Behavior tree not found.");
      }

      const sourceNodeId = str(args, "sourceNodeId");
      const targetNodeId = str(args, "targetNodeId");

      if (!tree.nodes.some((node) => node.id === sourceNodeId)) {
        return fail("Source behavior tree node not found.");
      }

      if (!tree.nodes.some((node) => node.id === targetNodeId)) {
        return fail("Target behavior tree node not found.");
      }

      if (tree.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
        return fail("Behavior tree edge already exists.");
      }

      const nextTree: BehaviorTree = {
        ...tree,
        edges: [
          ...tree.edges,
          {
            id: `${sourceNodeId}-${targetNodeId}-${Date.now()}`,
            source: sourceNodeId,
            target: targetNodeId
          }
        ]
      };

      return saveBehaviorTreeResult(nextTree, { sourceNodeId, targetNodeId });
    }

    case "delete_behavior_tree_node": {
      const tree = loadBehaviorTreeOrFail(str(args, "treeId"));
      if (!tree) {
        return fail("Behavior tree not found.");
      }

      const nodeId = str(args, "nodeId");
      if (!tree.nodes.some((node) => node.id === nodeId)) {
        return fail("Behavior tree node not found.");
      }

      const nextTree: BehaviorTree = {
        ...tree,
        nodes: tree.nodes.filter((node) => node.id !== nodeId),
        edges: tree.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      };

      return saveBehaviorTreeResult(nextTree, { deletedNodeId: nodeId });
    }

    case "apply_behavior_tree_layout": {
      const tree = loadBehaviorTreeOrFail(str(args, "treeId"));
      if (!tree) {
        return fail("Behavior tree not found.");
      }

      return saveBehaviorTreeResult(layoutBehaviorTree(tree), { laidOut: true });
    }

    case "delete_behavior_tree": {
      const treeId = str(args, "treeId");
      if (!loadBehaviorTreeOrFail(treeId)) {
        return fail("Behavior tree not found.");
      }

      deleteBehaviorTree(treeId);
      return ok({ deleted: true, treeId });
    }

    case "get_mesh_topology": {
      const node = scene.getNode(str(args, "nodeId"));

      if (!node || !isMeshNode(node)) {
        return fail("Node is not a mesh");
      }

      const mesh = node.data;
      const faces = mesh.faces.map((f) => {
        const vIds: string[] = [];
        let he = mesh.halfEdges.find((h) => h.id === f.halfEdge);

        if (he) {
          const startId = he.id;
          do {
            vIds.push(he!.vertex);
            he = mesh.halfEdges.find((h) => h.id === he!.next);
          } while (he && he.id !== startId);
        }

        const faceVertices = getFaceVertices(mesh, f.id);
        const center = faceVertices.reduce(
          (acc, vertex) => ({
            x: acc.x + vertex.position.x,
            y: acc.y + vertex.position.y,
            z: acc.z + vertex.position.z
          }),
          { x: 0, y: 0, z: 0 }
        );
        const normal = faceVertices.length >= 3
          ? computePolygonNormal(faceVertices.map((vertex) => vertex.position))
          : vec3(0, 0, 0);
        const vertexCount = faceVertices.length || 1;

        return {
          id: f.id,
          vertexIds: vIds,
          materialId: f.materialId,
          center: {
            x: center.x / vertexCount,
            y: center.y / vertexCount,
            z: center.z / vertexCount
          },
          normal
        };
      });

      const vertices = mesh.vertices.map((v) => ({
        id: v.id,
        position: v.position
      }));

      const edgeSet = new Set<string>();
      const edges: [string, string][] = [];

      for (const he of mesh.halfEdges) {
        const twin = he.twin ? mesh.halfEdges.find((h) => h.id === he.twin) : undefined;

        if (twin) {
          const key = [he.vertex, twin.vertex].sort().join(":");

          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push([he.vertex, twin.vertex]);
          }
        }
      }

      return JSON.stringify({ faces, vertices, edges });
    }

    // ── Mesh editing ──────────────────────────────────────────
    case "extrude_mesh_faces":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        extrudeEditableMeshFaces(mesh, strArray(args, "faceIds"), num(args, "amount")),
        "Extrude faces"
      );

    case "extrude_mesh_edge":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        extrudeEditableMeshEdge(mesh, [str(args, "vertexId1"), str(args, "vertexId2")], num(args, "amount")),
        "Extrude edge"
      );

      case "bevel_mesh_edges": {
        const edges = (args.edges as string[][] ?? []).map((e) => [e[0], e[1]] as [string, string]);
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          bevelEditableMeshEdges(mesh, edges, num(args, "width"), num(args, "steps", 1),
            (str(args, "profile") || "flat") as "flat" | "round"),
          "Bevel edges"
        );
      }

      case "inset_mesh_faces":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          insetEditableMeshFaces(mesh, strArray(args, "faceIds"), num(args, "amount", 0.1)),
          "Inset faces"
        );

      case "bridge_mesh_edges": {
        const edges = (args.edges as string[][] ?? []).map((edge) => [edge[0], edge[1]] as [string, string]);
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          bridgeEditableMeshEdges(mesh, edges),
          "Bridge edges"
        );
      }

      case "poke_mesh_faces":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          pokeEditableMeshFaces(mesh, strArray(args, "faceIds")),
          "Poke faces"
        );

      case "triangulate_mesh_faces":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          triangulateEditableMeshFaces(mesh, strArray(args, "faceIds").length > 0 ? strArray(args, "faceIds") : undefined),
          "Triangulate faces"
        );

      case "quadrangulate_mesh_faces":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          quadrangulateEditableMeshFaces(mesh, strArray(args, "faceIds")),
          "Quadrangulate faces"
        );

      case "solidify_mesh":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          solidifyEditableMesh(mesh, num(args, "thickness", 0.2)),
          "Solidify mesh"
        );

      case "mirror_mesh":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          mirrorEditableMesh(mesh, str(args, "axis", "x") as "x" | "y" | "z"),
          "Mirror mesh"
        );

      case "weld_mesh_vertices_by_distance":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          weldEditableMeshVerticesByDistance(
            mesh,
            num(args, "distance", 0.01),
            strArray(args, "vertexIds").length > 0 ? strArray(args, "vertexIds") : undefined
          ),
          "Weld vertices by distance"
        );

      case "weld_mesh_vertices_to_target":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          weldEditableMeshVerticesToTarget(mesh, str(args, "targetVertexId"), strArray(args, "sourceVertexIds")),
          "Target weld vertices"
        );

      case "subdivide_mesh_face":
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          subdivideEditableMeshFace(mesh, str(args, "faceId"), num(args, "cuts", 1)),
          "Subdivide face"
      );

    case "cut_mesh_face":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        cutEditableMeshFace(mesh, str(args, "faceId"),
          vec3(num(args, "pointX"), num(args, "pointY"), num(args, "pointZ")),
          num(args, "snapSize", 1)),
        "Cut face"
      );

    case "cut_mesh_between_edges": {
      const edges = (args.edges as string[][] ?? []).map((edge) => [edge[0], edge[1]] as [string, string]);
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        cutEditableMeshBetweenEdges(mesh, edges),
        "Cut between edges"
      );
    }

    case "delete_mesh_faces":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        deleteEditableMeshFaces(mesh, strArray(args, "faceIds")),
        "Delete faces"
      );

    case "merge_mesh_faces":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        mergeEditableMeshFaces(mesh, strArray(args, "faceIds")),
        "Merge faces"
      );

    case "merge_mesh_vertices":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        mergeEditableMeshVertices(mesh, strArray(args, "vertexIds")),
        "Merge vertices"
      );

    case "translate_mesh_vertices":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        translateEditableMeshVertices(
          mesh,
          strArray(args, "vertexIds"),
          vec3(num(args, "offsetX"), num(args, "offsetY"), num(args, "offsetZ"))
        ),
        "Translate vertices"
      );

    case "scale_mesh_vertices": {
      const hasPivot = ["pivotX", "pivotY", "pivotZ"].some((key) => typeof args[key] === "number");
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        scaleEditableMeshVertices(
          mesh,
          strArray(args, "vertexIds"),
          vec3(num(args, "scaleX", 1), num(args, "scaleY", 1), num(args, "scaleZ", 1)),
          hasPivot ? vec3(num(args, "pivotX"), num(args, "pivotY"), num(args, "pivotZ")) : undefined
        ),
        "Scale vertices"
      );
    }

    case "fill_mesh_face":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        fillEditableMeshFaceFromVertices(mesh, strArray(args, "vertexIds")),
        "Fill face"
      );

    case "invert_mesh_normals":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        invertEditableMeshNormals(mesh, strArray(args, "faceIds").length > 0 ? strArray(args, "faceIds") : undefined),
        "Invert normals"
      );

    case "arc_mesh_edges": {
      const arcEdges = (args.edges as string[][] ?? []).map((e) => [e[0], e[1]] as [string, string]);
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        arcEditableMeshEdges(mesh, arcEdges, num(args, "offset"), num(args, "segments", 2)),
        "Arc edges"
      );
    }

    case "inflate_mesh": {
      const command = createMeshInflateCommand(scene, strArray(args, "nodeIds"), num(args, "factor"));
      editor.execute(command);
      return ok({});
    }

    case "convert_brush_to_mesh": {
      const nodeId = str(args, "nodeId");
      const node = scene.getNode(nodeId);

      if (!node || !isBrushNode(node)) {
        return fail("Node is not a brush");
      }

      const meshData = convertBrushToEditableMesh(node.data);

      if (!meshData) {
        return fail("Failed to convert brush to mesh");
      }

      const meshNode = {
        ...structuredClone(node),
        kind: "mesh" as const,
        data: meshData
      };

      const command = createReplaceNodesCommand(scene, [meshNode], "convert brush to mesh");
      editor.execute(command);
      return ok({ nodeId });
    }

    case "capture_mesh_modeling_base":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) =>
        captureEditableMeshModelingBase(mesh),
        "Capture mesh modeling base"
      );

    case "rebuild_mesh_modeling_stack":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) =>
        applyEditableMeshModeling(initializeEditableMeshModeling(mesh)),
        "Rebuild mesh modeling stack"
      );

    case "add_mesh_modeling_modifier":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const modifier = createCopilotModelingModifier(args, modeling.modifiers?.length ?? 0);

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          modifiers: [...(modeling.modifiers ?? []), modifier]
        });
      }, "Add mesh modeling modifier");

    case "update_mesh_modeling_modifier":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const modifierId = str(args, "modifierId");
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const modifiers = modeling.modifiers ?? [];

        if (!modifiers.some((modifier) => modifier.id === modifierId)) {
          throw new Error("Modifier not found");
        }

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          modifiers: modifiers.map((modifier) =>
            modifier.id === modifierId ? patchCopilotModelingModifier(modifier, args) : modifier
          )
        });
      }, "Update mesh modeling modifier");

    case "remove_mesh_modeling_modifier":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const modifierId = str(args, "modifierId");
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const modifiers = modeling.modifiers ?? [];

        if (!modifiers.some((modifier) => modifier.id === modifierId)) {
          throw new Error("Modifier not found");
        }

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          modifiers: modifiers.filter((modifier) => modifier.id !== modifierId)
        });
      }, "Remove mesh modeling modifier");

    case "set_mesh_symmetry":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          symmetry: {
            axis: (str(args, "axis", modeling.symmetry?.axis ?? "x") || "x") as "x" | "y" | "z",
            enabled: bool(args, "enabled") ?? modeling.symmetry?.enabled ?? true,
            weld: bool(args, "weld") ?? modeling.symmetry?.weld ?? true
          }
        });
      }, "Set mesh symmetry");

    case "create_mesh_polygroup": {
      const faceIds = uniqueStrings(strArray(args, "faceIds"));

      if (faceIds.length === 0) {
        return fail("faceIds is required");
      }

      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const index = modeling.polyGroups?.length ?? 0;
        const group: MeshPolyGroup = {
          color: str(args, "color") || MODELING_GROUP_COLORS[index % MODELING_GROUP_COLORS.length],
          faceIds,
          id: str(args, "groupId") || `polygroup:${Date.now()}:${index}`,
          name: str(args, "name") || `PolyGroup ${index + 1}`
        };

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          polyGroups: [...(modeling.polyGroups ?? []), group]
        });
      }, "Create mesh PolyGroup");
    }

    case "assign_faces_to_mesh_polygroup": {
      const groupId = str(args, "groupId");
      const faceIds = uniqueStrings(strArray(args, "faceIds"));

      if (!groupId || faceIds.length === 0) {
        return fail("groupId and faceIds are required");
      }

      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const groups = modeling.polyGroups ?? [];

        if (!groups.some((group) => group.id === groupId)) {
          throw new Error("PolyGroup not found");
        }

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          polyGroups: groups.map((group) =>
            group.id === groupId
              ? { ...group, faceIds: uniqueStrings([...group.faceIds, ...faceIds]) }
              : group
          )
        });
      }, "Assign faces to mesh PolyGroup");
    }

    case "create_mesh_smoothing_group": {
      const faceIds = uniqueStrings(strArray(args, "faceIds"));

      if (faceIds.length === 0) {
        return fail("faceIds is required");
      }

      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const index = modeling.smoothingGroups?.length ?? 0;
        const group: MeshSmoothingGroup = {
          angle: num(args, "angle", 45),
          faceIds,
          id: str(args, "groupId") || `smoothing:${Date.now()}:${index}`,
          name: str(args, "name") || `Smooth ${index + 1}`
        };

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          smoothingGroups: [...(modeling.smoothingGroups ?? []), group]
        });
      }, "Create mesh smoothing group");
    }

    case "set_mesh_lod_profiles":
      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const baseFaceCount = modeling.baseTopology?.faces.length ?? mesh.faces.length;
        const ratioValues = Array.isArray(args.ratios)
          ? args.ratios.filter((value): value is number => typeof value === "number")
          : [];
        const profileRecords = recordArray(args, "profiles");
        const profileInputs: Record<string, unknown>[] = profileRecords.length > 0
          ? profileRecords
          : (ratioValues.length > 0 ? ratioValues : [0.7, 0.4, 0.18]).map((ratio, index) => ({ ratio, name: `LOD ${index + 1}` }));
        const lods: MeshLodProfile[] = profileInputs.map((profile, index) => {
          const ratio = typeof profile.ratio === "number" ? profile.ratio : 0.5;
          const faceCount = typeof profile.faceCount === "number"
            ? Math.max(1, Math.round(profile.faceCount))
            : Math.max(1, Math.round(baseFaceCount * ratio));

          return {
            faceCount,
            generatedAt: new Date().toISOString(),
            id: typeof profile.id === "string" ? profile.id : `lod:${index + 1}`,
            name: typeof profile.name === "string" ? profile.name : `LOD ${index + 1}`,
            ratio
          };
        });

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          lods
        });
      }, "Set mesh LOD profiles");

    case "queue_mesh_bake_outputs": {
      const kinds = uniqueStrings(strArray(args, "kinds"))
        .filter((kind): kind is MeshBakeMapKind => BAKE_MAP_KINDS.includes(kind as MeshBakeMapKind));

      if (kinds.length === 0) {
        return fail("At least one valid bake kind is required");
      }

      return executeMeshModelingUpdate(editor, str(args, "nodeId"), (mesh) => {
        const prepared = initializeEditableMeshModeling(mesh);
        const modeling = structuredClone(prepared.modeling ?? {});
        const replaceExisting = bool(args, "replaceExisting") ?? true;
        const existing = replaceExisting
          ? (modeling.bakeOutputs ?? []).filter((output) => !kinds.includes(output.kind))
          : (modeling.bakeOutputs ?? []);
        const queued = kinds.map((kind) => ({
          generatedAt: new Date().toISOString(),
          id: `bake:${kind}:${Date.now()}`,
          kind,
          resolution: Math.max(128, Math.round(num(args, "resolution", 2048))),
          sourceGroupId: str(args, "sourceGroupId") || undefined,
          status: "queued" as const
        }));

        return updateEditableMeshModeling(prepared, {
          ...modeling,
          bakeOutputs: [...existing, ...queued]
        });
      }, "Queue mesh bake outputs");
    }

    case "unwrap_mesh_uvs": {
      const mode = str(args, "mode", "smart");

      if (mode === "smart") {
        return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
          smartUnwrapEditableMesh(mesh, {
            angleThresholdDegrees: num(args, "angleThresholdDegrees", 66),
            faceIds: strArray(args, "faceIds"),
            margin: num(args, "margin", 0.02)
          }),
          "Smart unwrap mesh UVs"
        );
      }

      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        projectEditableMeshUvs(mesh, {
          axis: optionalStr(args, "axis") as "x" | "y" | "z" | undefined,
          faceIds: strArray(args, "faceIds"),
          mode: (["box", "cylindrical", "planar"].includes(mode) ? mode : "planar") as "box" | "cylindrical" | "planar",
          offset: vec2(num(args, "offsetU"), num(args, "offsetV")),
          scale: vec2(num(args, "scaleU", 1), num(args, "scaleV", 1))
        }),
        "Project mesh UVs"
      );
    }

    case "pack_mesh_uvs":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        packEditableMeshUvs(mesh, {
          faceIds: strArray(args, "faceIds"),
          margin: num(args, "margin", 0.02)
        }),
        "Pack mesh UVs"
      );

    case "mark_mesh_uv_seams":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        markEditableMeshUvSeams(mesh, edgeArray(args, "edges"), { append: bool(args, "append") ?? true }),
        "Mark mesh UV seams"
      );

    case "normalize_mesh_texel_density":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        normalizeEditableMeshTexelDensity(mesh, {
          faceIds: strArray(args, "faceIds"),
          pixelsPerMeter: num(args, "pixelsPerMeter", 512),
          textureResolution: num(args, "textureResolution", 1024)
        }),
        "Normalize mesh texel density"
      );

    case "paint_mesh_face_material":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        paintEditableMeshFacesMaterial(mesh, strArray(args, "faceIds"), str(args, "materialId")),
        "Paint face material"
      );

    case "paint_mesh_vertex_color":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        paintEditableMeshVertexColors(mesh, strArray(args, "faceIds"), colorFromArgs(args), num(args, "strength", 1)),
        "Paint vertex color"
      );

    case "add_mesh_surface_blend_layer":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) => {
        const materialId = str(args, "materialId");
        const material = materialId ? scene.materials.get(materialId) : undefined;
        return upsertEditableMeshBlendLayer(mesh, {
          color: str(args, "color") || material?.color,
          colorTexture: str(args, "colorTexture") || material?.colorTexture,
          id: str(args, "layerId") || `blend:${materialId || Date.now()}`,
          materialId: materialId || undefined,
          metalness: optionalNum(args, "metalness") ?? material?.metalness,
          metalnessTexture: str(args, "metalnessTexture") || material?.metalnessTexture,
          name: str(args, "name") || material?.name || "Surface Blend",
          normalTexture: str(args, "normalTexture") || material?.normalTexture,
          roughness: optionalNum(args, "roughness") ?? material?.roughness,
          roughnessTexture: str(args, "roughnessTexture") || material?.roughnessTexture
        });
      }, "Add mesh surface blend layer");

    case "paint_mesh_texture_blend":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        paintEditableMeshTextureBlend(mesh, strArray(args, "faceIds"), str(args, "layerId"), num(args, "strength", 1)),
        "Paint texture blend"
      );

    case "add_mesh_projected_decal":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) => {
        const materialId = str(args, "materialId");
        const material = materialId ? scene.materials.get(materialId) : undefined;
        return {
          ...mesh,
          surface: {
            ...(mesh.surface ?? {}),
            decals: [
              ...(mesh.surface?.decals ?? []),
              {
                blendMode: (str(args, "blendMode", "normal") || "normal") as "add" | "multiply" | "normal",
                color: str(args, "color") || material?.color,
                depth: num(args, "depth", 0.25),
                id: str(args, "decalId") || `decal:${Date.now()}`,
                materialId: materialId || undefined,
                name: str(args, "name") || material?.name || "Projected Decal",
                normal: vec3(num(args, "normalX", 0), num(args, "normalY", 1), num(args, "normalZ", 0)),
                opacity: num(args, "opacity", material?.opacity ?? 1),
                position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
                size: vec2(num(args, "sizeX", 1), num(args, "sizeY", 1)),
                targetFaceIds: strArray(args, "faceIds"),
                texture: str(args, "texture") || material?.colorTexture,
                up: vec3(num(args, "upX", 0), num(args, "upY", 1), num(args, "upZ", 0))
              }
            ]
          }
        };
      }, "Add projected decal");

    case "split_brush_at_coordinate": {
      const { command, splitIds } = createSplitBrushNodeAtCoordinateCommand(
        scene,
        str(args, "nodeId"),
        str(args, "axis", "x") as "x" | "y" | "z",
        num(args, "coordinate")
      );
      editor.execute(command);
      return ok({ splitIds });
    }

    case "generate_game_html": {
      const title = str(args, "title", "Generated Game");
      const html = str(args, "html");
      const files = fileBundle(args.files);
      context.onGeneratedGame?.(title, html, files.length > 0 ? files : undefined);
      return ok({ registered: true, title, hasHtml: Boolean(html.trim()), fileCount: files.length });
    }

    case "morphus_list_files":
      return context.morphusListFiles
        ? ok(context.morphusListFiles())
        : fail("Morphus file listing is unavailable in this context.");

    case "morphus_read_file": {
      const path = str(args, "path");
      const startLine = optionalNum(args, "startLine");
      const endLine = optionalNum(args, "endLine");
      const maxChars = optionalNum(args, "maxChars");
      return context.morphusReadFile
        ? ok(context.morphusReadFile(path, { endLine, maxChars, startLine }))
        : fail("Morphus file reading is unavailable in this context.");
    }

    case "morphus_search_files": {
      const query = str(args, "query");
      const maxResults = optionalNum(args, "maxResults");
      const pathGlob = optionalStr(args, "pathGlob");
      const useRegex = bool(args, "useRegex");
      const includeAssets = bool(args, "includeAssets");
      return context.morphusSearchFiles
        ? ok(context.morphusSearchFiles(query, { includeAssets, maxResults, pathGlob, useRegex }))
        : fail("Morphus file search is unavailable in this context.");
    }

    case "morphus_write_file": {
      const path = str(args, "path");
      const content = str(args, "content");
      return context.morphusWriteFile
        ? ok(context.morphusWriteFile(path, content))
        : fail("Morphus file writing is unavailable in this context.");
    }

    case "morphus_create_file": {
      const path = str(args, "path");
      const content = str(args, "content");
      return context.morphusCreateFile
        ? ok(context.morphusCreateFile(path, content))
        : fail("Morphus file creation is unavailable in this context.");
    }

    case "morphus_request_delete_file": {
      const path = str(args, "path");
      const reason = str(args, "reason");
      return context.morphusRequestDeleteFile
        ? ok(context.morphusRequestDeleteFile(path, reason))
        : fail("Morphus delete approval requests are unavailable in this context.");
    }

    case "morphus_request_rename_file": {
      const fromPath = str(args, "fromPath");
      const toPath = str(args, "toPath");
      const reason = str(args, "reason");
      return context.morphusRequestRenameFile
        ? ok(context.morphusRequestRenameFile(fromPath, toPath, reason))
        : fail("Morphus rename approval requests are unavailable in this context.");
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

function executeMeshOp(
  editor: EditorCore,
  nodeId: string,
  op: (mesh: EditableMesh) => EditableMesh | undefined,
  label: string
): string {
  const node = editor.scene.getNode(nodeId);

  if (!node || !isMeshNode(node)) {
    return fail("Node is not a mesh");
  }

  const result = op(node.data);

  if (!result) {
    return fail(`${label} failed`);
  }

  // Preserve authored metadata that topology operators do not know about.
  result.physics = node.data.physics;
  result.role = node.data.role;
  result.modeling = node.data.modeling;
  result.surface = result.surface ?? node.data.surface;

  editor.execute(createSetMeshDataCommand(editor.scene, nodeId, result, node.data));
  return ok({});
}

function executeMeshModelingUpdate(
  editor: EditorCore,
  nodeId: string,
  recipe: (mesh: EditableMesh) => EditableMesh,
  label: string
): string {
  const node = editor.scene.getNode(nodeId);

  if (!node || !isMeshNode(node)) {
    return fail("Node is not a mesh");
  }

  const result = recipe(node.data);

  editor.execute(createSetMeshDataCommand(editor.scene, nodeId, result, node.data));
  return ok({ label });
}

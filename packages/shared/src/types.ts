import type { MeshTerrainState } from "./terrain-document";

export type NodeID = string;
export type EntityID = string;
export type MaterialID = string;
export type AssetID = string;
export type LayerID = string;
export type FaceID = string;
export type VertexID = string;
export type HalfEdgeID = string;
export type MetadataValue = string | number | boolean;
export type GameplayValue = string | number | boolean | null | GameplayObject | GameplayValue[];
export type PrimitiveShape = "cone" | "cube" | "cylinder" | "sphere";
export type BrushShape = PrimitiveShape | "custom-polygon" | "plane" | "ramp" | "stairs";
export type PrimitiveRole = "brush" | "prop";
export type PropBodyType = "dynamic" | "fixed" | "kinematicPosition";
export type PropColliderShape = "ball" | "cone" | "cuboid" | "cylinder" | "trimesh";
export type LightType = "ambient" | "directional" | "hemisphere" | "point" | "spot";
export type EntityType = "npc-spawn" | "player-spawn" | "smart-object";
export type PlayerCameraMode = "fps" | "third-person" | "top-down";

export type SkateparkElementType =
  | "quarter-pipe"
  | "half-pipe"
  | "rail"
  | "fun-box"
  | "bowl"
  | "ledge"
  | "bank"
  | "spine"
  | "pyramid"
  | "stair-set"
  | "kicker"
  | "manual-pad"
  | "hip"
  | "hubba-ledge";

export type ArchitectureElementType =
  | "wall"
  | "slab"
  | "ceiling"
  | "roof"
  | "zone"
  | "item"
  | "guide"
  | "scan";

// --- Terrain types ---

export type FalloffType = "linear" | "smooth" | "constant";
export type TerrainBrushMode = "raise" | "lower" | "flatten" | "smooth" | "noise" | "terrace" | "erosion";

export type TerrainLayerDefinition = {
  materialId: string;
  name: string;
};

/**
 * Which authoring model a terrain node uses.
 *
 * "heightmap" is the grid terrain: one elevation per column, holes masked out
 * of the grid, cheap to store and sample. "mesh" is the sculptable mesh
 * terrain, where strokes follow the picked surface normal, so it can carry
 * lateral deformation, overhangs, and real holes cut by CSG.
 */
export type TerrainMode = "heightmap" | "mesh";

export type TerrainNodeData = {
  /** Defaults to "heightmap" when absent, so existing documents keep loading. */
  mode?: TerrainMode;
  heightmap: Float32Array;
  resolution: number;
  size: Vec3;
  splatmap: Float32Array;
  layers: TerrainLayerDefinition[];
  lodLevels: number;
  holeMask?: Uint8Array;
  /** Present only when `mode` is "mesh". Evaluated by @blud/terrain. */
  meshTerrain?: MeshTerrainState;
};

export type ProceduralWorldPreset = "low" | "high" | "ultra" | "custom";

export type ProceduralTerrainSettings = {
  farShell: boolean;
  heightAmplitude: number;
  hydraulicErosion: number;
  lakeBehavior: "connected" | "natural" | "off";
  moisture: number;
  noiseScale: number;
  riverThreshold: number;
  snow: number;
  terrainRange: number;
  thermalErosion: number;
};

export type ProceduralVegetationSettings = {
  enabledSpecies: string[];
  grassDensity: number;
  impostorRange: number;
  scatterSeedOffset: number;
  slopeLimit: number;
  treeDensity: number;
  understoryDensity: number;
  windResponse: number;
};

export type ProceduralLightingSettings = {
  giEnabled: boolean;
  shadowQuality: "low" | "high" | "ultra";
  sunAzimuth: number;
  sunElevation: number;
};

export type ProceduralAtmosphereSettings = {
  cloudCoverage: number;
  cloudSpeed: number;
  fogDensity: number;
  volumetrics: boolean;
};

export type ProceduralWaterSettings = {
  caustics: boolean;
  clipmapDistance: number;
  enabled: boolean;
  foam: boolean;
  reflectionQuality: "low" | "high" | "ultra";
  wetMargins: boolean;
};

export type ProceduralMotionSettings = {
  cloudSpeed: number;
  freezeSimulation: boolean;
  particlePreset: "low" | "high" | "ultra";
  particleTypes: Array<"leaves" | "pollen" | "snow">;
  windDirection: number;
  windStrength: number;
};

export type ProceduralPostSettings = {
  autoExposure: boolean;
  bloom: boolean;
  debugView: "none" | "ao" | "clouds" | "velocity";
  gtao: boolean;
  screenSpaceBounce: boolean;
  taa: boolean;
};

export type ProceduralWorldBookmark = {
  id: string;
  name: string;
  pitch: number;
  timeOfDay: number;
  x: number;
  y: number;
  yaw: number;
  z: number;
};

export type ProceduralExplorationSettings = {
  flySpeed: number;
  mode: "editor" | "fly" | "walk";
  sprintMultiplier: number;
  walkSpeed: number;
};

export type ProceduralTerrainConfig = ProceduralTerrainSettings;
export type ProceduralVegetationConfig = ProceduralVegetationSettings;
export type ProceduralLightingConfig = ProceduralLightingSettings;
export type ProceduralAtmosphereConfig = ProceduralAtmosphereSettings;
export type ProceduralWaterConfig = ProceduralWaterSettings;
export type ProceduralMotionConfig = ProceduralMotionSettings;
export type ProceduralPostConfig = ProceduralPostSettings;
export type ProceduralExplorationConfig = ProceduralExplorationSettings;

export type ProceduralWorldConfig = {
  atmosphere: ProceduralAtmosphereSettings;
  bookmarks: ProceduralWorldBookmark[];
  enabled: boolean;
  exploration: ProceduralExplorationSettings;
  generator: "laas";
  heightfieldResolution: number;
  lighting: ProceduralLightingSettings;
  motion: ProceduralMotionSettings;
  post: ProceduralPostSettings;
  preset: ProceduralWorldPreset;
  seed: number;
  terrain: ProceduralTerrainSettings;
  timeOfDay: number;
  vegetation: ProceduralVegetationSettings;
  version: 2;
  water: ProceduralWaterSettings;
  worldSizeMeters: number;
};

/** Compatibility name retained for scene-node and command APIs. */
export type ProceduralWorldNodeData = ProceduralWorldConfig;

// --- GridMap types ---

export type TileEntry = {
  tileId: string;
  rotation: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipZ?: boolean;
};

export type AutoTileRule = {
  pattern: string;
  tileId: string;
  rotation: 0 | 90 | 180 | 270;
};

export type TilePaletteEntry = {
  id: string;
  name: string;
  meshAssetId: string;
  hasCollision: boolean;
  hasNavMesh: boolean;
  autoTileRules?: AutoTileRule[];
};

export type GridMapNodeData = {
  cellSize: Vec3;
  tiles: Record<string, TileEntry>;
  palette: TilePaletteEntry[];
};

// --- Spline types ---

export type SplineType = "road" | "fence" | "pipe" | "rail" | "cable" | "wall" | "river" | "curb";
export type SplineInterpolation = "bezier" | "catmull-rom";

export type ControlPoint = {
  position: Vec3;
  inTangent: Vec3;
  outTangent: Vec3;
};

export type CrossSectionProfile = {
  points: Vec2[];
};

export type SplineTerrainIntegration = {
  flatten: boolean;
  corridorWidth: number;
  embedDepth: number;
};

export type SplineNodeData = {
  splineType: SplineType;
  interpolation: SplineInterpolation;
  controlPoints: ControlPoint[];
  crossSection: CrossSectionProfile;
  closed: boolean;
  segmentCount: number;
  terrainIntegration?: SplineTerrainIntegration;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Vec2 = {
  x: number;
  y: number;
};

export type ColorRGBA = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

export type GameplayObject = {
  [key: string]: GameplayValue;
};

export type Transform = {
  position: Vec3;
  pivot?: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type Plane = {
  normal: Vec3;
  distance: number;
};

export type Face = {
  id: FaceID;
  plane: Plane;
  vertexIds: VertexID[];
  materialId?: MaterialID;
  uvOffset?: Vec2;
  uvScale?: Vec2;
};

export type Brush = {
  planes: Plane[];
  faces: Face[];
  previewSize: Vec3;
};

export type EditableMeshVertex = {
  id: VertexID;
  position: Vec3;
};

export type EditableMeshHalfEdge = {
  id: HalfEdgeID;
  vertex: VertexID;
  twin?: HalfEdgeID;
  next?: HalfEdgeID;
  face?: FaceID;
};

export type EditableMeshFace = {
  id: FaceID;
  halfEdge: HalfEdgeID;
  blendWeights?: Array<Record<string, number>>;
  materialId?: MaterialID;
  uvOffset?: Vec2;
  uvIslandId?: string;
  uvScale?: Vec2;
  uvs?: Vec2[];
  vertexColors?: ColorRGBA[];
};

export type EditableMeshTopology = {
  vertices: EditableMeshVertex[];
  halfEdges: EditableMeshHalfEdge[];
  faces: EditableMeshFace[];
};

export type MeshBooleanOperation = "difference" | "intersect" | "union";
export type MeshLatticeDeformKind = "bend" | "shear" | "taper" | "twist";
export type MeshRemeshMode = "cleanup" | "quad" | "voxel";
export type MeshBakeMapKind = "ao" | "curvature" | "id-mask" | "normals" | "vertex-colors";

export type MeshModelingModifierBase = {
  enabled: boolean;
  id: string;
  label: string;
};

export type MeshBooleanModifier = MeshModelingModifierBase & {
  mode: "apply" | "live";
  operation: MeshBooleanOperation;
  targetNodeId?: NodeID;
  type: "boolean";
};

export type MeshMirrorModifier = MeshModelingModifierBase & {
  axis: "x" | "y" | "z";
  type: "mirror";
  weld: boolean;
};

export type MeshSolidifyModifier = MeshModelingModifierBase & {
  thickness: number;
  type: "solidify";
};

export type MeshLatticeModifier = MeshModelingModifierBase & {
  axis: "x" | "y" | "z";
  falloff: number;
  intensity: number;
  mode: MeshLatticeDeformKind;
  type: "lattice";
};

export type MeshRemeshModifier = MeshModelingModifierBase & {
  mode: MeshRemeshMode;
  resolution: number;
  smoothing: number;
  type: "remesh";
  weldDistance: number;
};

export type MeshRetopoModifier = MeshModelingModifierBase & {
  preserveBorders: boolean;
  targetFaceCount: number;
  type: "retopo";
};

export type MeshModelingModifier =
  | MeshBooleanModifier
  | MeshMirrorModifier
  | MeshSolidifyModifier
  | MeshLatticeModifier
  | MeshRemeshModifier
  | MeshRetopoModifier;

export type MeshPolyGroup = {
  color: string;
  faceIds: FaceID[];
  id: string;
  name: string;
};

export type MeshSmoothingGroup = {
  angle: number;
  faceIds: FaceID[];
  id: string;
  name: string;
};

export type MeshLodProfile = {
  faceCount?: number;
  generatedAt?: string;
  id: string;
  name: string;
  ratio: number;
};

export type MeshBakeOutput = {
  generatedAt?: string;
  id: string;
  kind: MeshBakeMapKind;
  resolution: number;
  sourceGroupId?: string;
  status: "error" | "idle" | "queued" | "ready";
};

export type MeshUvProjectionMode = "box" | "cylindrical" | "planar" | "smart";

export type MeshUvSeam = {
  edge: [VertexID, VertexID];
  id?: string;
};

export type MeshMaterialSlot = {
  id: string;
  materialId: MaterialID;
  name?: string;
};

export type MeshTexelDensitySettings = {
  pixelsPerMeter: number;
  textureResolution: number;
};

export type MeshTextureBlendLayer = {
  color?: string;
  colorTexture?: string;
  id: string;
  materialId?: MaterialID;
  metalness?: number;
  metalnessTexture?: string;
  name: string;
  normalTexture?: string;
  opacity?: number;
  roughness?: number;
  roughnessTexture?: string;
};

export type MeshProjectedDecal = {
  blendMode?: "add" | "multiply" | "normal";
  color?: string;
  depth?: number;
  id: string;
  materialId?: MaterialID;
  name: string;
  normal: Vec3;
  opacity?: number;
  position: Vec3;
  size: Vec2;
  targetFaceIds?: FaceID[];
  texture?: string;
  up?: Vec3;
};

export type EditableMeshSurfaceData = {
  blendLayers?: MeshTextureBlendLayer[];
  decals?: MeshProjectedDecal[];
  materialSlots?: MeshMaterialSlot[];
  texelDensity?: MeshTexelDensitySettings;
  uvSeams?: MeshUvSeam[];
};

export type EditableMeshModelingData = {
  bakeOutputs?: MeshBakeOutput[];
  baseTopology?: EditableMeshTopology;
  lods?: MeshLodProfile[];
  modifiers?: MeshModelingModifier[];
  polyGroups?: MeshPolyGroup[];
  smoothingGroups?: MeshSmoothingGroup[];
  symmetry?: {
    axis: "x" | "y" | "z";
    enabled: boolean;
    weld: boolean;
  };
};

export type EditableMesh = EditableMeshTopology & {
  physics?: PropPhysics;
  modeling?: EditableMeshModelingData;
  role?: PrimitiveRole;
  surface?: EditableMeshSurfaceData;
};

export type ModelReference = {
  assetId: AssetID;
  path: string;
};

export type PropPhysics = {
  angularDamping: number;
  bodyType: PropBodyType;
  canSleep: boolean;
  ccd: boolean;
  colliderShape: PropColliderShape;
  contactSkin: number;
  density?: number;
  enabled: boolean;
  friction: number;
  gravityScale: number;
  /**
   * When set, the body only rotates around this local axis (translations locked).
   * Used with dynamic meshes + Openable "physics motor" for hinge-like doors.
   */
  hingeAxis?: "x" | "y" | "z";
  linearDamping: number;
  lockRotations: boolean;
  lockTranslations: boolean;
  mass?: number;
  restitution: number;
  sensor: boolean;
};

export type PrimitiveNodeData = {
  materialId?: MaterialID;
  physics?: PropPhysics;
  radialSegments?: number;
  role: PrimitiveRole;
  shape: PrimitiveShape;
  size: Vec3;
  uvScale?: Vec2;
};

export type InstancingNodeData = {
  sourceNodeId: NodeID;
};

export type LightNodeData = {
  angle?: number;
  castShadow: boolean;
  color: string;
  decay?: number;
  distance?: number;
  enabled: boolean;
  groundColor?: string;
  intensity: number;
  penumbra?: number;
  target?: Vec3;
  type: LightType;
};

export type GeometryNodeBase = {
  hooks?: SceneHook[];
  id: NodeID;
  name: string;
  metadata?: Record<string, MetadataValue>;
  parentId?: NodeID;
  tags?: string[];
  transform: Transform;
};

export type GroupNode = GeometryNodeBase & {
  kind: "group";
  data: Record<string, never>;
};

export type BrushNode = GeometryNodeBase & {
  kind: "brush";
  data: Brush;
};

export type MeshNode = GeometryNodeBase & {
  kind: "mesh";
  data: EditableMesh;
};

export type ModelNode = GeometryNodeBase & {
  kind: "model";
  data: ModelReference;
};

export type PrimitiveNode = GeometryNodeBase & {
  kind: "primitive";
  data: PrimitiveNodeData;
};

export type InstancingNode = GeometryNodeBase & {
  kind: "instancing";
  data: InstancingNodeData;
};

export type LightNode = GeometryNodeBase & {
  kind: "light";
  data: LightNodeData;
};

export type TerrainNode = GeometryNodeBase & {
  kind: "terrain";
  data: TerrainNodeData;
};

export type ProceduralWorldNode = GeometryNodeBase & {
  kind: "procedural-world";
  data: ProceduralWorldNodeData;
};

export type GridMapNode = GeometryNodeBase & {
  kind: "gridmap";
  data: GridMapNodeData;
};

export type SplineNode = GeometryNodeBase & {
  kind: "spline";
  data: SplineNodeData;
};

export type GeometryNode = BrushNode | GroupNode | MeshNode | ModelNode | PrimitiveNode | InstancingNode | LightNode | TerrainNode | ProceduralWorldNode | GridMapNode | SplineNode;

export type Asset = {
  id: AssetID;
  type: "audio" | "material" | "model" | "prefab";
  path: string;
  metadata: Record<string, MetadataValue>;
};

export type MaterialCategory = "blockout" | "custom" | "flat";

export type MaterialRenderSide = "back" | "double" | "front";

export type TextureKind = "color" | "normal" | "metalness" | "roughness";

export type TextureSource = "ai" | "import" | "upload";

export type TextureRecord = {
  id: string;
  createdAt: string;
  dataUrl: string;
  kind: TextureKind;
  mimeType?: string;
  model?: string;
  name: string;
  prompt?: string;
  size?: number;
  source: TextureSource;
};

export type Material = {
  id: MaterialID;
  name: string;
  category?: MaterialCategory;
  blendLayers?: MeshTextureBlendLayer[];
  color: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
  opacity?: number;
  side?: MaterialRenderSide;
  transparent?: boolean;
  colorTexture?: string;
  edgeColor?: string;
  edgeThickness?: number;
  metalness?: number;
  metalnessTexture?: string;
  normalTexture?: string;
  path?: string;
  roughness?: number;
  roughnessTexture?: string;
};

export type Layer = {
  id: LayerID;
  name: string;
  visible: boolean;
  locked: boolean;
};

export type Entity = {
  hooks?: SceneHook[];
  id: EntityID;
  name: string;
  parentId?: NodeID;
  type: EntityType;
  transform: Transform;
  properties: Record<string, MetadataValue>;
};

export type SceneHook = {
  config: GameplayObject;
  enabled?: boolean;
  id: string;
  type: string;
};

export type SceneEventDefinition = {
  category?: string;
  custom?: boolean;
  description?: string;
  id: string;
  name: string;
  scope?: "entity-local" | "player" | "world" | "global" | "mission" | "custom";
};

export type ScenePathDefinition = {
  id: string;
  loop?: boolean;
  name: string;
  points: Vec3[];
};

export type PlayerSettings = {
  cameraMode: PlayerCameraMode;
  canCrouch: boolean;
  canInteract: boolean;
  canJump: boolean;
  canRun: boolean;
  crouchHeight: number;
  height: number;
  interactKey: string;
  jumpHeight: number;
  movementSpeed: number;
  runningSpeed: number;
};

export type SceneSkyboxFormat = "hdr" | "image";

export type SceneSkyboxSettings = {
  affectsLighting: boolean;
  blur: number;
  enabled: boolean;
  format: SceneSkyboxFormat;
  intensity: number;
  lightingIntensity: number;
  name: string;
  source: string;
};

export type WorldLodSettings = {
  bakedAt?: string;
  enabled: boolean;
  lowDetailRatio: number;
  midDetailRatio: number;
};

export type WorldGrassSettings = {
  baseColor: string;
  bladeHeight: number;
  bladeWidth: number;
  density: number;
  enabled: boolean;
  interactionRadius: number;
  interactionStrength: number;
  radius: number;
  tipColor: string;
  windSpeed: number;
  windStrength: number;
};

export type WorldAmbientAudio = {
  description: string;
  audioUrl?: string;
};

export type WorldSettings = {
  ambientAudio?: WorldAmbientAudio;
  ambientColor: string;
  ambientIntensity: number;
  floorPresetId?: string;
  fogColor: string;
  fogFar: number;
  fogNear: number;
  grass: WorldGrassSettings;
  gravity: Vec3;
  lod: WorldLodSettings;
  physicsEnabled: boolean;
  skybox: SceneSkyboxSettings;
};

export type SceneSettings = {
  events?: SceneEventDefinition[];
  paths?: ScenePathDefinition[];
  player: PlayerSettings;
  world: WorldSettings;
};

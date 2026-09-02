/**
 * Serializable mesh-terrain document types.
 *
 * These live in @blud/shared rather than @blud/terrain because they *are* the
 * save format: a scene document carrying a mesh terrain has to describe its
 * authoring stack without pulling in the algorithms that evaluate it. The
 * behaviour -- brush kernels, CSG evaluation, meshing, LOD -- stays in
 * @blud/terrain, which re-exports these types so the ported upstream code keeps
 * importing them from one place.
 *
 * Everything here must survive structuredClone and JSON round-tripping, so
 * cutter meshes carry plain number[] rather than typed arrays.
 */

import type { Vec3 } from "./types";

// --- Material channels -------------------------------------------------------

export type TerrainPaintChannelId = "channel0" | "channel1" | "channel2" | "channel3";

export type TerrainMaterialChannel = {
  id: TerrainPaintChannelId;
  name: string;
  /** Packed 0xRRGGBB. */
  color: number;
  roughness: number;
};

export type TerrainMaterialSettings = {
  channels: readonly [
    TerrainMaterialChannel,
    TerrainMaterialChannel,
    TerrainMaterialChannel,
    TerrainMaterialChannel,
  ];
};

// --- CSG cutter volumes ------------------------------------------------------

/**
 * Named displacement character applied to a cut face.
 *
 * A cut left analytic reads as machined, so anything meant to look like rock
 * picks a profile. The open string arm keeps this assignable to the profile
 * table key type, which is deliberately extensible.
 */
export type TerrainCutterSurfaceProfile =
  | "cave"
  | "arch"
  | "overhang"
  | "canyon"
  | "hoodoo"
  | "default"
  | "none"
  | (string & Record<never, never>);

/** World-space elliptical footprint used to grow terrain into a mesh patch. */
export type TerrainApron = {
  center: Vec3;
  /** Long-axis direction. Only X/Z participate in the terrain footprint. */
  forward: Vec3;
  halfLength: number;
  halfWidth: number;
  /** Metres outside the authored footprint over which the uplift reaches zero. */
  falloff: number;
  /** Maximum vertical terrain displacement in metres. */
  lift: number;
};

export type TerrainCutterBase = {
  surface?: TerrainCutterSurfaceProfile;
  /** Relative displacement and authored cross-section roughness. */
  noise?: number;
  /** Close-noise wavelength in world metres. */
  noiseScale?: number;
  /** Material classification for faces exposed by subtraction. */
  interior?: "rock" | "ember";
  /** Optional terrain-side transition authored with an additive mesh patch. */
  terrainApron?: TerrainApron;
};

/** One elliptical cross-section of a continuous authored void. */
export type SweepRing = Vec3 & {
  horizontalRadius: number;
  verticalRadius: number;
};

/** One watertight, continuously varying cave shell. */
export type SweptCaveCutter = TerrainCutterBase & {
  kind: "sweep";
  rings: SweepRing[];
};

/** A swept sphere: passages, tubes and the windows punched through fins. */
export type CapsuleCutter = TerrainCutterBase & {
  kind: "capsule";
  start: Vec3;
  end: Vec3;
  radius: number;
};

/** A rotated ellipsoid: flattened it undercuts a cliff, round it is a chamber. */
export type EllipsoidCutter = TerrainCutterBase & {
  kind: "ellipsoid";
  center: Vec3;
  /** Half-extents along the local x (forward), y (up) and z axes. */
  radii: Vec3;
  /** World direction the local +x axis points along. */
  forward: Vec3;
  up?: Vec3;
};

/** A rotated box, used for the straight-walled reaches of a slot canyon. */
export type BoxCutter = TerrainCutterBase & {
  kind: "box";
  center: Vec3;
  halfExtents: Vec3;
  forward: Vec3;
  up?: Vec3;
};

/** Serializable closed triangle mesh used as a non-destructive CSG operand. */
export type MeshCutter = TerrainCutterBase & {
  kind: "mesh";
  positions: number[];
  indices: number[];
};

export type CutterVolume =
  | SweptCaveCutter
  | CapsuleCutter
  | EllipsoidCutter
  | BoxCutter
  | MeshCutter;

// --- Modifier stack ----------------------------------------------------------

export type TerrainAABB = {
  min: Vec3;
  max: Vec3;
};

export type MeshBrushMode =
  | "raise"
  | "lower"
  | "smooth"
  | "flatten"
  | "clay"
  | "pinch"
  | "scrape"
  | "terrace"
  | "noise";

/**
 * Which axis a stroke displaces along.
 *
 * "heightfield" keeps displacement vertical, for traditional landscape work.
 * "mesh" follows the picked surface normal, so a stroke can push into X/Z and
 * form lateral deformation or an overhang -- the thing a heightmap cannot do.
 */
export type MeshBrushDomain = "heightfield" | "mesh";

export type TerrainPaintMode = "add" | "subtract";
export type TerrainCsgOperation = "subtract" | "add";

export type TerrainModifierTransform = {
  offset: Vec3;
  yaw: number;
  pitch?: number;
  roll?: number;
  scale: number;
};

export type TerrainBrushSample = Vec3 & {
  normal: Vec3;
  /** Relative accumulated brush flow for this spatial sample. */
  weight: number;
};

export type TerrainModifierBase = {
  id: string;
  enabled: boolean;
  priority: number;
  bounds: TerrainAABB;
  transform: TerrainModifierTransform;
  /**
   * Position in the authored order, assigned by the stack.
   *
   * Order is part of the meaning of a stroke: a brush records its dabs against
   * the surface as it stood when it was drawn, so replaying it against a
   * different surface is not the same edit.
   */
  sequence?: number;
};

export type BrushStrokeModifier = TerrainModifierBase & {
  type: "brush-stroke";
  mode: MeshBrushMode;
  domain: MeshBrushDomain;
  radius: number;
  strength: number;
  falloff: number;
  targetY?: number;
  terraceStep?: number;
  noiseScale?: number;
  noiseSeed?: number;
  /** Lets one stroke keep building while held instead of settling on a depth. */
  accumulate?: boolean;
  sculptLayerId?: string;
  points: TerrainBrushSample[];
};

export type WeightPaintModifier = TerrainModifierBase & {
  type: "weight-paint";
  channel: TerrainPaintChannelId;
  mode: TerrainPaintMode;
  radius: number;
  strength: number;
  falloff: number;
  points: TerrainBrushSample[];
};

export type SculptLayerModifier = TerrainModifierBase & {
  type: "sculpt-layer";
  name: string;
  opacity: number;
};

export type MaterialSettingsModifier = TerrainModifierBase & {
  type: "material-settings";
  settings: TerrainMaterialSettings;
};

export type TerrainNoiseModifier = TerrainModifierBase & {
  type: "noise";
  amplitude: number;
  frequency: number;
  seed: number;
};

export type FieldDisplacementModifier = TerrainModifierBase & {
  type: "field-displacement";
  fieldId: string;
  scale: number;
};

export type RemeshModifier = TerrainModifierBase & {
  type: "remesh";
  center: Vec3;
  radius: number;
  targetEdgeLength: number;
  minEdgeLength: number;
  maxEdgeLength: number;
  iterations: number;
};

export type TessellateModifier = TerrainModifierBase & {
  type: "tessellate";
  center: Vec3;
  radius: number;
  targetEdgeLength: number;
};

export type TunnelPortal = Vec3 & {
  normal: Vec3;
};

export type BooleanSubtractModifier = TerrainModifierBase & {
  type: "boolean-subtract";
  shape: "capsule-path";
  portals: [TunnelPortal, TunnelPortal];
  radius: number;
  /** Distance each portal travels inward before the two ends are connected. */
  depth: number;
  /** Relative wall and cross-section roughness. Zero produces a clean sweep. */
  noise: number;
  /** World-space wavelength of the tunnel close-surface breakup. */
  noiseScale: number;
  /** Camera-drilled branches joined into this same subtractive CSG modifier. */
  carves?: CutterVolume[];
  backend: string;
};

/** Serializable closed meshes combined with the terrain by exact live CSG. */
export type BooleanVolumeModifier = TerrainModifierBase & {
  type: "boolean-volume";
  operation: TerrainCsgOperation;
  volumes: CutterVolume[];
  backend: string;
};

export type TerrainModifier =
  | BrushStrokeModifier
  | WeightPaintModifier
  | SculptLayerModifier
  | MaterialSettingsModifier
  | TerrainNoiseModifier
  | FieldDisplacementModifier
  | RemeshModifier
  | TessellateModifier
  | BooleanSubtractModifier
  | BooleanVolumeModifier;

// --- Node payload ------------------------------------------------------------

/** Base elevation a fresh mesh terrain starts from. */
export type MeshTerrainProfile = "natural" | "flat";

/**
 * Authoring state for a mesh terrain node.
 *
 * The surface itself is not stored: it is the deterministic result of replaying
 * `modifiers` in `sequence` order over the base field described by `seed` and
 * `profile`. That is what keeps every edit non-destructive and the document
 * small no matter how much sculpting it carries.
 */
export type MeshTerrainState = {
  version: 1;
  /** Logical world extent in metres, square. */
  worldSize: number;
  /** Edge length of one streamed section in metres. */
  sectionSize: number;
  seed: number;
  profile: MeshTerrainProfile;
  modifiers: TerrainModifier[];
  materialSettings: TerrainMaterialSettings;
  /** Number of geometric LODs the compiler produces per section. */
  lodLevels: number;
};

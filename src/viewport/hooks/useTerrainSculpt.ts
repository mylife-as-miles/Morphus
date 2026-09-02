import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Raycaster, Vector2, Vector3, type Camera, type Object3D } from "three";
import {
  appendTerrainModifierCommand,
  updateTerrainModifierCommand,
  type Command
} from "@blud/editor-core";
import type {
  BooleanSubtractModifier,
  BooleanVolumeModifier,
  BrushStrokeModifier,
  CapsuleCutter,
  MeshBrushDomain,
  MeshBrushMode,
  MeshTerrainState,
  RemeshModifier,
  TerrainModifier,
  TerrainPaintChannelId,
  TerrainPaintMode,
  TessellateModifier,
  Vec3,
  WeightPaintModifier
} from "@blud/shared";
import {
  appendBrushPoint,
  createBooleanVolumeModifier,
  createBrushStroke,
  createRemeshModifier,
  createTessellateModifier,
  createTunnelModifier,
  createWeightPaintStroke,
  distanceToCutterVolume,
  modifierWorldBounds,
  sampleStrokeSegment,
  transformedBooleanVolume,
  tunnelPortalDistance,
  updateTunnelPortal
} from "./mesh-terrain-authoring";

/**
 * The live half of mesh-terrain authoring: everything between the pointer going
 * down on the terrain and one undoable modifier landing in the scene document.
 *
 * The hook owns the *in-progress* stroke and nothing else. A drag accumulates
 * dabs into a draft modifier held in a ref -- never in the document, never in
 * React state -- and exactly one command is pushed when the pointer comes up.
 * That is what keeps one gesture worth one undo entry: a thirty-second sculpt
 * pass is a single "Sculpt terrain" step, not four hundred of them.
 *
 * It is deliberately a pure hook with an explicit params object and no store
 * imports, so the viewport component that owns the pointer events can wire it
 * however it likes and a panel can read the brush cursor without either of them
 * knowing about the other.
 *
 * Two things the caller still owns, because they belong to the element and not
 * to the gesture:
 *
 * - **Pointer capture.** `handlePointerDown` returning true means the gesture
 *   was taken; capture the pointer on the canvas then, and release it on up, or
 *   a drag that leaves the element will never see its `pointerup` and the stroke
 *   will hang. Route `pointercancel` and `lostpointercapture` to
 *   `handlePointerUp` as well.
 * - **Coalescing.** `handlePointerMove` is cheap but not free -- it raycasts --
 *   and a 1000 Hz mouse reports well over a dozen times per displayed frame.
 *   Feeding it the newest event once per `requestAnimationFrame` costs the
 *   stroke nothing, because the segment between the last processed position and
 *   the newest one is resampled at brush spacing either way.
 */

// --- Tuning ----------------------------------------------------------------

/**
 * How much brush flow one second of holding still deposits.
 *
 * Ported from the upstream Mesh Terrain Lab stroke session. Spacing and per-dab
 * weight are derived from each other so that how much material a pass moves
 * depends on the brush and the strength the user set, not on how fast they
 * happened to drag the pointer or how quickly their mouse reports.
 */
const BRUSH_FLOW_PER_SECOND = 1.5;
/** Ceiling on a single authored dab, so no one frame steps the surface. */
const MAX_AUTHORED_DAB_WEIGHT = 0.25;
/** Dab spacing along a stroke, as a fraction of brush radius. */
const BRUSH_SPACING_FRACTION = 0.1;
/** Largest frame slice the flow accumulator will honour, in seconds. */
const MAX_ADVANCE_SECONDS = 1 / 30;
/** Largest frame slice the cave drill will honour, in seconds. */
const MAX_DIG_ADVANCE_SECONDS = 0.05;
/**
 * How often the brush cursor is published to React.
 *
 * The ref is written on every pointer event because the viewport reads it once
 * a frame; the React copy exists only so panels can *display* a coordinate, and
 * ten updates a second is past what anyone can read off a moving number. Waking
 * React per pointer event re-renders the editor on a 1000 Hz mouse.
 */
const CURSOR_PUBLISH_INTERVAL_MS = 100;

function strokeSpacing(radius: number): number {
  return Math.max(0.25, radius * BRUSH_SPACING_FRACTION);
}

function spatialDabWeight(radius: number): number {
  return strokeSpacing(radius) / Math.max(0.001, radius);
}

// --- Public shapes ---------------------------------------------------------

/**
 * Which family of edit a drag authors.
 *
 * Deliberately local rather than imported from `@blud/tool-system`: the tool ids
 * are being added in parallel, and the caller is expected to map its own active
 * tool onto this closed set. Sculpt carries the nine brush modes, paint the four
 * material channels.
 */
export type TerrainSculptTool = "sculpt" | "paint" | "density" | "tunnel" | "dig";

export type TerrainDensityMode = "remesh" | "tessellate";

/**
 * Everything a stroke reads at the moment the pointer goes down.
 *
 * Snapshotted at press, so turning the radius knob mid-drag cannot retroactively
 * change the dabs already deposited.
 */
export type TerrainSculptSettings = {
  tool: TerrainSculptTool;

  /** Sculpt: which of the nine brush kernels runs. */
  brushMode: MeshBrushMode;
  /** Sculpt: "heightfield" keeps displacement vertical, "mesh" follows the normal. */
  brushDomain: MeshBrushDomain;
  brushRadius: number;
  brushStrength: number;
  brushFalloff: number;
  /** Lets one stroke keep building while held instead of settling on a depth. */
  brushAccumulate: boolean;
  terraceStep: number;
  noiseScale: number;
  /** Sculpt: which sculpt-layer modifier the stroke belongs to, if any. */
  activeSculptLayerId?: string;

  /** Paint: which of the four material channels the stroke writes. */
  paintChannel: TerrainPaintChannelId;
  paintMode: TerrainPaintMode;

  /** Density: refine an area to an even edge length, or just subdivide it. */
  densityMode: TerrainDensityMode;
  targetEdgeLength: number;

  tunnelRadius: number;
  tunnelDepth: number;
  tunnelNoise: number;
  tunnelNoiseScale: number;

  digRadius: number;
  /** Metres of tunnel drilled per second while the pointer is held. */
  digSpeed: number;
  digNoise: number;
  digNoiseScale: number;
};

/** Everything a viewport component needs to draw the brush ring. */
export type TerrainBrushCursor = {
  visible: boolean;
  position: Vec3;
  /** Surface normal at the picked point, already in world space. */
  normal: Vec3;
  radius: number;
  /**
   * Radius of the flat top of the brush profile.
   *
   * Where the inner ring sits tells the user how much of the footprint moves at
   * full strength before the falloff starts to taper. Zero when the active tool
   * has no profile (tunnel, dig, density).
   */
  innerRadius: number;
  /** False when the ring should lie flat, as heightfield sculpting does. */
  followsSurface: boolean;
  tool: TerrainSculptTool;
  brushMode: MeshBrushMode;
  strength: number;
  dragging: boolean;
};

/** One surface pick: where the ray met the terrain, and along which ray. */
export type TerrainSurfaceHit = {
  point: Vec3;
  normal: Vec3;
  /** Normalised camera ray, which is what the cave drill follows. */
  rayDirection: Vec3;
  object: Object3D;
  distance: number;
};

/**
 * A pointer event, structurally.
 *
 * React's synthetic pointer event and the DOM one both satisfy this, so the
 * caller can attach these handlers to JSX props or to `addEventListener`
 * without the hook caring which.
 */
export type TerrainPointerLike = {
  clientX: number;
  clientY: number;
  button: number;
  pointerId: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isPrimary: boolean;
};

export type UseTerrainSculptParams = {
  /** False disables every handler outright and hides the cursor. */
  enabled: boolean;
  /** The mesh terrain node being authored. Nothing happens without one. */
  nodeId: string | null | undefined;
  settings: TerrainSculptSettings;
  /** `editorCore.execute`. Called exactly once per completed gesture. */
  execute: (command: Command) => void;
  /** Current authoring stack, read for sculpt layers and cave-carve joining. */
  getMeshTerrain: () => MeshTerrainState | undefined;
  getCamera: () => Camera | null | undefined;
  /** Client rect of the element the pointer coordinates are relative to. */
  getViewportBounds: () => DOMRect | null | undefined;
  /** The rendered terrain objects to raycast against. */
  getTerrainObjects: () => readonly Object3D[];
  /** Share the viewport's raycaster to reuse its layer/threshold configuration. */
  raycaster?: Raycaster;
  /** Fires with the modifier that was committed, after the command is pushed. */
  onStrokeCommitted?: (modifier: TerrainModifier) => void;
  /** Fires with a human-readable outcome, for a status bar. */
  onStatus?: (message: string) => void;
};

export type TerrainSculptSession = {
  /**
   * Live cursor, rewritten on every pointer event.
   *
   * Read this from `useFrame`; read `cursor` from render code.
   */
  cursorRef: RefObject<TerrainBrushCursor>;
  /** Throttled copy of `cursorRef`, safe to render. */
  cursor: TerrainBrushCursor;
  /**
   * The modifier the current gesture is building, or null between gestures.
   *
   * Mutated in place as dabs accumulate so a viewport preview can evaluate the
   * exact modifier that will be committed. It is a detached draft: nothing in
   * the scene document aliases it.
   */
  draftRef: RefObject<TerrainModifier | null>;
  /** Bumped whenever `draftRef.current` is mutated, for cheap change detection. */
  draftVersionRef: RefObject<number>;
  isStroking: boolean;
  /** Returns true when the event was consumed and the caller should not orbit. */
  handlePointerDown: (event: TerrainPointerLike) => boolean;
  handlePointerMove: (event: TerrainPointerLike) => void;
  handlePointerUp: (event: TerrainPointerLike) => void;
  /** Hides the cursor; a stroke in progress keeps going under pointer capture. */
  handlePointerLeave: () => void;
  /** Drops the gesture without committing anything. */
  cancelStroke: () => void;
  /**
   * Per-frame tick. Drives the two time-based tools: brush flow while the
   * pointer is held still, and the cave drill advancing along the camera ray.
   */
  advance: (deltaSeconds: number) => void;
  /** One-off surface pick, for callers that need a point outside a gesture. */
  pickTerrainSurface: (clientX: number, clientY: number) => TerrainSurfaceHit | undefined;
};

// --- Internal session ------------------------------------------------------

type BrushSession = {
  kind: "brush";
  modifier: BrushStrokeModifier | WeightPaintModifier;
  /** Where the last dab landed, which is where the next segment is sampled from. */
  lastPoint: Vec3;
  lastNormal: Vec3;
  /** Where the pointer is now. Undefined when it has left the surface. */
  livePoint?: Vec3;
  liveNormal?: Vec3;
};

type DensitySession = {
  kind: "density";
  modifier: RemeshModifier | TessellateModifier;
};

type TunnelSession = {
  kind: "tunnel";
  modifier: BooleanSubtractModifier;
};

type DigSession = {
  kind: "dig";
  modifier: BooleanVolumeModifier;
  /** Set when this carve was joined into a cave that already existed. */
  existingId?: string;
  capsule: CapsuleCutter;
  entry: Vec3;
  direction: Vec3;
  radius: number;
  speed: number;
  length: number;
  noise: number;
  noiseScale: number;
  paused: boolean;
};

type StrokeSession = BrushSession | DensitySession | TunnelSession | DigSession;

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Tools whose ring follows the picked surface rather than lying flat. */
function followsSurface(settings: TerrainSculptSettings): boolean {
  if (settings.tool === "sculpt") {
    return settings.brushDomain === "mesh";
  }

  return true;
}

function cursorRadius(settings: TerrainSculptSettings): number {
  switch (settings.tool) {
    case "tunnel":
      return settings.tunnelRadius;
    case "dig":
      return settings.digRadius;
    default:
      return settings.brushRadius;
  }
}

function cursorInnerRadius(settings: TerrainSculptSettings): number {
  if (settings.tool !== "sculpt" && settings.tool !== "paint") {
    return 0;
  }

  const radius = settings.brushRadius;
  const inner = radius * (1 - clamp01(settings.brushFalloff)) * 0.9;

  return inner > radius * 0.06 ? inner : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function addScaled(point: Vec3, direction: Vec3, scale: number): Vec3 {
  return {
    x: point.x + direction.x * scale,
    y: point.y + direction.y * scale,
    z: point.z + direction.z * scale
  };
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Which way the drill points.
 *
 * The camera ray, so "hold to dig" bores in the direction the user is looking
 * rather than straight into the wall; falling back to the inverse surface
 * normal when no ray is available.
 */
function digDirection(ray: Vec3 | undefined, normal: Vec3): Vec3 {
  const value = ray ?? { x: -normal.x, y: -normal.y, z: -normal.z };
  const length = Math.hypot(value.x, value.y, value.z);

  if (length < 1e-8) {
    return { x: 0, y: -1, z: 0 };
  }

  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function createDigCapsule(
  entry: Vec3,
  direction: Vec3,
  radius: number,
  length: number,
  noise: number,
  noiseScale: number
): CapsuleCutter {
  return {
    kind: "capsule",
    // Started slightly behind the entry point so the mouth of the carve breaks
    // the surface cleanly instead of leaving a film of terrain over it.
    start: addScaled(entry, direction, -radius * 0.22),
    end: addScaled(entry, direction, length),
    radius,
    surface: "cave",
    noise: Math.max(0, noise),
    noiseScale: Math.max(0.25, noiseScale)
  };
}

/**
 * The nearest existing subtractive volume this carve should join.
 *
 * Drilling a second passage off an existing chamber is one cave, not two: the
 * CSG evaluates a single operand set, and the user undoes one carve rather than
 * discovering the two halves are separate stack entries.
 *
 * Narrower than upstream, which also joins into swept tunnel modifiers. Only
 * `boolean-volume` carves are considered here; a dig started on a tunnel wall
 * becomes its own modifier instead of a branch of the tunnel.
 */
function findDigTarget(
  state: MeshTerrainState | undefined,
  point: Vec3,
  radius: number
): BooleanVolumeModifier | undefined {
  if (!state) {
    return undefined;
  }

  let nearest: { modifier: BooleanVolumeModifier; distance: number } | undefined;

  for (const modifier of state.modifiers) {
    if (!modifier.enabled || modifier.type !== "boolean-volume" || modifier.operation !== "subtract") {
      continue;
    }

    let distance = Number.POSITIVE_INFINITY;

    for (const cutter of transformedBooleanVolume(modifier).volumes) {
      distance = Math.min(distance, distanceToCutterVolume(point, cutter));
    }

    if (distance <= radius && (!nearest || distance < nearest.distance)) {
      nearest = { modifier, distance };
    }
  }

  return nearest?.modifier;
}

function resolveSculptLayerId(
  state: MeshTerrainState | undefined,
  preferred: string | undefined
): string | undefined {
  const layers = (state?.modifiers ?? []).filter((modifier) => modifier.type === "sculpt-layer");

  if (preferred && layers.some((layer) => layer.id === preferred)) {
    return preferred;
  }

  return layers[0]?.id;
}

// --- Hook ------------------------------------------------------------------

export function useTerrainSculpt(params: UseTerrainSculptParams): TerrainSculptSession {
  // Handlers are attached to DOM/JSX and must stay stable across renders while
  // still reading the newest settings, so params are funnelled through a ref
  // rather than baked into each callback's closure.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const fallbackRaycaster = useMemo(() => new Raycaster(), []);
  const raycaster = params.raycaster ?? fallbackRaycaster;
  const ndc = useMemo(() => new Vector2(), []);
  const scratchNormal = useMemo(() => new Vector3(), []);

  const sessionRef = useRef<StrokeSession | undefined>(undefined);
  const activePointerIdRef = useRef<number | null>(null);
  const draftRef = useRef<TerrainModifier | null>(null);
  const draftVersionRef = useRef(0);

  const cursorRef = useRef<TerrainBrushCursor>(hiddenCursor(params.settings));
  const [cursor, setCursor] = useState<TerrainBrushCursor>(() => hiddenCursor(params.settings));
  const [isStroking, setIsStroking] = useState(false);
  const publishHandleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const publishCursorNow = useCallback(() => {
    if (publishHandleRef.current !== undefined) {
      clearTimeout(publishHandleRef.current);
      publishHandleRef.current = undefined;
    }

    setCursor({ ...cursorRef.current });
  }, []);

  const schedulePublish = useCallback(() => {
    if (publishHandleRef.current !== undefined) {
      return;
    }

    publishHandleRef.current = setTimeout(() => {
      publishHandleRef.current = undefined;
      setCursor({ ...cursorRef.current });
    }, CURSOR_PUBLISH_INTERVAL_MS);
  }, []);

  useEffect(
    () => () => {
      if (publishHandleRef.current !== undefined) {
        clearTimeout(publishHandleRef.current);
      }
    },
    []
  );

  const writeCursor = useCallback(
    (point: Vec3, normal: Vec3, dragging: boolean) => {
      const settings = paramsRef.current.settings;
      cursorRef.current = {
        visible: true,
        position: { ...point },
        normal: { ...normal },
        radius: cursorRadius(settings),
        innerRadius: cursorInnerRadius(settings),
        followsSurface: followsSurface(settings),
        tool: settings.tool,
        brushMode: settings.brushMode,
        strength: settings.brushStrength,
        dragging
      };
      schedulePublish();
    },
    [schedulePublish]
  );

  const hideCursor = useCallback(() => {
    if (!cursorRef.current.visible) {
      return;
    }

    // An edge, not a stream: the ring has to go out at once.
    cursorRef.current = { ...cursorRef.current, visible: false, dragging: false };
    publishCursorNow();
  }, [publishCursorNow]);

  const bumpDraft = useCallback(() => {
    draftVersionRef.current += 1;
  }, []);

  const pickTerrainSurface = useCallback(
    (clientX: number, clientY: number): TerrainSurfaceHit | undefined => {
      const { getCamera, getViewportBounds, getTerrainObjects } = paramsRef.current;
      const camera = getCamera();
      const bounds = getViewportBounds();

      if (!camera || !bounds || bounds.width <= 0 || bounds.height <= 0) {
        return undefined;
      }

      const objects = getTerrainObjects();

      if (objects.length === 0) {
        return undefined;
      }

      ndc.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -(((clientY - bounds.top) / bounds.height) * 2 - 1)
      );
      raycaster.setFromCamera(ndc, camera);

      const hit = raycaster.intersectObjects(objects as Object3D[], true)[0];

      if (!hit) {
        return undefined;
      }

      // The face normal is object-local; a terrain node under a transformed
      // parent would otherwise hand the brush a normal pointing somewhere the
      // surface does not.
      if (hit.face) {
        scratchNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
      } else {
        scratchNormal.set(0, 1, 0);
      }

      return {
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        normal: { x: scratchNormal.x, y: scratchNormal.y, z: scratchNormal.z },
        rayDirection: {
          x: raycaster.ray.direction.x,
          y: raycaster.ray.direction.y,
          z: raycaster.ray.direction.z
        },
        object: hit.object,
        distance: hit.distance
      };
    },
    [ndc, raycaster, scratchNormal]
  );

  const beginSession = useCallback(
    (hit: TerrainSurfaceHit): StrokeSession | undefined => {
      const { settings, getMeshTerrain } = paramsRef.current;

      if (settings.tool === "tunnel") {
        const portal = { ...hit.point, normal: { ...hit.normal } };
        const modifier = createTunnelModifier({
          start: portal,
          end: portal,
          radius: settings.tunnelRadius,
          depth: settings.tunnelDepth,
          noise: settings.tunnelNoise,
          noiseScale: settings.tunnelNoiseScale
        }) as BooleanSubtractModifier;

        return { kind: "tunnel", modifier };
      }

      if (settings.tool === "dig") {
        const radius = Math.max(0.5, settings.digRadius);
        const direction = digDirection(hit.rayDirection, hit.normal);
        const length = Math.max(0.75, radius * 0.7);
        const capsule = createDigCapsule(
          hit.point,
          direction,
          radius,
          length,
          settings.digNoise,
          settings.digNoiseScale
        );
        const existing = findDigTarget(getMeshTerrain(), hit.point, radius);
        let modifier: BooleanVolumeModifier;

        if (existing) {
          // `transformedBooleanVolume` bakes the modifier's transform into fresh
          // cutter objects, so the draft shares nothing with the stored version
          // the update command will capture as its undo snapshot.
          modifier = transformedBooleanVolume(existing) as BooleanVolumeModifier;
          modifier.volumes = [...modifier.volumes, capsule];
        } else {
          modifier = createBooleanVolumeModifier({
            operation: "subtract",
            volumes: [capsule]
          }) as BooleanVolumeModifier;
          modifier.backend = "bvh-csg-cave-dig-v1";
        }

        modifier.bounds = modifierWorldBounds(modifier);

        return {
          kind: "dig",
          modifier,
          existingId: existing?.id,
          capsule,
          entry: { ...hit.point },
          direction,
          radius,
          speed: Math.max(0.5, settings.digSpeed),
          length,
          noise: Math.max(0, settings.digNoise),
          noiseScale: Math.max(0.25, settings.digNoiseScale),
          paused: false
        };
      }

      if (settings.tool === "density") {
        const modifier =
          settings.densityMode === "tessellate"
            ? (createTessellateModifier({
                center: hit.point,
                radius: settings.brushRadius,
                targetEdgeLength: settings.targetEdgeLength
              }) as TessellateModifier)
            : (createRemeshModifier({
                center: hit.point,
                radius: settings.brushRadius,
                targetEdgeLength: settings.targetEdgeLength
              }) as RemeshModifier);

        return { kind: "density", modifier };
      }

      // Heightfield sculpting displaces straight up whatever the surface is
      // doing, so the stroke records the vertical axis rather than the pick.
      const strokeNormal =
        settings.tool === "sculpt" && settings.brushDomain === "heightfield" ? { ...UP } : { ...hit.normal };

      const modifier: BrushStrokeModifier | WeightPaintModifier =
        settings.tool === "paint"
          ? (createWeightPaintStroke({
              point: hit.point,
              normal: strokeNormal,
              channel: settings.paintChannel,
              mode: settings.paintMode,
              radius: settings.brushRadius,
              strength: settings.brushStrength,
              falloff: settings.brushFalloff,
              sampleWeight: spatialDabWeight(settings.brushRadius)
            }) as WeightPaintModifier)
          : (createBrushStroke({
              point: hit.point,
              normal: strokeNormal,
              domain: settings.brushDomain,
              mode: settings.brushMode,
              radius: settings.brushRadius,
              strength: settings.brushStrength,
              falloff: settings.brushFalloff,
              // Flatten and scrape level towards the height the stroke started
              // at, so the plane is the one the user aimed at rather than
              // whatever is under the pointer as it moves.
              targetY:
                settings.brushMode === "flatten" || settings.brushMode === "scrape"
                  ? hit.point.y
                  : undefined,
              terraceStep: settings.terraceStep,
              noiseScale: settings.noiseScale,
              accumulate: settings.brushAccumulate,
              sculptLayerId: resolveSculptLayerId(getMeshTerrain(), settings.activeSculptLayerId),
              sampleWeight: spatialDabWeight(settings.brushRadius)
            }) as BrushStrokeModifier);

      return {
        kind: "brush",
        modifier,
        lastPoint: { ...hit.point },
        lastNormal: strokeNormal,
        livePoint: { ...hit.point },
        liveNormal: { ...strokeNormal }
      };
    },
    []
  );

  const finishSession = useCallback(
    (commit: boolean) => {
      const session = sessionRef.current;
      sessionRef.current = undefined;
      activePointerIdRef.current = null;
      draftRef.current = null;
      bumpDraft();
      setIsStroking(false);

      if (cursorRef.current.dragging) {
        cursorRef.current = { ...cursorRef.current, dragging: false };
        publishCursorNow();
      }

      if (!session) {
        return;
      }

      const { nodeId, execute, onStrokeCommitted, onStatus } = paramsRef.current;

      if (!commit || !nodeId) {
        onStatus?.("Terrain edit cancelled");
        return;
      }

      if (session.kind === "tunnel") {
        // Two portals in the same place describe no passage at all. Upstream
        // treats that as an abandoned gesture rather than authoring a degenerate
        // capsule the CSG would have to evaluate.
        if (tunnelPortalDistance(session.modifier) < Math.max(2, session.modifier.radius * 1.25)) {
          onStatus?.("Tunnel cancelled - drag between two distinct surface portals");
          return;
        }

        session.modifier.bounds = modifierWorldBounds(session.modifier);
        execute(appendTerrainModifierCommand(nodeId, session.modifier, "Carve tunnel"));
        onStrokeCommitted?.(session.modifier);
        onStatus?.("Tunnel queued for compile");
        return;
      }

      if (session.kind === "dig") {
        session.modifier.bounds = modifierWorldBounds(session.modifier);

        // Joining an existing cave is an update to that one modifier, starting a
        // new one is an append. Either way the whole hold-to-drill gesture is a
        // single entry on the undo stack.
        execute(
          session.existingId
            ? updateTerrainModifierCommand(nodeId, session.existingId, session.modifier, "Carve cave")
            : appendTerrainModifierCommand(nodeId, session.modifier, "Carve cave")
        );
        onStrokeCommitted?.(session.modifier);
        onStatus?.("Cave carve queued for compile");
        return;
      }

      if (session.kind === "density") {
        execute(appendTerrainModifierCommand(nodeId, session.modifier));
        onStrokeCommitted?.(session.modifier);
        onStatus?.(
          session.modifier.type === "tessellate" ? "Tessellation queued" : "Remesh queued"
        );
        return;
      }

      session.modifier.bounds = modifierWorldBounds(session.modifier);
      execute(appendTerrainModifierCommand(nodeId, session.modifier));
      onStrokeCommitted?.(session.modifier);
      onStatus?.("Edit queued for compile");
    },
    [bumpDraft, publishCursorNow]
  );

  const handlePointerDown = useCallback(
    (event: TerrainPointerLike): boolean => {
      const { enabled, nodeId } = paramsRef.current;

      if (!enabled || !nodeId) {
        return false;
      }

      // Left button, no modifier, primary pointer: everything else belongs to
      // the camera, the selection, or the context menu.
      if (
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !event.isPrimary ||
        sessionRef.current ||
        activePointerIdRef.current !== null
      ) {
        return false;
      }

      const hit = pickTerrainSurface(event.clientX, event.clientY);

      if (!hit) {
        return false;
      }

      const session = beginSession(hit);

      if (!session) {
        return false;
      }

      sessionRef.current = session;
      activePointerIdRef.current = event.pointerId;
      draftRef.current = session.modifier;
      bumpDraft();
      writeCursor(hit.point, hit.normal, true);
      publishCursorNow();
      setIsStroking(true);

      return true;
    },
    [beginSession, bumpDraft, pickTerrainSurface, publishCursorNow, writeCursor]
  );

  const handlePointerMove = useCallback(
    (event: TerrainPointerLike) => {
      const { enabled, nodeId } = paramsRef.current;
      const session = sessionRef.current;

      // Without a target node there is nothing to author, and a brush ring
      // drawn over the terrain would promise an edit that pressing cannot make.
      if (!enabled || !nodeId) {
        hideCursor();
        return;
      }

      if (session && activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) {
        return;
      }

      const hit = pickTerrainSurface(event.clientX, event.clientY);

      if (!hit) {
        if (session?.kind === "brush") {
          // The pointer has left the surface. Stop the flow accumulator rather
          // than piling dabs onto the last point it saw.
          session.livePoint = undefined;
          session.liveNormal = undefined;
        }

        if (session?.kind === "dig") {
          session.paused = true;
        }

        if (!session) {
          hideCursor();
        }

        return;
      }

      writeCursor(hit.point, hit.normal, Boolean(session));

      if (!session) {
        return;
      }

      if (session.kind === "tunnel") {
        // The second portal tracks the pointer; the first stays where the press
        // landed. That is the whole tunnel gesture.
        updateTunnelPortal(session.modifier, 1, hit.point, hit.normal);
        session.modifier.bounds = modifierWorldBounds(session.modifier);
        bumpDraft();
        return;
      }

      if (session.kind === "dig") {
        continueDig(session, hit);
        bumpDraft();
        return;
      }

      if (session.kind === "density") {
        // Density is a stamp, not a drag: the region was fixed when the pointer
        // went down, so the move only updates the cursor.
        return;
      }

      continueBrush(session, hit);
      bumpDraft();
    },
    [bumpDraft, hideCursor, pickTerrainSurface, writeCursor]
  );

  const handlePointerUp = useCallback(
    (event: TerrainPointerLike) => {
      if (!sessionRef.current) {
        return;
      }

      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) {
        return;
      }

      finishSession(true);
    },
    [finishSession]
  );

  const handlePointerLeave = useCallback(() => {
    if (!sessionRef.current) {
      hideCursor();
    }
  }, [hideCursor]);

  const cancelStroke = useCallback(() => {
    finishSession(false);
  }, [finishSession]);

  const advance = useCallback(
    (deltaSeconds: number) => {
      const session = sessionRef.current;

      if (!session) {
        return;
      }

      if (session.kind === "dig") {
        if (session.paused) {
          return;
        }

        const elapsed = Math.min(MAX_DIG_ADVANCE_SECONDS, Math.max(0, deltaSeconds));

        if (elapsed <= 0) {
          return;
        }

        // Holding the button bores deeper along the ray the press established.
        session.length += session.speed * elapsed;
        session.capsule.end = addScaled(session.entry, session.direction, session.length);
        session.modifier.bounds = modifierWorldBounds(session.modifier);
        bumpDraft();
        return;
      }

      if (session.kind !== "brush") {
        return;
      }

      const point = session.livePoint;
      const normal = session.liveNormal;

      if (!point || !normal) {
        return;
      }

      const flowWeight = Math.min(Math.max(deltaSeconds, 0), MAX_ADVANCE_SECONDS) * BRUSH_FLOW_PER_SECOND;

      if (flowWeight <= 0) {
        return;
      }

      // Holding still keeps depositing. The newest dab thickens up to the
      // per-dab ceiling first, and only what will not fit spills into new dabs,
      // so a held brush builds smoothly instead of stepping once per frame.
      let remaining = flowWeight;
      const latest = session.modifier.points.at(-1);

      if (latest) {
        const applied = Math.min(remaining, Math.max(0, MAX_AUTHORED_DAB_WEIGHT - latest.weight));
        latest.weight += applied;
        remaining -= applied;
      }

      let appended = false;

      while (remaining > 1e-6) {
        const weight = Math.min(remaining, MAX_AUTHORED_DAB_WEIGHT);
        appendBrushPoint(session.modifier, point, normal, weight);
        remaining -= weight;
        appended = true;
      }

      if (appended) {
        session.lastPoint = { ...point };
        session.lastNormal = { ...normal };
      }

      bumpDraft();
    },
    [bumpDraft]
  );

  return {
    cursorRef,
    cursor,
    draftRef,
    draftVersionRef,
    isStroking,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    cancelStroke,
    advance,
    pickTerrainSurface
  };
}

// --- Session steps ---------------------------------------------------------

/**
 * Resamples the segment the pointer just covered at brush spacing.
 *
 * Pointer events arrive at whatever rate the device reports, which is not a
 * rate anyone drew at. Sampling the segment between the last dab and the new
 * position means a fast flick and a slow drag over the same path deposit the
 * same dabs -- and it is also why a pointer-move coalesced to one per frame
 * loses nothing.
 */
function continueBrush(session: BrushSession, hit: TerrainSurfaceHit): void {
  const modifier = session.modifier;
  const strokeNormal =
    modifier.type === "brush-stroke" && modifier.domain === "heightfield" ? { ...UP } : { ...hit.normal };

  session.livePoint = { ...hit.point };
  session.liveNormal = strokeNormal;

  const samples = sampleStrokeSegment(
    session.lastPoint,
    hit.point,
    session.lastNormal,
    strokeNormal,
    strokeSpacing(modifier.radius),
    spatialDabWeight(modifier.radius)
  );

  if (samples.length === 0) {
    return;
  }

  for (const sample of samples) {
    appendBrushPoint(modifier, sample, sample.normal, sample.weight);
  }

  const latest = samples[samples.length - 1];
  session.lastPoint = { x: latest.x, y: latest.y, z: latest.z };
  session.lastNormal = { ...latest.normal };
}

/**
 * Re-aims the drill.
 *
 * A new capsule is only started once the entry has actually moved or the aim has
 * swung; otherwise small pointer jitter would author a capsule per frame and
 * hand the CSG hundreds of near-identical operands for one carve.
 */
function continueDig(session: DigSession, hit: TerrainSurfaceHit): void {
  const direction = digDirection(hit.rayDirection, hit.normal);
  const moved = distance3(hit.point, session.entry);
  const aim = dot3(direction, session.direction);

  if (moved >= Math.max(0.5, session.radius * 0.4) || aim < 0.94) {
    session.entry = { ...hit.point };
    session.direction = direction;
    session.length = Math.max(0.75, session.radius * 0.7);
    session.capsule = createDigCapsule(
      session.entry,
      session.direction,
      session.radius,
      session.length,
      session.noise,
      session.noiseScale
    );
    session.modifier.volumes = [...session.modifier.volumes, session.capsule];
    session.modifier.bounds = modifierWorldBounds(session.modifier);
  }

  session.paused = false;
}

function hiddenCursor(settings: TerrainSculptSettings): TerrainBrushCursor {
  return {
    visible: false,
    position: { x: 0, y: 0, z: 0 },
    normal: { ...UP },
    radius: cursorRadius(settings),
    innerRadius: cursorInnerRadius(settings),
    followsSurface: followsSurface(settings),
    tool: settings.tool,
    brushMode: settings.brushMode,
    strength: settings.brushStrength,
    dragging: false
  };
}

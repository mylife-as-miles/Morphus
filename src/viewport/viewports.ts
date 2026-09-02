import {
  createOrthographicViewportState,
  createViewportState,
  type OrthographicViewportState,
  type PerspectiveViewportState,
  type ViewportState
} from "@blud/render-pipeline";
import { addVec3, subVec3, vec3, type Vec3 } from "@blud/shared";

export type ViewportPaneId = "perspective" | "top" | "front" | "side";
export type ViewModeId = "3d-only" | "split-top" | "split-front" | "split-side" | "quad";
export type ViewportRenderMode = "lit" | "wireframe";
export type ConstructionPlane = "xy" | "xz" | "yz";

export type ViewModePreset =
  | {
      id: "3d-only";
      label: string;
      layout: "single";
      shortLabel: string;
    }
  | {
      id: "split-top" | "split-front" | "split-side";
      label: string;
      layout: "split";
      secondaryPaneId: Exclude<ViewportPaneId, "perspective">;
      shortLabel: string;
    }
  | {
      id: "quad";
      label: string;
      layout: "quad";
      shortLabel: string;
    };

export const viewportPaneIds: ViewportPaneId[] = ["perspective", "top", "front", "side"];

export const viewportPaneDefinitions: Record<
  ViewportPaneId,
  {
    id: ViewportPaneId;
    label: string;
    plane: ConstructionPlane;
    renderMode: ViewportRenderMode;
    shortLabel: string;
  }
> = {
  perspective: {
    id: "perspective",
    label: "Perspective",
    plane: "xz",
    renderMode: "lit",
    shortLabel: "Perspective"
  },
  top: {
    id: "top",
    label: "Top",
    plane: "xz",
    renderMode: "wireframe",
    shortLabel: "Top"
  },
  front: {
    id: "front",
    label: "Front",
    plane: "xy",
    renderMode: "wireframe",
    shortLabel: "Front"
  },
  side: {
    id: "side",
    label: "Right",
    plane: "yz",
    renderMode: "wireframe",
    shortLabel: "Right"
  }
};

export const viewModePresets: ViewModePreset[] = [
  {
    id: "3d-only",
    label: "3D only",
    layout: "single",
    shortLabel: "3D Only"
  },
  {
    id: "split-top",
    label: "2-Split, left 3D, right top",
    layout: "split",
    secondaryPaneId: "top",
    shortLabel: "2-Split Top"
  },
  {
    id: "split-front",
    label: "2-Split, left 3D, right front",
    layout: "split",
    secondaryPaneId: "front",
    shortLabel: "2-Split Front"
  },
  {
    id: "split-side",
    label: "2-Split, left 3D, right side",
    layout: "split",
    secondaryPaneId: "side",
    shortLabel: "2-Split Side"
  },
  {
    id: "quad",
    label: "4-Split, top/front/3D/side",
    layout: "quad",
    shortLabel: "4-Split"
  }
];

export function getViewModePreset(viewModeId: ViewModeId) {
  return viewModePresets.find((preset) => preset.id === viewModeId) ?? viewModePresets[0];
}

export function resolveVisibleViewportPaneIds(viewModeId: ViewModeId): ViewportPaneId[] {
  const preset = getViewModePreset(viewModeId);

  if (preset.layout === "single") {
    return ["perspective"];
  }

  if (preset.layout === "split") {
    return ["perspective", preset.secondaryPaneId];
  }

  return ["perspective", "top", "front", "side"];
}

/**
 * How far the editor lets a camera pull back, in metres.
 *
 * Terrain is authored at kilometre scale -- a default mesh terrain is a 4 km
 * square -- and the shipped defaults (5 km orbit ceiling, 10 km perspective far
 * plane, a 500 m orthographic far plane) clipped the world away long before the
 * whole thing was on screen. The infinite construction grid already draws out
 * to 16 km, so these are sized to reach past it.
 */
const PERSPECTIVE_FAR = 200_000;
const PERSPECTIVE_NEAR = 0.25;
const PERSPECTIVE_MIN_DISTANCE = 0.05;
const PERSPECTIVE_MAX_DISTANCE = 150_000;
const ORTHOGRAPHIC_FAR = 200_000;
const ORTHOGRAPHIC_NEAR = 0.1;
const ORTHOGRAPHIC_MIN_ZOOM = 0.005;
const ORTHOGRAPHIC_MAX_ZOOM = 4_000;

/**
 * The infinite grid is not a mode any more.
 *
 * It used to be a toggle that defaulted off, which meant every new session
 * started inside a 256 m box with perimeter walls. Nothing about that helped
 * terrain work, so the grid is simply always infinite and the switch is gone.
 */
function withPerspectiveLimits(viewport: PerspectiveViewportState): PerspectiveViewportState {
  viewport.grid.infinite = true;
  viewport.camera.near = PERSPECTIVE_NEAR;
  viewport.camera.far = PERSPECTIVE_FAR;
  viewport.camera.minDistance = PERSPECTIVE_MIN_DISTANCE;
  viewport.camera.maxDistance = PERSPECTIVE_MAX_DISTANCE;

  return viewport;
}

function withOrthographicLimits(viewport: OrthographicViewportState): OrthographicViewportState {
  viewport.grid.infinite = true;
  viewport.camera.near = ORTHOGRAPHIC_NEAR;
  viewport.camera.far = ORTHOGRAPHIC_FAR;
  viewport.camera.minZoom = ORTHOGRAPHIC_MIN_ZOOM;
  viewport.camera.maxZoom = ORTHOGRAPHIC_MAX_ZOOM;

  return viewport;
}

export function createEditorViewports() {
  return {
    perspective: withPerspectiveLimits(createViewportState()),
    top: withOrthographicLimits(
      createOrthographicViewportState({
        position: vec3(0, 96, 0),
        target: vec3(0, 0, 0),
        up: vec3(0, 0, -1),
        zoom: 10
      })
    ),
    front: withOrthographicLimits(
      createOrthographicViewportState({
        position: vec3(0, 40, 96),
        target: vec3(0, 40, 0),
        up: vec3(0, 1, 0),
        zoom: 9
      })
    ),
    side: withOrthographicLimits(
      createOrthographicViewportState({
        position: vec3(96, 40, 0),
        target: vec3(0, 40, 0),
        up: vec3(0, 1, 0),
        zoom: 9
      })
    )
  } satisfies Record<ViewportPaneId, ViewportState>;
}

export function focusViewportOnPoint(viewport: ViewportState, point: Vec3) {
  const orbitOffset = subVec3(viewport.camera.position, viewport.camera.target);

  viewport.camera.target = vec3(point.x, point.y, point.z);
  viewport.camera.position = addVec3(point, orbitOffset);
}

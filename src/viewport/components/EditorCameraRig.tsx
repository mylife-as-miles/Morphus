import { MapControls, OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { toTuple } from "@blud/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, MOUSE, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import type { ViewportCanvasProps } from "@/viewport/types";

const worldUp = new Vector3(0, 1, 0);
const tempDirection = new Vector3();
const tempRight = new Vector3();
const tempMovement = new Vector3();
const tempTarget = new Vector3();

const trackedFlyKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "KeyA",
  "KeyD",
  "KeyE",
  "KeyQ",
  "KeyS",
  "KeyW",
  "PageDown",
  "PageUp",
  "ShiftLeft",
  "ShiftRight"
]);

export function EditorCameraRig({
  controlsEnabled,
  onViewportChange,
  viewportId,
  viewport
}: Pick<ViewportCanvasProps, "onViewportChange" | "viewport" | "viewportId"> & { controlsEnabled: boolean }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const eventsConnected = useThree((state) => state.events.connected as HTMLElement | undefined);
  const controlsRef = useRef<any>(null);
  const flyLookActiveRef = useRef(false);
  const flySpeedRef = useRef(18);
  const keyStateRef = useRef(new Set<string>());
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lookDistanceRef = useRef(12);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const [flyLookActive, setFlyLookActive] = useState(false);

  const controlsDomElement = useMemo((): HTMLElement | undefined => {
    const connected = eventsConnected;
    if (connected && typeof (connected as unknown as { style?: unknown }).style !== "undefined") {
      return connected;
    }
    const dom = gl.domElement as HTMLElement | undefined;
    if (dom && typeof (dom as unknown as { style?: unknown }).style !== "undefined") {
      return dom;
    }
    return undefined;
  }, [gl.domElement, eventsConnected]);

  const setViewportNavigationState = useCallback((mode?: "fly") => {
    if (typeof document === "undefined") {
      return;
    }

    if (!mode) {
      delete document.body.dataset.viewportNavigation;
      return;
    }

    document.body.dataset.viewportNavigation = mode;
  }, []);

  const syncViewport = useCallback(() => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    if (camera instanceof PerspectiveCamera && viewport.projection === "perspective") {
      onViewportChange(viewportId, {
        ...viewport,
        camera: {
          ...viewport.camera,
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
          },
          target: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
          }
        }
      });
      return;
    }

    if (camera instanceof OrthographicCamera && viewport.projection === "orthographic") {
      onViewportChange(viewportId, {
        ...viewport,
        camera: {
          ...viewport.camera,
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
          },
          target: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
          },
          up: {
            x: camera.up.x,
            y: camera.up.y,
            z: camera.up.z
          },
          zoom: camera.zoom
        }
      });
    }
  }, [camera, onViewportChange, viewport, viewportId]);

  const syncFlyAnglesFromView = useCallback(() => {
    const controls = controlsRef.current;

    if (!(camera instanceof PerspectiveCamera) || viewport.projection !== "perspective" || !controls) {
      return;
    }

    tempDirection.subVectors(controls.target, camera.position);

    if (tempDirection.lengthSq() <= 0.000001) {
      camera.getWorldDirection(tempDirection);
    } else {
      tempDirection.normalize();
    }

    lookDistanceRef.current = Math.max(6, camera.position.distanceTo(controls.target));
    yawRef.current = Math.atan2(tempDirection.x, tempDirection.z);
    pitchRef.current = Math.asin(MathUtils.clamp(tempDirection.y, -0.999, 0.999));
  }, [camera, viewport.projection]);

  const applyFlyLookDelta = useCallback(
    (deltaX: number, deltaY: number) => {
      const controls = controlsRef.current;

      if (!(camera instanceof PerspectiveCamera) || viewport.projection !== "perspective" || !controls) {
        return;
      }

      yawRef.current -= deltaX * 0.0045;
      pitchRef.current = MathUtils.clamp(
        pitchRef.current - deltaY * 0.0032,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04
      );

      const cosPitch = Math.cos(pitchRef.current);
      tempDirection.set(
        Math.sin(yawRef.current) * cosPitch,
        Math.sin(pitchRef.current),
        Math.cos(yawRef.current) * cosPitch
      );
      tempTarget.copy(camera.position).addScaledVector(tempDirection, lookDistanceRef.current);
      controls.target.copy(tempTarget);
      camera.lookAt(tempTarget);
      controls.update();
    },
    [camera, viewport.projection]
  );

  useEffect(() => {
    const [x, y, z] = toTuple(viewport.camera.position);
    const [targetX, targetY, targetZ] = toTuple(viewport.camera.target);

    camera.position.set(x, y, z);
    camera.near = viewport.camera.near;
    camera.far = viewport.camera.far;

    if ("up" in viewport.camera) {
      camera.up.set(viewport.camera.up.x, viewport.camera.up.y, viewport.camera.up.z);
    }

    if (camera instanceof PerspectiveCamera && viewport.projection === "perspective") {
      camera.fov = viewport.camera.fov;
    }

    if (camera instanceof OrthographicCamera && viewport.projection === "orthographic") {
      camera.zoom = viewport.camera.zoom;
    }

    camera.updateProjectionMatrix();

    controlsRef.current?.target.set(targetX, targetY, targetZ);
    controlsRef.current?.update();
    syncFlyAnglesFromView();
  }, [
    camera,
    syncFlyAnglesFromView,
    viewport.camera.far,
    viewport.camera.near,
    viewport.camera.position.x,
    viewport.camera.position.y,
    viewport.camera.position.z,
    viewport.camera.target.x,
    viewport.camera.target.y,
    viewport.camera.target.z,
    viewport.projection,
    "fov" in viewport.camera ? viewport.camera.fov : undefined,
    "up" in viewport.camera ? viewport.camera.up.x : undefined,
    "up" in viewport.camera ? viewport.camera.up.y : undefined,
    "up" in viewport.camera ? viewport.camera.up.z : undefined,
    "zoom" in viewport.camera ? viewport.camera.zoom : undefined
  ]);

  useEffect(() => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const handleEnd = () => {
      syncViewport();
      syncFlyAnglesFromView();
    };

    controls.addEventListener("end", handleEnd);

    return () => {
      controls.removeEventListener("end", handleEnd);
    };
  }, [syncFlyAnglesFromView, syncViewport]);

  useEffect(() => {
    if (controlsEnabled || !flyLookActiveRef.current) {
      return;
    }

    flyLookActiveRef.current = false;
    setFlyLookActive(false);
    lastPointerRef.current = null;
    keyStateRef.current.clear();
    setViewportNavigationState();
    syncViewport();
  }, [controlsEnabled, setViewportNavigationState, syncViewport]);

  useEffect(() => {
    const rawDom = gl.domElement as HTMLElement | undefined;
    const domElement: HTMLElement =
      rawDom && typeof rawDom.addEventListener === "function"
        ? rawDom
        : eventsConnected ?? (rawDom as unknown as HTMLElement);

    if (!domElement || typeof domElement.addEventListener !== "function") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (
        controlsEnabled &&
        viewport.projection === "perspective" &&
        flyLookActiveRef.current &&
        trackedFlyKeys.has(event.code)
      ) {
        keyStateRef.current.add(event.code);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keyStateRef.current.delete(event.code);
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (!controlsEnabled || viewport.projection !== "perspective" || event.button !== 2) {
        return;
      }

      event.preventDefault();
      syncFlyAnglesFromView();
      flyLookActiveRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      setViewportNavigationState("fly");
      setFlyLookActive(true);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!flyLookActiveRef.current || viewport.projection !== "perspective") {
        return;
      }

      const lastPointer = lastPointerRef.current;

      if (!lastPointer) {
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        return;
      }

      const deltaX = event.clientX - lastPointer.x;
      const deltaY = event.clientY - lastPointer.y;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      applyFlyLookDelta(deltaX, deltaY);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!flyLookActiveRef.current || event.button !== 2) {
        return;
      }

      flyLookActiveRef.current = false;
      lastPointerRef.current = null;
      keyStateRef.current.clear();
      setViewportNavigationState();
      setFlyLookActive(false);
      syncViewport();
    };

    const handleWheel = (event: WheelEvent) => {
      if (!flyLookActiveRef.current || viewport.projection !== "perspective") {
        return;
      }

      event.preventDefault();
      const speedScale = event.deltaY > 0 ? 0.88 : 1.14;
      flySpeedRef.current = MathUtils.clamp(flySpeedRef.current * speedScale, 2, 120);
    };

    const handleWindowBlur = () => {
      keyStateRef.current.clear();

      if (!flyLookActiveRef.current) {
        return;
      }

      flyLookActiveRef.current = false;
      lastPointerRef.current = null;
      setViewportNavigationState();
      setFlyLookActive(false);
      syncViewport();
    };

    domElement.addEventListener("mousedown", handleMouseDown);
    domElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      domElement.removeEventListener("mousedown", handleMouseDown);
      domElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setViewportNavigationState();
    };
  }, [
    applyFlyLookDelta,
    controlsEnabled,
    eventsConnected,
    gl.domElement,
    setViewportNavigationState,
    syncFlyAnglesFromView,
    syncViewport,
    viewport.projection
  ]);

  useFrame((_, delta) => {
    if (
      !flyLookActiveRef.current ||
      !controlsEnabled ||
      !(camera instanceof PerspectiveCamera) ||
      viewport.projection !== "perspective"
    ) {
      return;
    }

    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const activeKeys = keyStateRef.current;

    if (activeKeys.size === 0) {
      return;
    }

    camera.getWorldDirection(tempDirection).normalize();
    tempRight.crossVectors(tempDirection, camera.up).normalize();
    tempMovement.set(0, 0, 0);

    if (activeKeys.has("KeyW") || activeKeys.has("ArrowUp")) {
      tempMovement.add(tempDirection);
    }

    if (activeKeys.has("KeyS") || activeKeys.has("ArrowDown")) {
      tempMovement.sub(tempDirection);
    }

    if (activeKeys.has("KeyD") || activeKeys.has("ArrowRight")) {
      tempMovement.add(tempRight);
    }

    if (activeKeys.has("KeyA") || activeKeys.has("ArrowLeft")) {
      tempMovement.sub(tempRight);
    }

    if (activeKeys.has("KeyE") || activeKeys.has("PageUp")) {
      tempMovement.add(worldUp);
    }

    if (activeKeys.has("KeyQ") || activeKeys.has("PageDown")) {
      tempMovement.sub(worldUp);
    }

    if (tempMovement.lengthSq() <= 0.000001) {
      return;
    }

    const speedBoost = activeKeys.has("ShiftLeft") || activeKeys.has("ShiftRight") ? 2.4 : 1;
    tempMovement.normalize().multiplyScalar(flySpeedRef.current * delta * speedBoost);
    camera.position.add(tempMovement);
    controls.target.add(tempMovement);
    camera.lookAt(controls.target);
    controls.update();
  });

  const orthographicMouseButtons = useMemo(
    () => ({
      LEFT: -1,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN
    }),
    []
  );

  const perspectiveMouseButtons = useMemo(
    () => ({
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.PAN,
      RIGHT: -1
    }),
    []
  );

  if (!controlsDomElement) {
    return null;
  }

  if (viewport.projection === "orthographic") {
    return (
      <MapControls
        ref={controlsRef}
        domElement={controlsDomElement}
        enabled={controlsEnabled}
        enableRotate={false}
        makeDefault
        maxZoom={viewport.camera.maxZoom}
        minZoom={viewport.camera.minZoom}
        mouseButtons={orthographicMouseButtons}
        screenSpacePanning
        target={toTuple(viewport.camera.target)}
      />
    );
  }

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.12}
      domElement={controlsDomElement}
      enableDamping={!flyLookActive}
      enablePan
      enabled={controlsEnabled && !flyLookActive}
      makeDefault
      maxDistance={viewport.camera.maxDistance}
      maxPolarAngle={Math.PI - 0.01}
      minDistance={viewport.camera.minDistance}
      minPolarAngle={0.01}
      mouseButtons={perspectiveMouseButtons}
      panSpeed={0.9}
      rotateSpeed={0.82}
      target={toTuple(viewport.camera.target)}
      zoomSpeed={0.9}
    />
  );
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

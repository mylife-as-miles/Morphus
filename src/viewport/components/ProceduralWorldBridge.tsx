import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { ProceduralWorldNode } from "@blud/shared";
import {
  ProceduralWorldRuntime,
  type ProceduralWorldStatus
} from "@blud/procedural-world";
import type { PerspectiveCamera } from "three";
import type { WebGPURenderer } from "three/webgpu";
import {
  clearProceduralWorldRuntimeStatus,
  publishProceduralWorldRuntimeStatus,
} from "@/lib/procedural-world/runtime-diagnostics";
import { registerProceduralWorldRuntimeActions } from "@/lib/procedural-world/runtime-actions";

type ProceduralWorldBridgeProps = {
  node?: ProceduralWorldNode;
  onStatusChange?: (status: ProceduralWorldBridgeStatus) => void;
};

export type ProceduralWorldBridgeStatus =
  | { kind: "inactive" }
  | { kind: "generating"; progress: number; stage: string }
  | { kind: "ready"; status: ProceduralWorldStatus }
  | { kind: "unsupported"; reason: string }
  | { kind: "error"; reason: string };

export function ProceduralWorldBridge({ node, onStatusChange }: ProceduralWorldBridgeProps) {
  const { camera, gl, invalidate, scene } = useThree();
  const [runtime, setRuntime] = useState<ProceduralWorldRuntime | null>(null);
  const statusCallback = useRef(onStatusChange);
  const applyQueue = useRef(Promise.resolve());
  statusCallback.current = onStatusChange;

  useEffect(() => {
    let cancelled = false;
    let createdRuntime: ProceduralWorldRuntime | null = null;
    if (!node?.data.enabled) {
      setRuntime(null);
      statusCallback.current?.({ kind: "inactive" });
      return undefined;
    }
    if (!isPerspectiveCamera(camera)) {
      statusCallback.current?.({ kind: "unsupported", reason: "Procedural worlds require a perspective viewport camera." });
      return undefined;
    }
    if (!isWebGpuRenderer(gl)) {
      statusCallback.current?.({
        kind: "unsupported",
        reason: "Procedural world requires WebGPU. Enable WebGPU for this editor session and reload the viewport."
      });
      return undefined;
    }

    statusCallback.current?.({ kind: "generating", progress: 0, stage: "Preparing WebGPU world" });
    void ProceduralWorldRuntime.create(
      {
        camera,
        canvas: gl.domElement,
        renderer: gl,
        requestRender: invalidate,
        scene
      },
      node.data,
      {
        onProgress(progress, stage) {
          statusCallback.current?.({ kind: "generating", progress, stage });
        },
        onStatus(status) {
          publishProceduralWorldRuntimeStatus(node.id, status);
        }
      }
    )
      .then((nextRuntime) => {
        if (cancelled) {
          nextRuntime.dispose();
          return;
        }
        createdRuntime = nextRuntime;
        setRuntime(nextRuntime);
        statusCallback.current?.({ kind: "ready", status: nextRuntime.getStatus() });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        statusCallback.current?.({
          kind: "error",
          reason: error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
      setRuntime(null);
      createdRuntime?.dispose();
      clearProceduralWorldRuntimeStatus(node.id);
    };
  }, [camera, gl, invalidate, node?.data.enabled, node?.id, scene]);

  useEffect(() => {
    if (!runtime || !node?.data.enabled) return;
    let cancelled = false;
    const nextData = structuredClone(node.data);
    applyQueue.current = applyQueue.current
      .then(async () => {
        if (cancelled) return;
        statusCallback.current?.({ kind: "generating", progress: runtime.getStatus().progress, stage: "Applying world configuration" });
        await runtime.applyConfig(nextData);
        if (!cancelled) {
          const status = runtime.getStatus();
          publishProceduralWorldRuntimeStatus(node.id, status);
          statusCallback.current?.({ kind: "ready", status });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          statusCallback.current?.({
            kind: "error",
            reason: error instanceof Error ? error.message : String(error)
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [node?.data, runtime]);

  useEffect(() => {
    if (!runtime || !node) return;
    return registerProceduralWorldRuntimeActions(node.id, (action) => runtime.forceRegenerate(action));
  }, [node?.id, runtime]);

  return runtime ? <ProceduralWorldRenderLoop runtime={runtime} /> : null;
}

function ProceduralWorldRenderLoop({ runtime }: { runtime: ProceduralWorldRuntime }) {
  useFrame((state, deltaSeconds) => {
    runtime.update(deltaSeconds, state.clock.elapsedTime);
    runtime.render();
  }, 1);
  return null;
}

function isPerspectiveCamera(camera: unknown): camera is PerspectiveCamera {
  return Boolean((camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera);
}

function isWebGpuRenderer(renderer: unknown): renderer is WebGPURenderer {
  return Boolean((renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer);
}

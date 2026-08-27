import { useSyncExternalStore } from "react";
import type { ProceduralWorldStatus } from "@blud/procedural-world";

const statuses = new Map<string, ProceduralWorldStatus>();
const listeners = new Set<() => void>();

export function publishProceduralWorldRuntimeStatus(nodeId: string, status: ProceduralWorldStatus): void {
  statuses.set(nodeId, status);
  for (const listener of listeners) listener();
}

export function clearProceduralWorldRuntimeStatus(nodeId: string): void {
  if (!statuses.delete(nodeId)) return;
  for (const listener of listeners) listener();
}

export function getProceduralWorldRuntimeStatus(nodeId: string): ProceduralWorldStatus | undefined {
  return statuses.get(nodeId);
}

export function useProceduralWorldRuntimeStatus(nodeId: string): ProceduralWorldStatus | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => statuses.get(nodeId),
    () => undefined,
  );
}

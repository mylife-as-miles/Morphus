import type { ConfigBindingResult, ProceduralWorldSystem } from "@blud/shared";

export type ProceduralWorldRuntimeAction = ProceduralWorldSystem | "world";

type RuntimeActionHandler = (action: ProceduralWorldRuntimeAction) => Promise<ConfigBindingResult>;

const handlers = new Map<string, RuntimeActionHandler>();

export function registerProceduralWorldRuntimeActions(
  nodeId: string,
  handler: RuntimeActionHandler,
): () => void {
  handlers.set(nodeId, handler);
  return () => {
    if (handlers.get(nodeId) === handler) handlers.delete(nodeId);
  };
}

export async function requestProceduralWorldRuntimeAction(
  nodeId: string,
  action: ProceduralWorldRuntimeAction,
): Promise<ConfigBindingResult> {
  const handler = handlers.get(nodeId);
  if (!handler) throw new Error("An active WebGPU procedural-world runtime is required for this action.");
  return handler(action);
}

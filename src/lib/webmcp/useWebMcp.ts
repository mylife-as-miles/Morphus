/**
 * Registers Morphus's tools with the browser's agent, for as long as the
 * editor is mounted.
 *
 * Registration is a side effect with a lifetime, which is exactly what an
 * effect is for. WebMCP has no `unregisterTool` -- an `AbortSignal` passed at
 * registration is how a tool goes away -- so the cleanup aborts the controller
 * and every tool registered under it disappears together.
 */

import { useEffect, useState } from "react";
import type { EditorCore } from "@blud/editor-core";
import type { CopilotToolExecutionContext } from "@/lib/copilot/tool-executor";
import { buildWebMcpTools, type WebMcpActivity } from "@/lib/webmcp/tools";
import { webMcpAvailable } from "@/lib/webmcp/types";

export type WebMcpStatus = {
  /** False in browsers without the origin trial or the testing flag. */
  available: boolean;
  registered: number;
  /** Newest first, capped -- this is a live feed, not an audit log. */
  activity: WebMcpActivity[];
  error?: string;
};

const ACTIVITY_LIMIT = 40;

export function useWebMcp(
  editor: EditorCore,
  context: CopilotToolExecutionContext
): WebMcpStatus {
  const [status, setStatus] = useState<WebMcpStatus>(() => ({
    available: webMcpAvailable(),
    activity: [],
    registered: 0
  }));

  useEffect(() => {
    if (!webMcpAvailable()) {
      setStatus((current) => ({ ...current, available: false, registered: 0 }));
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const tools = buildWebMcpTools({
      context,
      editor,
      onActivity: (entry) => {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          activity: [entry, ...current.activity].slice(0, ACTIVITY_LIMIT)
        }));
      }
    });

    void (async () => {
      let registered = 0;
      try {
        for (const tool of tools) {
          // Sequential on purpose: registerTool may be async, and a rejection
          // should stop the run with an accurate count rather than leave a
          // half-registered set reported as complete.
          // The signal belongs in the options bag, not on the tool: aborting
          // the controller is the only way to unregister -- there is no
          // unregisterTool in the API.
          await document.modelContext?.registerTool(tool, { signal: controller.signal });
          registered += 1;
        }
        if (!cancelled) {
          setStatus((current) => ({ ...current, available: true, error: undefined, registered }));
        }
      } catch (error) {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          available: true,
          error: error instanceof Error ? error.message : String(error),
          registered
        }));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `context` is rebuilt every render by its owner; re-registering on each
    // one would churn the agent's tool list, so registration is keyed to the
    // editor instance and the closure keeps the latest context by reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return status;
}

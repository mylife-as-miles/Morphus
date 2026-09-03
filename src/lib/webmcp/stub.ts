/**
 * A stand-in `document.modelContext`, for testing tools without an agent.
 *
 * WebMCP needs Chrome's origin trial or `chrome://flags/#enable-webmcp-testing`,
 * which makes the registration path awkward to exercise: the code that matters
 * runs only in a browser most people are not using, so a mistake in it stays
 * invisible until the one demo that has to work.
 *
 * This installs the smallest thing the app can register into, so the bridge --
 * the schemas, the budgets, the executor wiring, the activity feed -- can be
 * driven directly from the console. It is not an agent and does not pretend to
 * be one: there is no model here, so it answers "did this tool run and return
 * what it promised", which is the deterministic half of testing that Chrome's
 * own guidance says to settle before writing evals.
 *
 * Opt-in via `?webmcp=stub`, and never installed over a real implementation.
 */

import type { ModelContext, WebMcpRegisterOptions, WebMcpToolDefinition } from "@/lib/webmcp/types";

export type WebMcpTestHarness = {
  /** Tool names currently registered, in registration order. */
  list: () => string[];
  /** Full definitions, to inspect the schema an agent would receive. */
  describe: (name?: string) => WebMcpToolDefinition[];
  /** Runs a tool the way an agent would, returning the string it would see. */
  call: (name: string, input?: Record<string, unknown>) => Promise<string>;
};

declare global {
  interface Window {
    /** Present only under `?webmcp=stub`. */
    __webmcp?: WebMcpTestHarness;
  }
}

/**
 * Installs the stub if this page asked for it and nothing better exists.
 *
 * Returns whether it installed, so the caller can log the difference between
 * "the harness is ready" and "a real WebMCP implementation is already here".
 */
export function installWebMcpStub(): boolean {
  if (typeof document === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("webmcp") !== "stub") return false;

  // Never shadow the real thing. A page opened with the flag *and* the query
  // param should exercise the browser's implementation, not this one.
  if (typeof document.modelContext?.registerTool === "function") return false;

  const tools: WebMcpToolDefinition[] = [];

  const context: ModelContext = {
    registerTool(tool: WebMcpToolDefinition, options?: WebMcpRegisterOptions) {
      // Registration is undone by aborting the signal, so the stub has to
      // honour that too -- otherwise a remount leaves duplicates behind and the
      // count reads correct while the list is wrong.
      if (options?.signal?.aborted) return;

      tools.push(tool);
      options?.signal?.addEventListener("abort", () => {
        const at = tools.indexOf(tool);
        if (at >= 0) tools.splice(at, 1);
      });
    },
    async getTools() {
      return tools.map(({ annotations, description, inputSchema, name }) => ({
        annotations,
        description,
        inputSchema,
        name
      }));
    }
  };

  document.modelContext = context;

  window.__webmcp = {
    async call(name, input = {}) {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`No registered tool named "${name}".`);
      return tool.execute(input);
    },
    describe: (name) => (name ? tools.filter((tool) => tool.name === name) : [...tools]),
    list: () => tools.map((tool) => tool.name)
  };

  return true;
}

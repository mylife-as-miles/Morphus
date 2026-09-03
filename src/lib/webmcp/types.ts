/**
 * Minimal typings for the WebMCP browser API.
 *
 * WebMCP is an origin-trial API and is explicitly "under active discussion and
 * subject to change", so these describe only the surface this app touches
 * rather than mirroring a moving spec. Everything is optional because the API
 * is absent in most browsers today and the editor must behave exactly as before
 * when it is.
 *
 * (There is a `webmcp-types` package upstream; these are hand-written to keep
 * the dependency surface small and to document the parts we rely on.)
 */

/**
 * Hints the agent uses to decide how freely it may call a tool.
 *
 * `readOnlyHint` marks a tool that only observes, which lets an agent inspect
 * the scene without treating it as a change worth confirming.
 * `untrustedContentHint` marks a result carrying content the page did not
 * author -- scene names typed by the user, for instance -- so the agent treats
 * it as data rather than as instructions.
 */
export type WebMcpAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

export type WebMcpToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpAnnotations;
  /**
   * Resolves to the text the agent sees.
   *
   * The second argument carries an AbortSignal for the *execution*, which the
   * agent or user can cancel; it is distinct from the registration signal that
   * unregisters the tool.
   */
  execute: (
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ) => Promise<string> | string;
};

/** Options bag for `registerTool` -- note the signal lives here, not on the tool. */
export type WebMcpRegisterOptions = {
  /** Aborting unregisters the tool. There is no `unregisterTool`. */
  signal?: AbortSignal;
  /** Secure origins allowed to see and call this tool cross-origin. */
  exposedTo?: string[];
};

export type ModelContext = {
  registerTool: (
    tool: WebMcpToolDefinition,
    options?: WebMcpRegisterOptions
  ) => Promise<void> | void;
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<unknown[]>;
  executeTool?: (tool: unknown, input: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
  addEventListener?: (type: "toolchange", listener: () => void) => void;
  removeEventListener?: (type: "toolchange", listener: () => void) => void;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

/**
 * True when the browser exposes WebMCP.
 *
 * Chrome needs either the origin trial or `chrome://flags/#enable-webmcp-testing`,
 * and the API is additionally gated on the document being origin-isolated, so a
 * page served with `Origin-Agent-Cluster: ?0` will not see it.
 */
export function webMcpAvailable(): boolean {
  return typeof document !== "undefined" && typeof document.modelContext?.registerTool === "function";
}

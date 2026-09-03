/**
 * The tools Morphus exposes to agents over WebMCP.
 *
 * The editor already describes everything it can do to its own Copilot: 145
 * declarations in `tool-declarations.ts`, each with a written description and a
 * JSON Schema, executed by one `executeTool` switch. WebMCP asks for exactly
 * that shape, so this file is a bridge rather than a second implementation --
 * an agent in the browser and the in-app Copilot run the *same* code paths, and
 * neither can drift from the other.
 *
 * What is deliberately *not* bridged is all 145. A tool list is a prompt: every
 * entry costs the agent attention, and a catalogue that includes
 * `offset_brush_face` next to `create_mesh_terrain` makes the interesting
 * capabilities harder to find, not easier. So this is a curated set chosen to
 * answer one question well -- can a person and an agent build a 3D world
 * together? -- with the read tools an agent needs to act on what is really
 * there instead of on what it assumes.
 */

import type { EditorCore } from "@blud/editor-core";
import { COPILOT_TOOL_DECLARATIONS } from "@/lib/copilot/tool-declarations";
import { executeTool, type CopilotToolExecutionContext } from "@/lib/copilot/tool-executor";
import type { WebMcpToolDefinition } from "@/lib/webmcp/types";

/**
 * The exposed surface, grouped by the story each group tells.
 *
 * Order matters a little: agents read the list top-down, and leading with
 * "look at what exists" before "change it" nudges toward inspecting first.
 */
export const WEBMCP_TOOL_NAMES = [
  // Look before acting.
  "list_nodes",
  "get_scene_settings",
  "get_terrain_state",
  "get_forest_state",
  "list_vfx_abilities",
  "capture_viewport_screenshot",

  // Terrain: the landform itself.
  "create_mesh_terrain",
  "terrain_sculpt_stroke",
  "terrain_refine_density",
  "terrain_carve_tunnel",
  "terrain_paint_weights",

  // Forests: a stand is a shape on the ground, grown as its own step.
  "create_forest_field",
  "add_forest_points",
  "configure_forest_field",
  "grow_forest_field",

  // Ordinary scene building, so an agent is not limited to terrain.
  "place_primitive",
  "place_blockout_room",
  "set_scene_settings",
  "delete_nodes",

  // Show, don't tell.
  "cast_vfx_ability"
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];

/**
 * Tools that change the document, and so should be summarised for the user.
 *
 * WebMCP runs tools visibly in the page, which is most of what makes it
 * trustworthy -- but "visibly" only helps if the change is legible. These are
 * the ones worth narrating in the activity feed.
 */
const MUTATING_TOOLS = new Set<string>([
  "create_mesh_terrain",
  "terrain_sculpt_stroke",
  "terrain_refine_density",
  "terrain_carve_tunnel",
  "terrain_paint_weights",
  "create_forest_field",
  "add_forest_points",
  "configure_forest_field",
  "grow_forest_field",
  "place_primitive",
  "place_blockout_room",
  "set_scene_settings",
  "delete_nodes",
  "cast_vfx_ability"
]);

/** Tools that only observe. Marked readOnlyHint so an agent may call them freely. */
const READ_ONLY_TOOLS = new Set<string>([
  "list_nodes",
  "get_scene_settings",
  "get_terrain_state",
  "get_forest_state",
  "list_vfx_abilities",
  "capture_viewport_screenshot"
]);

/**
 * Character budgets recommended for WebMCP tools.
 *
 * These are Chrome's published guidance, not spec limits: agents apply their
 * own guardrails, and a description or result that overruns is liable to be
 * dropped or truncated somewhere the page cannot see. Morphus's own Copilot
 * descriptions were written without a budget -- some run past 800 characters --
 * so they are shortened here rather than in the shared declarations, where the
 * longer text is still useful to a model with a bigger context window.
 */
const NAME_BUDGET = 30;
const DESCRIPTION_BUDGET = 500;
const PARAM_DESCRIPTION_BUDGET = 150;
const OUTPUT_BUDGET = 1500;

/**
 * Purpose-written descriptions for tools whose Copilot text overruns.
 *
 * Written rather than truncated: cutting a description mid-sentence removes
 * exactly the part that says when *not* to reach for the tool, which is the
 * half an agent most needs.
 */
const DESCRIPTION_OVERRIDES: Partial<Record<WebMcpToolName, string>> = {
  terrain_sculpt_stroke:
    "Sculpts the terrain along a path of world-space points, in meters. Nine modes: raise and lower move the surface, clay builds mass, smooth relaxes it, flatten levels toward one height, pinch sharpens ridges, scrape planes material away, terrace cuts benches, noise adds grain. Domain 'heightfield' moves straight up, 'mesh' follows the picked surface normal and can form overhangs. Strokes stack non-destructively, so build a landform in passes rather than one huge stroke.",
  cast_vfx_ability:
    "Fires one of seven combat abilities in the viewport as a one-off effect. Each travels from an origin along a flat heading, erupts at the far end, then clears itself. Use it to show what an ability looks like or to dress a frame. The cast is not saved with the scene. Call list_vfx_abilities first to match an ability to what the user described."
};

/** Trims a string to a budget on a word boundary, marking that it was cut. */
function fitToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
}

/**
 * Copies a JSON Schema with every parameter description inside budget.
 *
 * The schema is shared with the Copilot declarations, so it is cloned rather
 * than edited -- trimming in place would shorten the text the in-app Copilot
 * sees too, and it has no such limit.
 */
function fitSchemaToBudget(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return schema;

  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      trimmed[key] = value;
      continue;
    }
    const property = { ...(value as Record<string, unknown>) };
    if (typeof property.description === "string") {
      property.description = fitToBudget(property.description, PARAM_DESCRIPTION_BUDGET);
    }
    trimmed[key] = property;
  }

  return { ...schema, properties: trimmed };
}

/**
 * Caps a tool result, telling the agent how to get the rest.
 *
 * A silent truncation reads as a complete answer, which is how an agent ends up
 * confidently acting on half a scene graph. Naming the tool that returns a
 * smaller view gives it somewhere to go instead.
 */
function fitResultToBudget(name: string, result: string): string {
  if (result.length <= OUTPUT_BUDGET) return result;

  const advice =
    name === "list_nodes"
      ? " Ask for a specific node with get_node_details rather than the whole scene."
      : name === "get_terrain_state"
        ? " The modifier list is long; sculpt relative to the most recent entries."
        : "";

  return JSON.stringify({
    success: true,
    truncated: true,
    note: `Result was ${result.length} characters and has been shortened to fit the agent's budget.${advice}`,
    preview: result.slice(0, OUTPUT_BUDGET - 240)
  });
}

export type WebMcpActivity = {
  name: string;
  input: Record<string, unknown>;
  result: string;
  ok: boolean;
  mutating: boolean;
  at: number;
};

export type BuildWebMcpToolsOptions = {
  editor: EditorCore;
  context: CopilotToolExecutionContext;
  onActivity?: (activity: WebMcpActivity) => void;
};

/**
 * Turns the curated names into WebMCP tool definitions.
 *
 * The Copilot executor answers with a JSON string that already carries either a
 * result payload or `{ success: false, error }`. That is handed back verbatim:
 * agents parse JSON reliably, and rewriting it into prose here would only lose
 * the structure the schema promised.
 */
export function buildWebMcpTools({
  editor,
  context,
  onActivity
}: BuildWebMcpToolsOptions): WebMcpToolDefinition[] {
  const declarations = new Map(COPILOT_TOOL_DECLARATIONS.map((tool) => [tool.name, tool]));

  return WEBMCP_TOOL_NAMES.flatMap((name) => {
    const declaration = declarations.get(name);
    // A curated name that no longer exists is a bug in this list, not a reason
    // to fail startup -- the editor must still open.
    if (!declaration) {
      console.warn(`[WebMCP] No declaration for curated tool "${name}"; skipping.`);
      return [];
    }

    if (name.length > NAME_BUDGET) {
      console.warn(`[WebMCP] Tool name "${name}" exceeds the ${NAME_BUDGET}-character budget.`);
    }

    const definition: WebMcpToolDefinition = {
      name,
      description: fitToBudget(
        DESCRIPTION_OVERRIDES[name] ?? declaration.description,
        DESCRIPTION_BUDGET
      ),
      inputSchema: fitSchemaToBudget(declaration.parameters),
      annotations: {
        readOnlyHint: READ_ONLY_TOOLS.has(name),
        // Results can echo scene and node names the user typed. Flagging them
        // keeps an agent treating that text as data rather than as instructions.
        untrustedContentHint: true
      },
      execute: async (input, options) => {
        const args = (input ?? {}) as Record<string, unknown>;

        // The agent or the user can cancel a call mid-flight; a sculpt over a
        // 4 km terrain is long enough for that to matter.
        if (options?.signal?.aborted) {
          return JSON.stringify({ success: false, error: "Cancelled before execution." });
        }
        const outcome = await executeTool(
          editor,
          { id: `webmcp_${Date.now()}_${name}`, name, args },
          context
        );

        let ok = true;
        try {
          ok = (JSON.parse(outcome.result) as { success?: boolean }).success !== false;
        } catch {
          ok = true;
        }

        onActivity?.({
          at: Date.now(),
          input: args,
          mutating: MUTATING_TOOLS.has(name),
          name,
          ok,
          result: outcome.result
        });

        return fitResultToBudget(name, outcome.result);
      }
    };

    return [definition];
  });
}

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
 * The whole surface is bridged. An earlier version exposed a curated twenty on
 * the theory that a tool list is a prompt and every entry spends the agent's
 * attention. That reasoning still holds for a *small* model with a *short*
 * catalogue, but it cuts the other way here: the editor's real capability is
 * the 145, and an agent that cannot inset a face or rebuild a navmesh is not
 * operating this editor -- it is operating a demo of it. Curation is now the
 * agent's job, which is what the ordering and the read/write annotations below
 * are for.
 */

import type { EditorCore } from "@blud/editor-core";
import { COPILOT_TOOL_DECLARATIONS } from "@/lib/copilot/tool-declarations";
import { executeTool, type CopilotToolExecutionContext } from "@/lib/copilot/tool-executor";
import type { WebMcpToolDefinition } from "@/lib/webmcp/types";

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
 * Verbs that only ever observe.
 *
 * Derived from the name rather than hand-listed: a hand-kept set of 25 read
 * tools beside 145 declarations is a list that goes stale the first time
 * someone adds a `get_`, and a tool wrongly marked read-only is worse than one
 * left unmarked -- it invites an agent to call a mutation speculatively.
 */
const READ_ONLY_PREFIXES = ["get_", "list_", "inspect_", "search_", "read_", "capture_"];

/**
 * Tools whose name reads as an observation but which change the document.
 *
 * `capture_mesh_modeling_base` captures the current topology *as the base of a
 * live modelling stack* -- it writes. The prefix rule would call it read-only
 * and hand an agent a licence to call it freely, so it is named here.
 */
const MUTATING_DESPITE_PREFIX = new Set<string>(["capture_mesh_modeling_base"]);

/**
 * Short aliases for tool names over the 30-character budget.
 *
 * The agent is shown the alias and calls it; the executor is handed the real
 * name. Renaming the declarations themselves would mean touching the executor
 * switch and the in-app Copilot's prompt history, which is a lot of blast
 * radius for four names that are each one or six characters too long.
 */
const NAME_ALIASES: Record<string, string> = {
  capture_world_verification_screenshot: "capture_world_verify_shot",
  configure_procedural_atmosphere: "configure_proc_atmosphere",
  configure_procedural_vegetation: "configure_proc_vegetation",
  search_copilot_skill_references: "search_skill_references"
};

/** Alias back to the declaration name, for execution. */
const ALIAS_TO_REAL = new Map(
  Object.entries(NAME_ALIASES).map(([real, alias]) => [alias, real])
);

/**
 * Purpose-written descriptions for tools whose Copilot text overruns.
 *
 * Written rather than truncated: cutting a description mid-sentence removes
 * exactly the part that says when *not* to reach for the tool, which is the
 * half an agent most needs.
 */
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  cast_vfx_ability:
    "Fires one of seven combat abilities in the viewport as a one-off effect. Each travels from an origin along a flat heading, erupts at the far end, then clears itself. Use it to show what an ability looks like or to dress a frame. The cast is not saved with the scene. Call list_vfx_abilities first to match an ability to what the user described.",
  terrain_add_csg_volume:
    "Adds a non-destructive cutter volume to the terrain: a box, sphere, cylinder or capsule that carves the surface where it overlaps, for caves, arches and overhangs. The volume stays live in the modifier stack, so it can be moved, resized or removed later without rebaking the landform. Prefer this over terrain_carve_tunnel when the opening is a chamber rather than a passage.",
  terrain_sculpt_stroke:
    "Sculpts the terrain along a path of world-space points, in meters. Nine modes: raise and lower move the surface, clay builds mass, smooth relaxes it, flatten levels toward one height, pinch sharpens ridges, scrape planes material away, terrace cuts benches, noise adds grain. Domain 'heightfield' moves straight up, 'mesh' follows the picked surface normal and can form overhangs. Strokes stack non-destructively, so build a landform in passes rather than one huge stroke."
};

/**
 * Tools an agent should meet first, in this order.
 *
 * Agents read a catalogue top-down, and with 145 entries the top of the list is
 * the only part that reliably gets attention. Leading with the read tools, then
 * the world-building ones, means "look at what is there" and "make a landscape"
 * are found before the mesh-editing long tail.
 */
const LEAD_TOOLS = [
  "list_nodes",
  "get_scene_settings",
  "get_node_details",
  "get_terrain_state",
  "get_forest_state",
  "list_vfx_abilities",
  "capture_viewport_screenshot",
  "create_mesh_terrain",
  "terrain_sculpt_stroke",
  "terrain_carve_tunnel",
  "terrain_paint_weights",
  "create_forest_field",
  "add_forest_points",
  "grow_forest_field",
  "place_primitive",
  "place_blockout_room",
  "set_scene_settings",
  "cast_vfx_ability"
];

/** True when a tool only observes, so an agent may call it freely. */
function isReadOnly(name: string): boolean {
  if (MUTATING_DESPITE_PREFIX.has(name)) return false;
  return READ_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Trims a string to a budget on a word boundary, marking that it was cut. */
function fitToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
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
        : name === "get_mesh_topology"
          ? " Ask about a smaller selection rather than the whole mesh."
          : "";

  return JSON.stringify({
    success: true,
    truncated: true,
    note: `Result was ${result.length} characters and has been shortened to fit the agent's budget.${advice}`,
    preview: result.slice(0, OUTPUT_BUDGET - 240)
  });
}

/**
 * Every tool name exposed over WebMCP, lead tools first.
 *
 * These are declaration names; the agent may see an alias for the few that are
 * over the name budget.
 */
export const WEBMCP_TOOL_NAMES: string[] = (() => {
  const all = COPILOT_TOOL_DECLARATIONS.map((tool) => tool.name);
  const lead = LEAD_TOOLS.filter((name) => all.includes(name));
  const rest = all.filter((name) => !lead.includes(name));
  return [...lead, ...rest];
})();

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
 * Turns every declaration into a WebMCP tool definition.
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
    // A name that no longer exists is a bug in this list, not a reason to fail
    // startup -- the editor must still open.
    if (!declaration) {
      console.warn(`[WebMCP] No declaration for tool "${name}"; skipping.`);
      return [];
    }

    const exposedName = NAME_ALIASES[name] ?? name;
    if (exposedName.length > NAME_BUDGET) {
      console.warn(
        `[WebMCP] Tool name "${exposedName}" exceeds the ${NAME_BUDGET}-character budget.`
      );
    }

    const readOnly = isReadOnly(name);

    const definition: WebMcpToolDefinition = {
      name: exposedName,
      description: fitToBudget(
        DESCRIPTION_OVERRIDES[name] ?? declaration.description,
        DESCRIPTION_BUDGET
      ),
      inputSchema: fitSchemaToBudget(declaration.parameters),
      annotations: {
        readOnlyHint: readOnly,
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

        // Aliases exist only on the wire. The executor only knows real names.
        const realName = ALIAS_TO_REAL.get(exposedName) ?? exposedName;

        const outcome = await executeTool(
          editor,
          { id: `webmcp_${Date.now()}_${realName}`, name: realName, args },
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
          mutating: !readOnly,
          name: exposedName,
          ok,
          result: outcome.result
        });

        return fitResultToBudget(realName, outcome.result);
      }
    };

    return [definition];
  });
}

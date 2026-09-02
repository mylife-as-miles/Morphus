/**
 * Adapter between the terrain brush store and the sculpt hook.
 *
 * The two disagree about radius on purpose. The store keeps a separate radius
 * per tool, because a user who widens the paint brush does not expect the
 * tunnel to widen with it. The hook takes a single `brushRadius`, because by
 * the time a gesture is running exactly one tool is active and carrying four
 * unused radii through the stroke path would only invite reading the wrong one.
 *
 * So this is where "which radius" is decided, once.
 */

import type { ToolId } from "@blud/tool-system";
import type { TerrainBrushState } from "@/state/ui-store";
import type { TerrainSculptSettings, TerrainSculptTool } from "@/viewport/hooks/useTerrainSculpt";

/** Maps the active editor tool onto a terrain gesture, or null if it is not one. */
export function terrainToolFor(activeToolId: ToolId): TerrainSculptTool | null {
  switch (activeToolId) {
    case "terrain-sculpt":
      return "sculpt";
    case "terrain-paint":
      return "paint";
    case "terrain-density":
      return "density";
    case "terrain-tunnel":
      return "tunnel";
    case "terrain-dig":
      return "dig";
    default:
      return null;
  }
}

function radiusFor(tool: TerrainSculptTool, brush: TerrainBrushState): number {
  switch (tool) {
    case "paint":
      return brush.paintRadius;
    case "density":
      return brush.densityRadius;
    case "tunnel":
      return brush.tunnelRadius;
    case "dig":
      return brush.digRadius;
    case "sculpt":
      return brush.radius;
  }
}

/**
 * Flattens the store onto what the hook reads for the gesture being performed.
 *
 * `tool` is passed in rather than read from the store because the active tool
 * lives in the editor's tool session, not the brush state -- the brush only
 * describes how each tool behaves once chosen.
 */
export function toTerrainSculptSettings(
  tool: TerrainSculptTool,
  brush: TerrainBrushState
): TerrainSculptSettings {
  return {
    tool,

    brushMode: brush.mode,
    brushDomain: brush.domain,
    brushRadius: radiusFor(tool, brush),
    // Paint carries its own strength and falloff; every other tool uses the
    // sculpt pair, which is what the inspector shows for them.
    brushStrength: tool === "paint" ? brush.paintStrength : brush.strength,
    brushFalloff: tool === "paint" ? brush.paintFalloff : brush.falloff,
    brushAccumulate: brush.accumulate,
    terraceStep: brush.terraceStep,
    noiseScale: brush.noiseScale,
    // The store uses null for "no layer"; the hook's field is optional.
    activeSculptLayerId: brush.activeSculptLayerId ?? undefined,

    paintChannel: brush.paintChannel,
    paintMode: brush.paintMode,

    densityMode: brush.densityMode,
    targetEdgeLength: brush.densityTargetEdgeLength,

    tunnelRadius: brush.tunnelRadius,
    tunnelDepth: brush.tunnelDepth,
    tunnelNoise: brush.tunnelNoise,
    tunnelNoiseScale: brush.tunnelNoiseScale,

    digRadius: brush.digRadius,
    digSpeed: brush.digSpeed,
    digNoise: brush.digNoise,
    digNoiseScale: brush.digNoiseScale
  };
}

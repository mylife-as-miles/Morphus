import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Layers3, Plus, Trash2 } from "lucide-react";
import type {
  MeshTerrainState,
  SculptLayerModifier,
  TerrainMaterialChannel,
  TerrainModifier,
  TerrainNode,
  TerrainNodeData
} from "@blud/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type TerrainInspectorProps = {
  node: TerrainNode;
  onUpdate: (data: TerrainNodeData) => void;
};

/**
 * Authoring surface for a mesh-terrain node.
 *
 * Everything here edits `meshTerrain`, the non-destructive stack: the surface
 * itself is never stored, it is the replay of these modifiers over the base
 * field, so reordering or disabling an entry is the whole edit.
 */
export function TerrainInspector({ node, onUpdate }: TerrainInspectorProps) {
  const [tab, setTab] = useState("stack");
  const meshTerrain = node.data.meshTerrain;

  const orderedModifiers = useMemo(
    () => (meshTerrain ? [...meshTerrain.modifiers].sort(compareModifiers) : []),
    [meshTerrain]
  );
  const sculptLayers = useMemo(
    () => orderedModifiers.filter(isSculptLayer),
    [orderedModifiers]
  );

  if (!meshTerrain) {
    return (
      <section className="space-y-2 border-t border-white/8 pt-3">
        <div className="text-xs font-semibold text-foreground">Terrain</div>
        <div className="text-[11px] text-foreground/55">
          This terrain node is a heightmap. Mesh-terrain authoring needs a node in mesh mode.
        </div>
      </section>
    );
  }

  const update = (mutate: (state: MeshTerrainState) => void) => {
    const next = structuredClone(node.data);

    if (!next.meshTerrain) {
      return;
    }

    mutate(next.meshTerrain);
    onUpdate(next);
  };

  /**
   * Move one entry a step through the evaluation order.
   *
   * Evaluation sorts by priority then sequence, so a move that only swapped
   * array positions would be undone by the next sort. Swapping both keys with
   * the neighbour is what makes the reorder survive a round trip.
   */
  const moveModifier = (id: string, direction: -1 | 1) => {
    update((state) => {
      const ordered = [...state.modifiers].sort(compareModifiers);
      const index = ordered.findIndex((modifier) => modifier.id === id);
      const swapIndex = index + direction;

      if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) {
        return;
      }

      const current = ordered[index];
      const neighbour = ordered[swapIndex];
      const currentPriority = current.priority;
      const currentSequence = current.sequence;

      current.priority = neighbour.priority;
      current.sequence = neighbour.sequence;
      neighbour.priority = currentPriority;
      neighbour.sequence = currentSequence;

      ordered[index] = neighbour;
      ordered[swapIndex] = current;
      state.modifiers = ordered;
    });
  };

  const setModifierEnabled = (id: string, enabled: boolean) => {
    update((state) => {
      const modifier = state.modifiers.find((entry) => entry.id === id);

      if (modifier) {
        modifier.enabled = enabled;
      }
    });
  };

  const deleteModifier = (id: string) => {
    update((state) => {
      state.modifiers = state.modifiers.filter((modifier) => modifier.id !== id);
    });
  };

  const addSculptLayer = () => {
    update((state) => {
      const index = state.modifiers.filter(isSculptLayer).length + 1;
      state.modifiers.push(createSculptLayer(`Layer ${index}`));
    });
  };

  const setLayerName = (id: string, name: string) => {
    update((state) => {
      const layer = state.modifiers.find((modifier) => modifier.id === id);

      if (layer && isSculptLayer(layer)) {
        layer.name = name;
      }
    });
  };

  const setLayerOpacity = (id: string, opacity: number) => {
    update((state) => {
      const layer = state.modifiers.find((modifier) => modifier.id === id);

      if (layer && isSculptLayer(layer)) {
        layer.opacity = Math.min(1, Math.max(0, opacity));
      }
    });
  };

  const updateChannel = (index: number, mutate: (channel: TerrainMaterialChannel) => void) => {
    update((state) => {
      const channel = state.materialSettings.channels[index];

      if (channel) {
        mutate(channel);
      }
    });
  };

  return (
    <section className="space-y-3 border-t border-white/8 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">Mesh Terrain</div>
          <div className="mt-0.5 truncate text-[10px] text-foreground/55">
            {meshTerrain.worldSize} m world / {meshTerrain.sectionSize} m sections /{" "}
            {meshTerrain.lodLevels} LODs
          </div>
        </div>
        <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
          {meshTerrain.profile}
        </span>
      </div>

      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger className="h-6 px-1.5 text-[10px]" value="stack">
            Stack
          </TabsTrigger>
          <TabsTrigger className="h-6 px-1.5 text-[10px]" value="layers">
            Layers
          </TabsTrigger>
          <TabsTrigger className="h-6 px-1.5 text-[10px]" value="materials">
            Materials
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-1.5 pt-2" value="stack">
          {orderedModifiers.length === 0 ? (
            <div className="text-[11px] text-foreground/48">
              No modifiers yet. Sculpt, paint or cut the terrain to build the stack.
            </div>
          ) : (
            orderedModifiers.map((modifier, index) => (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] border border-white/8 bg-black/18 px-2 py-1.5",
                  !modifier.enabled && "opacity-45"
                )}
                key={modifier.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-foreground/80">
                    {modifierLabel(modifier)}
                  </div>
                  <div className="truncate text-[9px] text-foreground/42">
                    {modifierDetail(modifier)}
                  </div>
                </div>
                <Button
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveModifier(modifier.id, -1)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ChevronUp className="size-3" />
                </Button>
                <Button
                  aria-label="Move down"
                  disabled={index === orderedModifiers.length - 1}
                  onClick={() => moveModifier(modifier.id, 1)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ChevronDown className="size-3" />
                </Button>
                <Switch
                  checked={modifier.enabled}
                  onCheckedChange={(enabled) => setModifierEnabled(modifier.id, enabled)}
                  size="sm"
                />
                <Button
                  aria-label="Delete modifier"
                  onClick={() => deleteModifier(modifier.id)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent className="space-y-1.5 pt-2" value="layers">
          <Button className="w-full" onClick={addSculptLayer} size="xs" variant="ghost">
            <Plus className="size-3" />
            Add Sculpt Layer
          </Button>
          {sculptLayers.length === 0 ? (
            <div className="text-[11px] text-foreground/48">
              No sculpt layers. Strokes go straight onto the base surface.
            </div>
          ) : (
            sculptLayers.map((layer) => (
              <div
                className={cn(
                  "space-y-1.5 rounded-[10px] border border-white/8 bg-black/18 px-2 py-2",
                  !layer.enabled && "opacity-45"
                )}
                key={layer.id}
              >
                <div className="flex items-center gap-1.5">
                  <Layers3 className="size-3 shrink-0 text-[#f6d07d]" />
                  <Input
                    className="h-6 min-w-0 flex-1 text-[11px]"
                    defaultValue={layer.name}
                    key={layer.name}
                    onBlur={(event) => setLayerName(layer.id, event.currentTarget.value)}
                  />
                  <Switch
                    checked={layer.enabled}
                    onCheckedChange={(enabled) => setModifierEnabled(layer.id, enabled)}
                    size="sm"
                  />
                  <Button
                    aria-label="Delete layer"
                    onClick={() => deleteModifier(layer.id)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_86px] items-center gap-2">
                  <span className="text-[10px] text-foreground/60">Opacity</span>
                  <DragInput
                    compact
                    max={1}
                    min={0}
                    onChange={(value) => setLayerOpacity(layer.id, value)}
                    onValueCommit={(value) => setLayerOpacity(layer.id, value)}
                    precision={2}
                    step={0.01}
                    value={layer.opacity}
                  />
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent className="space-y-1.5 pt-2" value="materials">
          {meshTerrain.materialSettings.channels.map((channel, index) => (
            <div
              className="space-y-1.5 rounded-[10px] border border-white/8 bg-black/18 px-2 py-2"
              key={channel.id}
            >
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`${channel.name} colour`}
                  className="size-6 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0"
                  onChange={(event) =>
                    updateChannel(index, (target) => {
                      target.color = hexToPackedColor(event.currentTarget.value);
                    })
                  }
                  type="color"
                  value={packedColorToHex(channel.color)}
                />
                <Input
                  className="h-6 min-w-0 flex-1 text-[11px]"
                  defaultValue={channel.name}
                  key={channel.name}
                  onBlur={(event) =>
                    updateChannel(index, (target) => {
                      target.name = event.currentTarget.value;
                    })
                  }
                />
                <span className="text-[9px] tracking-[0.14em] text-foreground/35 uppercase">
                  {channel.id}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_86px] items-center gap-2">
                <span className="text-[10px] text-foreground/60">Roughness</span>
                <DragInput
                  compact
                  max={1}
                  min={0}
                  onChange={(value) =>
                    updateChannel(index, (target) => {
                      target.roughness = Math.min(1, Math.max(0, value));
                    })
                  }
                  onValueCommit={(value) =>
                    updateChannel(index, (target) => {
                      target.roughness = Math.min(1, Math.max(0, value));
                    })
                  }
                  precision={2}
                  step={0.01}
                  value={channel.roughness}
                />
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function isSculptLayer(modifier: TerrainModifier): modifier is SculptLayerModifier {
  return modifier.type === "sculpt-layer";
}

/** Mirrors the ordering `ModifierStack` replays the document in. */
function compareModifiers(a: TerrainModifier, b: TerrainModifier): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  const sequenceA = a.sequence ?? Number.MAX_SAFE_INTEGER;
  const sequenceB = b.sequence ?? Number.MAX_SAFE_INTEGER;

  if (sequenceA !== sequenceB) {
    return sequenceA - sequenceB;
  }

  return a.id.localeCompare(b.id);
}

function createSculptLayer(name: string): SculptLayerModifier {
  return {
    id: `sculpt-layer:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    type: "sculpt-layer",
    enabled: true,
    priority: 100,
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 }
    },
    transform: {
      offset: { x: 0, y: 0, z: 0 },
      yaw: 0,
      scale: 1
    },
    name,
    opacity: 1
  };
}

function modifierLabel(modifier: TerrainModifier): string {
  switch (modifier.type) {
    case "brush-stroke":
      return `${titleCase(modifier.mode)} stroke`;
    case "weight-paint":
      return `Paint ${modifier.channel}`;
    case "sculpt-layer":
      return modifier.name;
    case "material-settings":
      return "Material settings";
    case "noise":
      return "Noise";
    case "field-displacement":
      return "Field displacement";
    case "remesh":
      return "Remesh";
    case "tessellate":
      return "Tessellate";
    case "boolean-subtract":
      return "Tunnel";
    case "boolean-volume":
      return modifier.operation === "add" ? "CSG add" : "CSG subtract";
    default:
      return "Modifier";
  }
}

function modifierDetail(modifier: TerrainModifier): string {
  switch (modifier.type) {
    case "brush-stroke":
      return `${modifier.domain === "mesh" ? "Mesh / XYZ" : "Heightfield / Y"} / r ${modifier.radius.toFixed(1)} m / ${modifier.points.length} dabs`;
    case "weight-paint":
      return `${modifier.mode} / r ${modifier.radius.toFixed(1)} m / ${modifier.points.length} dabs`;
    case "sculpt-layer":
      return `Sculpt layer / opacity ${modifier.opacity.toFixed(2)}`;
    case "material-settings":
      return `${modifier.settings.channels.length} channels`;
    case "noise":
      return `amp ${modifier.amplitude.toFixed(2)} / freq ${modifier.frequency.toFixed(3)}`;
    case "field-displacement":
      return `${modifier.fieldId} / scale ${modifier.scale.toFixed(2)}`;
    case "remesh":
      return `r ${modifier.radius.toFixed(1)} m / edge ${modifier.targetEdgeLength.toFixed(2)} m`;
    case "tessellate":
      return `r ${modifier.radius.toFixed(1)} m / edge ${modifier.targetEdgeLength.toFixed(2)} m`;
    case "boolean-subtract":
      return `r ${modifier.radius.toFixed(1)} m / depth ${modifier.depth.toFixed(1)} m / ${modifier.carves?.length ?? 0} carves`;
    case "boolean-volume":
      return `${modifier.volumes.length} volumes / ${modifier.backend}`;
    default:
      return "";
  }
}

function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function packedColorToHex(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.round(color)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

function hexToPackedColor(hex: string): number {
  const parsed = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

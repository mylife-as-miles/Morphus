import type { ComponentType } from "react";
import { Check, Pencil, Sprout, Trash2, TreePine } from "lucide-react";
import { FOREST_PRESETS, FOREST_STEM_WARNING, type ForestPresetId } from "@blud/forest";
import { forestTools, isForestToolId, type ForestToolId, type ToolId } from "@blud/tool-system";
import { DragInput } from "@/components/ui/drag-input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { forestStore, useForestSnapshot } from "@/state/forest-store";

type ForestToolsSectionProps = {
  activeToolId: ToolId;
  onSetToolId: (toolId: ToolId) => void;
};

const forestToolIcons: Record<ForestToolId, ComponentType<{ className?: string }>> = {
  "forest-field": Pencil,
  "forest-paint": Sprout
};

const forestToolShortLabels: Record<ForestToolId, string> = {
  "forest-field": "Field",
  "forest-paint": "Paint"
};

export function ForestToolsSection({ activeToolId, onSetToolId }: ForestToolsSectionProps) {
  const forest = useForestSnapshot();
  const forestToolActive = isForestToolId(activeToolId);
  const selected = forest.fields.find((field) => field.id === forest.selectedFieldId);
  const bake = selected ? forest.bakes[selected.id] : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        {forestTools.map((tool) => {
          const Icon = forestToolIcons[tool.id];

          return (
            <button
              className={cn(
                "editor-toolbar-button flex flex-col items-center gap-1.5 rounded-[10px] border px-1 py-2 text-[10px] font-medium transition-colors duration-150",
                tool.id === activeToolId && "editor-toolbar-button-active text-[#fff0cb]"
              )}
              key={tool.id}
              onClick={() => onSetToolId(tool.id)}
              title={tool.label}
              type="button"
            >
              <Icon className="size-4" />
              {forestToolShortLabels[tool.id]}
            </button>
          );
        })}
      </div>

      <button
        className="editor-toolbar-button flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[11px] font-medium"
        onClick={() => {
          forestStore.createField();
          onSetToolId("forest-field");
        }}
        type="button"
      >
        <TreePine className="size-4" />
        New Forest Field
      </button>

      {forest.fields.length === 0 ? (
        <div className="editor-dock-note rounded-xl px-3 py-3 text-[11px]">
          A forest here is a shape on the ground, not a list of trees. Add a field,
          then click the terrain to lay down spline control points; the stand is
          grown from the shape as a separate step.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {forest.fields.map((field) => (
            <button
              className={cn(
                "editor-toolbar-segment flex items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left text-[11px]",
                field.id === forest.selectedFieldId && "editor-toolbar-button-active text-[#fff0cb]"
              )}
              key={field.id}
              onClick={() => forestStore.selectField(field.id)}
              type="button"
            >
              <span className="truncate">{field.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-foreground/45">
                {field.nodes.length} pt{field.nodes.length === 1 ? "" : "s"}
                {field.dirty ? " ·" : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="flex flex-col gap-2.5 border-t border-white/8 pt-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-[0.16em] text-foreground/45 uppercase">
              Stand
            </span>
            <select
              className="editor-toolbar-segment rounded-lg px-2 py-1.5 text-[11px]"
              onChange={(event) =>
                forestStore.patchField(selected.id, {
                  preset: event.target.value as ForestPresetId
                })
              }
              value={selected.preset}
            >
              {FOREST_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <DragInput
            label="Density"
            max={3}
            min={0.05}
            onChange={(value) => forestStore.patchField(selected.id, { density: value })}
            step={0.05}
            value={selected.density}
          />
          {/* The single most important number in the field: a hard edge is what
              makes a painted forest read as a decal. */}
          <DragInput
            label="Feather"
            max={120}
            min={0}
            onChange={(value) => forestStore.patchField(selected.id, { feather: value })}
            step={1}
            value={selected.feather}
          />
          {!selected.closed ? (
            <DragInput
              label="Belt width"
              max={200}
              min={1}
              onChange={(value) => forestStore.patchField(selected.id, { width: value })}
              step={1}
              value={selected.width}
            />
          ) : null}

          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] text-foreground/60">Closed loop</span>
            <Switch
              checked={selected.closed}
              onCheckedChange={(checked) => forestStore.patchField(selected.id, { closed: checked })}
            />
          </div>
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] text-foreground/60">Auto-grow</span>
            <Switch
              checked={forest.autoGrow}
              onCheckedChange={(checked) => forestStore.patch({ autoGrow: checked })}
            />
          </div>

          <div className="flex gap-1.5">
            <button
              className="editor-toolbar-button flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-2 py-1.5 text-[11px] font-medium"
              onClick={() => forestStore.requestGrow(selected.id)}
              type="button"
            >
              <Sprout className="size-3.5" />
              Grow
            </button>
            {forest.drawing ? (
              <button
                className="editor-toolbar-button flex items-center justify-center gap-1.5 rounded-[10px] border px-2 py-1.5 text-[11px]"
                onClick={() => forestStore.finishDrawing()}
                title="Stop appending points; drags still move them"
                type="button"
              >
                <Check className="size-3.5" />
                Finish
              </button>
            ) : null}
            <button
              className="editor-toolbar-button flex items-center justify-center rounded-[10px] border px-2 py-1.5"
              onClick={() => forestStore.removeField(selected.id)}
              title="Delete field"
              type="button"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          {bake && bake.placements.length > FOREST_STEM_WARNING ? (
            <div className="editor-dock-note rounded-xl px-3 py-2 text-[10px] leading-relaxed">
              {bake.placements.length} stems. Past about {FOREST_STEM_WARNING} this
              machine has been measured to struggle; the field still grows.
            </div>
          ) : null}
        </div>
      ) : null}

      {!forestToolActive && forest.fields.length > 0 ? (
        <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
          Pick the Field tool to click points onto the terrain.
        </div>
      ) : null}

      {forest.status ? (
        <div className="px-0.5 text-[10px] text-foreground/45">{forest.status}</div>
      ) : null}
    </div>
  );
}

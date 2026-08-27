import { Layers } from "lucide-react";
import { FLOOR_PRESETS, type FloorPresetId } from "@/lib/floor-presets";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FloorPresetsPanelProps = {
  disabled?: boolean;
  onPlaceFloorPreset: (presetId: FloorPresetId) => void;
};

export function FloorPresetsPanel({ disabled = false, onPlaceFloorPreset }: FloorPresetsPanelProps) {
  return (
    <div className="editor-toolbar-segment flex h-11 items-center gap-2 rounded-[14px] px-2.5 text-[11px] text-foreground/72">
      <Layers className="size-3.5 text-[#f6d07d]/80" />
      <div className="hidden flex-col leading-none xl:flex">
        <span className="editor-toolbar-label">Builder</span>
        <span className="mt-1 text-[10px] font-medium text-foreground/54 uppercase">Floors</span>
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              className={cn(
                "editor-toolbar-button h-8 rounded-[10px] px-3 text-[11px] font-semibold disabled:pointer-events-none disabled:opacity-35 hover:translate-y-0 active:scale-100"
              )}
              disabled={disabled}
              size="sm"
              variant="ghost"
            />
          }
        >
          Floors
        </PopoverTrigger>

        <PopoverContent align="start" side="bottom" className="w-72 rounded-[18px] p-3">
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-medium tracking-[0.18em] text-foreground/45 uppercase">
              Floor Preset
            </div>
            {FLOOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-[12px] text-foreground/66 transition-[background-color,border-color,color,box-shadow] duration-200 [transition-timing-function:var(--ease-out-strong)] hover:border-white/10 hover:bg-white/[0.06] hover:text-foreground"
                disabled={disabled}
                onClick={() => onPlaceFloorPreset(preset.id)}
                type="button"
              >
                <div
                  className="size-6 shrink-0 rounded-md border border-white/10 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${preset.swatchAccent ?? preset.swatchColor}, ${preset.swatchColor})`
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{preset.name}</div>
                  <div className="truncate text-[10px] text-foreground/35">{preset.description}</div>
                </div>
                <div className="shrink-0 text-right text-[9px] text-foreground/30">
                  <div>R {preset.roughness.toFixed(2)}</div>
                  <div>M {preset.metalness.toFixed(2)}</div>
                </div>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getViewModePreset, viewModePresets, type ViewModeId } from "@/viewport/viewports";

export function ViewModeControl({
  currentViewMode,
  onSetViewMode
}: {
  currentViewMode: ViewModeId;
  onSetViewMode: (viewMode: ViewModeId) => void;
}) {
  const currentPreset = getViewModePreset(currentViewMode);

  return (
    <div className="editor-toolbar-segment flex h-11 items-center gap-2 rounded-[14px] px-2.5 text-[11px] text-foreground/72">
      <LayoutGrid className="size-3.5 text-[#f6d07d]" />
      <div className="hidden flex-col leading-none xl:flex">
        <span className="editor-toolbar-label">View</span>
        <span className="mt-1 text-[10px] font-medium text-foreground/54 uppercase">Layout</span>
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <Button className="editor-toolbar-button min-w-[4.75rem] rounded-[10px] px-3 text-[11px] font-semibold hover:translate-y-0 active:scale-100" size="sm" variant="ghost">
              {currentPreset.shortLabel}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 rounded-[18px] p-3">
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-medium tracking-[0.18em] text-[#f6d07d]/62 uppercase">View Mode</div>
            {viewModePresets.map((preset) => (
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left text-[12px] text-foreground/66 transition-[background-color,border-color,color,box-shadow] duration-200 [transition-timing-function:var(--ease-out-strong)] hover:border-white/10 hover:bg-white/[0.06] hover:text-foreground",
                  preset.id === currentViewMode && "editor-toolbar-button-active text-[#fff0cb]"
                )}
                key={preset.id}
                onClick={() => onSetViewMode(preset.id)}
                type="button"
              >
                <span className="font-medium">{preset.shortLabel}</span>
                <span className="ml-3 text-[10px] text-foreground/35">{preset.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

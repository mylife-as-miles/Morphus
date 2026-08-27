import type { GridSnapValue } from "@blud/render-pipeline";
import { Grid3X3 } from "@/components/editor-shell/icons";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatSnapValue } from "@/viewport/utils/snap";

export function SnapControl({
  currentSnapSize,
  gridInfinite,
  gridSnapValues,
  onSetGridInfinite,
  onSetSnapEnabled,
  onSetSnapSize,
  snapEnabled
}: {
  currentSnapSize: GridSnapValue;
  gridInfinite: boolean;
  gridSnapValues: readonly GridSnapValue[];
  onSetGridInfinite: (infinite: boolean) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  snapEnabled: boolean;
}) {
  return (
    <div className="editor-toolbar-segment flex h-11 items-center gap-2 rounded-[14px] px-2.5 text-[11px] text-foreground/72">
      <Grid3X3 className="size-3.5 text-[#f6d07d]" />
      <div className="hidden flex-col leading-none xl:flex">
        <span className="editor-toolbar-label">Grid</span>
        <span className="mt-1 text-[10px] font-medium text-foreground/54 uppercase">Snap</span>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-pressed={snapEnabled}
              className={cn(
                "editor-toolbar-button h-8 min-w-12 rounded-[10px] px-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase hover:translate-y-0 active:scale-100",
                snapEnabled ? "editor-toolbar-button-active text-[#fff0cb]" : "text-foreground/48"
              )}
              onClick={() => onSetSnapEnabled(!snapEnabled)}
              size="sm"
              variant="ghost"
            >
              {snapEnabled ? "On" : "Off"}
            </Button>
          }
        />
        <TooltipContent>
          <TooltipLabel label="Toggle snapping" />
        </TooltipContent>
      </Tooltip>
      <div className="editor-toolbar-divider h-5" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-pressed={gridInfinite}
              className={cn(
                "editor-toolbar-button h-8 rounded-[10px] px-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase hover:translate-y-0 active:scale-100",
                gridInfinite ? "editor-toolbar-button-active text-[#fff0cb]" : "text-foreground/48"
              )}
              onClick={() => onSetGridInfinite(!gridInfinite)}
              size="sm"
              variant="ghost"
            >
              ∞
            </Button>
          }
        />
        <TooltipContent>
          <TooltipLabel label="Infinite viewport" />
        </TooltipContent>
      </Tooltip>
      <div className="editor-toolbar-divider h-5" />
      <Popover>
        <PopoverTrigger
          render={
            <Button className="editor-toolbar-button h-8 rounded-[10px] px-3 text-[11px] font-semibold hover:translate-y-0 active:scale-100" size="sm" variant="ghost">
              {formatSnapValue(currentSnapSize)}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-60 rounded-[18px] p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-medium tracking-[0.18em] text-[#f6d07d]/62 uppercase">Grid Snap</span>
              <Button
                aria-pressed={snapEnabled}
                className={cn(
                  "editor-toolbar-button h-6 min-w-10 rounded-lg px-2 text-[10px] font-semibold tracking-[0.14em] uppercase hover:translate-y-0 active:scale-100",
                  snapEnabled ? "editor-toolbar-button-active text-[#fff0cb]" : "text-foreground/48"
                )}
                onClick={() => onSetSnapEnabled(!snapEnabled)}
                size="xs"
                variant="ghost"
              >
                {snapEnabled ? "On" : "Off"}
              </Button>
            </div>
            <DragInput
              className="w-full"
              min={0.05}
              onChange={onSetSnapSize}
              onValueCommit={onSetSnapSize}
              precision={2}
              step={0.05}
              value={currentSnapSize}
            />
            <div className="grid grid-cols-4 gap-1">
              {gridSnapValues.map((snapValue) => (
                <Button
                  className={cn(
                    "editor-toolbar-button h-6 rounded-lg px-0 text-[10px] font-medium hover:translate-y-0 active:scale-100",
                    snapValue === currentSnapSize && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  key={snapValue}
                  onClick={() => onSetSnapSize(snapValue)}
                  size="xs"
                  variant="ghost"
                >
                  {formatSnapValue(snapValue)}
                </Button>
              ))}
            </div>
            <div className="border-t border-white/8 pt-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-medium tracking-[0.18em] text-[#f6d07d]/62 uppercase">Infinite Viewport</span>
                <Button
                  aria-pressed={gridInfinite}
                  className={cn(
                    "editor-toolbar-button h-6 min-w-10 rounded-lg px-2 text-[10px] font-semibold tracking-[0.14em] uppercase hover:translate-y-0 active:scale-100",
                    gridInfinite ? "editor-toolbar-button-active text-[#fff0cb]" : "text-foreground/48"
                  )}
                  onClick={() => onSetGridInfinite(!gridInfinite)}
                  size="xs"
                  variant="ghost"
                >
                  {gridInfinite ? "On" : "Off"}
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TooltipLabel({ label }: { label: string }) {
  return <div className="text-[11px] font-medium text-foreground">{label}</div>;
}

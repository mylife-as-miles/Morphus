import type { ComponentType } from "react";
import { DrawBrushIcon, GrabBrushIcon, SmoothBrushIcon } from "@/components/editor-shell/icons";
import { cn } from "@/lib/utils";

type SculptBrushType = "draw" | "smooth" | "grab";

type SculptToolBarProps = {
  brushType: SculptBrushType;
  symmetryX: boolean;
  onSetBrushType: (type: SculptBrushType) => void;
  onSetSymmetryX: (enabled: boolean) => void;
};

const brushOptions: Array<{ type: SculptBrushType; Icon: ComponentType<{ className?: string }>; label: string }> = [
  { type: "draw", Icon: DrawBrushIcon, label: "Draw" },
  { type: "smooth", Icon: SmoothBrushIcon, label: "Smooth" },
  { type: "grab", Icon: GrabBrushIcon, label: "Grab" }
];

export function SculptToolBar({ brushType, symmetryX, onSetBrushType, onSetSymmetryX }: SculptToolBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="editor-toolbar-label">Brush</div>
      <div className="flex gap-1.5">
        {brushOptions.map(({ type, Icon, label }) => (
          <button
            key={type}
            className={cn(
              "editor-toolbar-button flex flex-1 flex-col items-center gap-1.5 rounded-[10px] border px-2 py-2 text-[10px] font-medium transition-colors duration-150",
              brushType === type && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            onClick={() => onSetBrushType(type)}
            title={label}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-1 editor-toolbar-label">Symmetry</div>
      <button
        className={cn(
          "editor-toolbar-button flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-colors duration-150",
          symmetryX && "editor-toolbar-button-active text-[#fff0cb]"
        )}
        onClick={() => onSetSymmetryX(!symmetryX)}
      >
        <span className="font-mono text-xs">X</span>
        Mirror X
      </button>
    </div>
  );
}

import { Pause, Play, ScanEye, SkipForward, Square, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PreviewSessionMode } from "@/viewport/types";

export function PhysicsPlaybackControl({
  mode,
  previewSessionMode,
  previewPossessed,
  onPause,
  onPlay,
  onResume,
  onSimulate,
  onStep,
  onStop,
  onTogglePossession
}: {
  mode: "paused" | "running" | "stopped";
  previewSessionMode: PreviewSessionMode | null;
  previewPossessed: boolean;
  onPause: () => void;
  onPlay: () => void;
  onResume: () => void;
  onSimulate: () => void;
  onStep: () => void;
  onStop: () => void;
  onTogglePossession: () => void;
}) {
  const playing = previewSessionMode === "play";
  const simulating = previewSessionMode === "simulate";
  const active = mode !== "stopped";

  return (
    <div className="editor-toolbar-segment flex min-h-11 flex-wrap items-center gap-2 rounded-[14px] px-2 py-2">
      <div className="hidden flex-col leading-none xl:flex">
        <span className="editor-toolbar-label">Preview</span>
        <span className="mt-1 text-[10px] font-medium text-foreground/54 uppercase">
          {active ? (playing ? "Play" : "Simulate") : "Stopped"}
        </span>
      </div>
      <PlaybackButton active={playing} icon={Play} label="Play In Selected Viewport" onClick={onPlay} />
      <PlaybackButton active={simulating} icon={ScanEye} label="Simulate In Selected Viewport" onClick={onSimulate} />
      <PlaybackButton
        active={mode === "running"}
        disabled={mode === "stopped"}
        icon={mode === "paused" ? Play : Pause}
        label={mode === "paused" ? "Resume Preview" : "Pause Preview"}
        onClick={mode === "paused" ? onResume : onPause}
      />
      <PlaybackButton
        active={false}
        disabled={mode !== "paused"}
        icon={SkipForward}
        label="Step One Frame"
        onClick={onStep}
      />
      <PlaybackButton
        active={previewPossessed && active}
        disabled={!active}
        icon={UserRound}
        label={previewPossessed ? "Eject From Player" : "Possess Player"}
        onClick={onTogglePossession}
      />
      <PlaybackButton active={mode === "stopped"} disabled={mode === "stopped"} icon={Square} label="Stop Preview" onClick={onStop} />
    </div>
  );
}

function PlaybackButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof Play;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100",
              active && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-[11px] font-medium text-foreground">{label}</div>
      </TooltipContent>
    </Tooltip>
  );
}

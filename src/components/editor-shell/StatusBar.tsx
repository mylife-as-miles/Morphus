import type { GridSnapValue, ViewportState } from "@blud/render-pipeline";
import type { BrushShape, GeometryNode } from "@blud/shared";
import type { WorkerJob } from "@blud/workers";
import { JobStatus } from "@/components/editor-shell/JobStatus";
import type { MeshEditMode } from "@/viewport/editing";
import type { PreviewSessionMode } from "@/viewport/types";
import type { ViewportPaneId } from "@/viewport/viewports";

type StatusBarProps = {
  activeBrushShape: BrushShape;
  activeToolLabel: string;
  activeViewportId: ViewportPaneId;
  gridSnapValues: readonly GridSnapValue[];
  jobs: WorkerJob[];
  meshEditMode: MeshEditMode;
  physicsPlayback: "paused" | "running" | "stopped";
  previewPossessed: boolean;
  previewSessionMode: PreviewSessionMode | null;
  selectedNode?: GeometryNode;
  viewModeLabel: string;
  viewport: ViewportState;
};

export function StatusBar({
  activeBrushShape,
  activeToolLabel,
  activeViewportId,
  gridSnapValues,
  jobs,
  meshEditMode,
  physicsPlayback,
  previewPossessed,
  previewSessionMode,
  selectedNode,
  viewModeLabel,
  viewport
}: StatusBarProps) {
  const snapText = viewport.grid.enabled ? `snap ${viewport.grid.snapSize}` : `snap off`;
  const focusText = selectedNode
    ? `focus ${selectedNode.name} @ ${selectedNode.transform.position.x}, ${selectedNode.transform.position.y}, ${selectedNode.transform.position.z}`
    : "focus none";
  const previewActive = physicsPlayback !== "stopped";
  const previewText = previewActive
    ? previewPossessed
      ? `PIE ${physicsPlayback}`
      : `${previewSessionMode === "play" ? "PIE" : "SIE"} ${physicsPlayback}`
    : "editor";
  const interactionHint =
    previewActive && previewPossessed
      ? "click viewport capture / Shift+F1 release / WASD move / Mouse look / Space jump / F8 eject"
      : previewActive
        ? "free camera / RMB look / Alt+LMB orbit / F8 possess / Esc stop"
      : activeToolLabel === "Brush"
      ? resolveBrushInteractionHint(activeBrushShape)
      : activeToolLabel === "Mesh Edit" && meshEditMode === "vertex"
        ? "click select / Shift-drag marquee / G move / R rotate / S scale / M merge / Shift+F fill"
      : activeToolLabel === "Mesh Edit" && meshEditMode === "edge"
        ? "click select / Shift-drag marquee / A arc / drag radius / wheel segments / K cut / B bevel / M merge"
        : activeToolLabel === "Mesh Edit" && meshEditMode === "face"
          ? "click select / Shift-drag marquee / Delete faces / M merge / N invert normals"
      : "click select / double-click focus / Shift-drag marquee / empty click clear";

  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4 sm:gap-3">
      <div className="editor-toolbar-footer pointer-events-auto flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-[18px] px-2.5 py-2 text-[10px] tracking-[0.08em] text-foreground/58 sm:px-3 sm:py-2.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <StatusMetric label="Tool" value={activeToolLabel} />
        <StatusMetric label="Mode" value={previewText} />
        {activeToolLabel === "Mesh Edit" ? <StatusMetric label="Mode" value={meshEditMode} /> : null}
        <StatusMetric className="hidden md:flex" label="View" value={viewModeLabel} />
        <StatusMetric className="hidden lg:flex" label="Viewport" value={activeViewportId} />
        <StatusMetric label="Snap" value={snapText} />
        <StatusMetric className="hidden md:flex" label="Grid" value={`${gridSnapValues.length} presets`} />
        <div className="editor-toolbar-divider hidden h-5 sm:block" />
        <div className="hidden min-w-0 flex-1 truncate text-foreground/44 sm:block">{focusText}</div>
        <div className="editor-toolbar-divider hidden h-5 xl:block" />
        <div className="hidden max-w-[24rem] truncate text-foreground/36 xl:block">{interactionHint}</div>
      </div>
      <JobStatus jobs={jobs} />
    </div>
  );
}

function StatusMetric({
  className,
  label,
  value
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`editor-toolbar-segment flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5${className ? ` ${className}` : ""}`}>
      <span className="text-[#f6d07d]/46 uppercase">{label}</span>
      <span className="text-foreground/76 uppercase">{value}</span>
    </div>
  );
}

function resolveBrushInteractionHint(shape: BrushShape) {
  if (shape === "custom-polygon") {
    return "click plane / click points / Enter close / move extrude / click commit / Esc cancel";
  }

  if (shape === "plane") {
    return "click anchor / move for base / click commit / Esc cancel";
  }

  if (shape === "stairs") {
    return "click anchor / move for base / wheel rotate / click lock / move height / wheel steps / click commit / Esc cancel";
  }

  if (shape === "ramp") {
    return "click anchor / move for base / click lock / move for height / wheel arc segments / click commit / Esc cancel";
  }

  if (shape === "sphere") {
    return "click center / move for radius / click commit / Esc cancel";
  }

  if (shape === "cylinder" || shape === "cone") {
    return "click base center / move for radius / click lock / move for height / click commit / Esc cancel";
  }

  return "click anchor / move for base / click lock / move for height / click commit / Esc cancel";
}

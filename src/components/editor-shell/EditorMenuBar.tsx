import { Bot, Cable, Gauge, Pause, Play, ScanEye, SkipForward, Square, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarShortcut,
  MenubarTrigger
} from "@/components/ui/menubar";
import { BlobIcon } from "@/components/editor-shell/icons";
import { cn } from "@/lib/utils";
import type { PreviewSessionMode } from "@/viewport/types";
import type { ViewportQuality } from "@/state/ui-store";

type EditorMenuBarProps = {
  canRedo: boolean;
  canUndo: boolean;
  copilotOpen: boolean;
  gameConnectionControl?: ReactNode;
  btEditorOpen: boolean;
  logicViewerOpen: boolean;
  nodeMaterialEditorOpen: boolean;
  physicsDebugOpen: boolean;
  showStats: boolean;
  onClearSelection: () => void;
  onCreateBrush: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onExportEngine: () => void;
  onExportGltf: () => void;
  onFocusSelection: () => void;
  onImportHtmlJs: () => void;
  onLoadWhmap: () => void;
  onNewFile: () => void;
  onOpenAiLauncher: () => void;
  onPausePreview: () => void;
  onPlayPreview: () => void;
  onRedo: () => void;
  onResumePreview: () => void;
  onSaveWhmap: () => void;
  onSimulatePreview: () => void;
  onStepPreview: () => void;
  onStopPreview: () => void;
  onToggleBtEditor: () => void;
  onToggleLogicViewer: () => void;
  onToggleNodeMaterialEditor: () => void;
  onTogglePhysicsDebug: () => void;
  onTogglePreviewPossession: () => void;
  onToggleStats: () => void;
  onToggleTools: () => void;
  onToggleViewportQuality: () => void;
  onUndo: () => void;
  physicsPlayback: "paused" | "running" | "stopped";
  previewPossessed: boolean;
  previewSessionMode: PreviewSessionMode | null;
  toolsPanelOpen: boolean;
  viewportQuality: ViewportQuality;
};

export function EditorMenuBar({
  canRedo,
  canUndo,
  copilotOpen,
  gameConnectionControl,
  btEditorOpen,
  logicViewerOpen,
  nodeMaterialEditorOpen,
  physicsDebugOpen,
  showStats,
  onClearSelection,
  onCreateBrush,
  onDeleteSelection,
  onDuplicateSelection,
  onGroupSelection,
  onExportEngine,
  onExportGltf,
  onFocusSelection,
  onImportHtmlJs,
  onLoadWhmap,
  onNewFile,
  onOpenAiLauncher,
  onPausePreview,
  onPlayPreview,
  onRedo,
  onResumePreview,
  onSaveWhmap,
  onSimulatePreview,
  onStepPreview,
  onStopPreview,
  onToggleBtEditor,
  onToggleLogicViewer,
  onToggleNodeMaterialEditor,
  onTogglePhysicsDebug,
  onTogglePreviewPossession,
  onToggleStats,
  onToggleTools,
  onToggleViewportQuality,
  physicsPlayback,
  previewPossessed,
  previewSessionMode,
  toolsPanelOpen,
  viewportQuality,
  onUndo
}: EditorMenuBarProps) {
  const previewActive = physicsPlayback !== "stopped";
  const previewPaused = physicsPlayback === "paused";
  const previewModeLabel = previewSessionMode === "play" ? "PIE" : previewSessionMode === "simulate" ? "SIE" : "Selected Viewport";

  return (
    <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div className="editor-toolbar-segment flex items-center gap-2 rounded-[16px] px-2.5 py-1.5 sm:gap-3 sm:px-3.5 sm:py-2">
          <span className="flex size-7 items-center justify-center rounded-xl border border-[#f6d07d]/18 bg-[#f6d07d]/10 text-[#f6d07d] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <BlobIcon className="size-3.5" />
          </span>
          <div className="hidden flex-col leading-none sm:flex">
            <span className="text-[11px] font-semibold tracking-[0.24em] text-foreground/96 uppercase">Dream Studio</span>
            <span className="mt-1 text-[9px] tracking-[0.2em] text-[#f6d07d]/58 uppercase">World Editor</span>
          </div>
          <span className="text-[11px] font-semibold tracking-[0.24em] text-foreground/96 uppercase sm:hidden">Dream Studio</span>
        </div>

        <div className="editor-toolbar-shell min-w-0 flex-1 overflow-hidden rounded-[18px] px-2 py-1.5">
          <div className="flex items-center gap-2">
            <div className="hidden shrink-0 items-center gap-2 pl-1 lg:flex">
              <span className="editor-toolbar-label">Command Bar</span>
              <span className="editor-toolbar-readout rounded-md px-2 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase">
                Editor
              </span>
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Menubar className="w-max min-w-full rounded-[14px] bg-transparent p-0 text-[11px] shadow-none">
                <MenubarMenu>
                  <MenubarTrigger className="sm:px-3">
                    File
                  </MenubarTrigger>
                  <MenubarContent className="min-w-44 p-1.5">
                    <MenubarItem className="rounded-lg text-xs" onClick={onNewFile}>
                      New File
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onCreateBrush}>
                      New Brush
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onSaveWhmap}>
                      Save `.whmap`
                      <MenubarShortcut>Cmd+S</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onLoadWhmap}>
                      Load `.whmap`
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onImportHtmlJs}>
                      Import HTML/JS Scene
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onExportGltf}>
                      Export glTF
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onExportEngine}>
                      Export Runtime Bundle
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>

                <MenubarMenu>
                  <MenubarTrigger>
                    Edit
                  </MenubarTrigger>
                  <MenubarContent className="min-w-44 p-1.5">
                    <MenubarItem className="rounded-lg text-xs" disabled={!canUndo} onClick={onUndo}>
                      Undo
                      <MenubarShortcut>Cmd+Z</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" disabled={!canRedo} onClick={onRedo}>
                      Redo
                      <MenubarShortcut>Cmd+Shift+Z</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onDuplicateSelection}>
                      Duplicate
                      <MenubarShortcut>Cmd+D</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onGroupSelection}>
                      Group Selection
                      <MenubarShortcut>Cmd+G</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onDeleteSelection}>
                      Delete
                      <MenubarShortcut>Del</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onClearSelection}>
                      Clear Selection
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>

                <MenubarMenu>
                  <MenubarTrigger>
                    Render
                  </MenubarTrigger>
                  <MenubarContent className="min-w-52 p-1.5">
                    <MenubarItem className="rounded-lg text-xs" onClick={onFocusSelection}>
                      Focus Selection
                    </MenubarItem>
                    <MenubarItem
                      className="rounded-lg text-xs"
                      onClick={() => {
                        localStorage.setItem("blud_flag_ENABLE_WEBGPU", "true");
                        window.location.reload();
                      }}
                    >
                      Enable WebGPU viewport (reload)…
                    </MenubarItem>
                    <MenubarItem
                      className="rounded-lg text-xs"
                      onClick={() => {
                        localStorage.removeItem("blud_flag_ENABLE_WEBGPU");
                        window.location.reload();
                      }}
                    >
                      Use WebGL viewport (reload)
                    </MenubarItem>
                    <MenubarItem
                      className="rounded-lg text-xs"
                      onClick={() => {
                        localStorage.setItem("blud_flag_WEBGPU_PHASE2_MATERIALS", "true");
                        window.location.reload();
                      }}
                    >
                      Enable WebGPU PBR node materials (reload)…
                    </MenubarItem>
                    <MenubarItem
                      className="rounded-lg text-xs"
                      onClick={() => {
                        localStorage.removeItem("blud_flag_WEBGPU_PHASE2_MATERIALS");
                        window.location.reload();
                      }}
                    >
                      Disable WebGPU node materials (reload)
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>

                <MenubarMenu>
                  <MenubarTrigger>
                    Tools
                  </MenubarTrigger>
                  <MenubarContent className="min-w-48 p-1.5">
                    <MenubarItem className="rounded-lg text-xs" onClick={onPlayPreview}>
                      Play In Selected Viewport
                      <MenubarShortcut>Alt+P</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onSimulatePreview}>
                      Simulate In Viewport
                      <MenubarShortcut>Alt+S</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" disabled={!previewActive} onClick={previewPaused ? onResumePreview : onPausePreview}>
                      {previewPaused ? "Resume Preview" : "Pause Preview"}
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" disabled={!previewActive} onClick={onTogglePreviewPossession}>
                      {previewPossessed ? "Eject From Player" : "Possess Player"}
                      <MenubarShortcut>F8</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" disabled={!previewPaused} onClick={onStepPreview}>
                      Step One Frame
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" disabled={!previewActive} onClick={onStopPreview}>
                      Stop Preview
                      <MenubarShortcut>Esc</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onToggleTools}>
                      {toolsPanelOpen ? "Hide" : "Show"} Tools Panel
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onCreateBrush}>
                      Activate Brush Tool
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>

                <MenubarMenu>
                  <MenubarTrigger>
                    View
                  </MenubarTrigger>
                  <MenubarContent className="min-w-56 p-1.5">
                    <MenubarItem className="rounded-lg text-xs" onClick={onToggleLogicViewer}>
                      {logicViewerOpen ? "Hide" : "Show"} Logic Graph
                      <MenubarShortcut>Cmd+Shift+L</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onOpenAiLauncher}>
                      Open AI Launcher
                      <MenubarShortcut>Cmd+L</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onToggleStats}>
                      {showStats ? "Hide" : "Show"} Performance Stats
                      <MenubarShortcut>Cmd+Shift+P</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onTogglePhysicsDebug}>
                      {physicsDebugOpen ? "Hide" : "Show"} Physics Colliders
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onToggleNodeMaterialEditor}>
                      {nodeMaterialEditorOpen ? "Hide" : "Show"} Node Material Editor
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs" onClick={onToggleBtEditor}>
                      {btEditorOpen ? "Hide" : "Show"} Behavior Tree Editor
                      <MenubarShortcut>Cmd+Shift+B</MenubarShortcut>
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>

                <MenubarMenu>
                  <MenubarTrigger>
                    Help
                  </MenubarTrigger>
                  <MenubarContent className="min-w-52 p-1.5">
                    <MenubarItem className="rounded-lg text-xs">
                      Click to select
                      <MenubarShortcut>Mouse 1</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs">
                      Focus object
                      <MenubarShortcut>Double click</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem className="rounded-lg text-xs">
                      Marquee select
                      <MenubarShortcut>Shift drag</MenubarShortcut>
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
              </Menubar>
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="editor-toolbar-segment flex items-center gap-1 rounded-[14px] px-1.5 py-1">
          <span className="hidden pl-1 text-[9px] font-semibold tracking-[0.16em] text-white/38 uppercase xl:block">
            Preview
          </span>
          <span className="editor-toolbar-readout hidden rounded-[10px] px-2.5 py-1 text-[9px] font-semibold tracking-[0.18em] uppercase sm:block">
            {previewModeLabel}
          </span>
          <Button
            aria-label="Play in selected viewport"
            className={cn(
              "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100",
              previewSessionMode === "play" && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            onClick={onPlayPreview}
            size="icon-sm"
            title="Play In Selected Viewport (Alt+P)"
            variant="ghost"
          >
            <Play className="size-3.5" />
          </Button>
          <Button
            aria-label="Simulate in viewport"
            className={cn(
              "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100",
              previewSessionMode === "simulate" && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            onClick={onSimulatePreview}
            size="icon-sm"
            title="Simulate In Viewport (Alt+S)"
            variant="ghost"
          >
            <ScanEye className="size-3.5" />
          </Button>
          <div className="editor-toolbar-divider hidden sm:block" />
          <Button
            aria-label={previewPaused ? "Resume preview" : "Pause preview"}
            className={cn(
              "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100",
              previewActive && !previewPaused && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            disabled={!previewActive}
            onClick={previewPaused ? onResumePreview : onPausePreview}
            size="icon-sm"
            title={previewPaused ? "Resume Preview" : "Pause Preview"}
            variant="ghost"
          >
            {previewPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </Button>
          <Button
            aria-label="Step one frame"
            className="editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100"
            disabled={!previewPaused}
            onClick={onStepPreview}
            size="icon-sm"
            title="Step One Frame"
            variant="ghost"
          >
            <SkipForward className="size-3.5" />
          </Button>
          <Button
            aria-label={previewPossessed ? "Eject from player" : "Possess player"}
            className={cn(
              "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100",
              previewActive && previewPossessed && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            disabled={!previewActive}
            onClick={onTogglePreviewPossession}
            size="icon-sm"
            title={previewPossessed ? "Eject From Player (F8)" : "Possess Player (F8)"}
            variant="ghost"
          >
            <UserRound className="size-3.5" />
          </Button>
          <Button
            aria-label="Stop preview"
            className="editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100"
            disabled={!previewActive}
            onClick={onStopPreview}
            size="icon-sm"
            title="Stop Preview (Esc)"
            variant="ghost"
          >
            <Square className="size-3.5" />
          </Button>
        </div>
        {gameConnectionControl ? (
          <div className="editor-toolbar-segment flex items-center gap-1 rounded-[14px] px-1.5 py-1">
            <span className="hidden pl-1 text-[9px] font-semibold tracking-[0.16em] text-white/38 uppercase xl:block">
              Live Sync
            </span>
            {gameConnectionControl}
          </div>
        ) : null}
        <div className="editor-toolbar-segment flex items-center gap-1 rounded-[14px] px-1.5 py-1">
          <span className="hidden pl-1 text-[9px] font-semibold tracking-[0.16em] text-white/38 uppercase lg:block">
            Viewport
          </span>
          <Button
            aria-label={`Canvas DPR ${viewportQuality.toFixed(2)}x`}
            className="editor-toolbar-button hidden min-w-[5.25rem] justify-center gap-1.5 rounded-[10px] px-3 text-[11px] hover:translate-y-0 active:scale-100 sm:flex"
            onClick={onToggleViewportQuality}
            size="sm"
            title={`Canvas DPR ${viewportQuality.toFixed(2)}x`}
            variant="ghost"
          >
            <Gauge className="size-3.5" />
            {viewportQuality.toFixed(2)}
          </Button>
          <div className="editor-toolbar-divider hidden sm:block" />
          <Button
            aria-label="Logic Graph"
            className={logicViewerOpen ? "editor-toolbar-button editor-toolbar-button-active size-8 rounded-[10px] hover:translate-y-0 active:scale-100" : "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100"}
            onClick={onToggleLogicViewer}
            title="Logic Graph (Cmd+Shift+L)"
            size="icon-sm"
            variant="ghost"
          >
            <Cable className="size-3.5" />
          </Button>
          <Button
            aria-label="AI Vibe"
            className={copilotOpen ? "editor-toolbar-button editor-toolbar-button-active size-8 rounded-[10px] hover:translate-y-0 active:scale-100" : "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100"}
            onClick={onOpenAiLauncher}
            title="AI Launcher (Cmd+L)"
            size="icon-sm"
            variant="ghost"
          >
            <Bot className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect } from "react";
import type { EditorCore, TransformAxis } from "@blud/editor-core";
import type { MeshEditMode } from "@/viewport/editing";
import type { ToolId } from "@blud/tool-system";

type UseAppHotkeysOptions = {
  activeToolId: ToolId;
  editor: EditorCore;
  enabled?: boolean;
  handleDeleteSelection: () => void;
  handleDuplicateSelection: () => void;
  handleFocusSelection: () => void;
  handleInstanceSelection: () => void;
  handleGroupSelection: () => void;
  handleInvertSelectionNormals: () => void;
  handleRedo: () => void;
  handleStartPlayPreview: () => void;
  handleStartSimulatePreview: () => void;
  handleStopPreview: () => void;
  handleToggleCopilot: () => void;
  handleToggleLogicViewer: () => void;
  handleTogglePreviewPossession: () => void;
  handleTranslateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  handleUndo: () => void;
  previewActive?: boolean;
  setActiveToolId: (toolId: ToolId) => void;
  setMeshEditMode: (mode: MeshEditMode) => void;
  setTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  transformMode: "rotate" | "scale" | "translate";
};

export function useAppHotkeys({
  activeToolId,
  editor,
  enabled = true,
  handleDeleteSelection,
  handleDuplicateSelection,
  handleFocusSelection,
  handleInstanceSelection,
  handleGroupSelection,
  handleInvertSelectionNormals,
  handleRedo,
  handleStartPlayPreview,
  handleStartSimulatePreview,
  handleStopPreview,
  handleToggleCopilot,
  handleToggleLogicViewer,
  handleTogglePreviewPossession,
  handleTranslateSelection,
  handleUndo,
  previewActive = false,
  setActiveToolId,
  setMeshEditMode,
  setTransformMode,
  transformMode
}: UseAppHotkeysOptions) {
  const blocksSceneSelectionEdits = activeToolId === "mesh-edit" || activeToolId === "path-add" || activeToolId === "path-edit";
  const cycleTransformMode = () => {
    if (transformMode === "translate") {
      setTransformMode("rotate");
      return;
    }

    if (transformMode === "rotate") {
      setTransformMode("scale");
      return;
    }

    setTransformMode("translate");
  };

  useEffect(() => {
    if (!enabled && !previewActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (typeof document !== "undefined" && document.body.dataset.viewportNavigation === "fly") {
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        handleStartPlayPreview();
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleStartSimulatePreview();
        return;
      }

      if (previewActive && event.key === "Escape") {
        event.preventDefault();
        handleStopPreview();
        return;
      }

      if (previewActive && event.key === "F8") {
        event.preventDefault();
        handleTogglePreviewPossession();
        return;
      }

      if (!enabled) {
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (modifier && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        handleToggleLogicViewer();
        return;
      }

      if (modifier && event.key.toLowerCase() === "l") {
        event.preventDefault();
        handleToggleCopilot();
        return;
      }

      if (!modifier && !event.shiftKey && activeToolId !== "mesh-edit" && event.key.toLowerCase() === "q") {
        event.preventDefault();
        setActiveToolId("select");
        return;
      }

      if (!modifier && !event.shiftKey && activeToolId !== "mesh-edit" && event.key.toLowerCase() === "w") {
        event.preventDefault();
        setActiveToolId("transform");
        setTransformMode("translate");
        return;
      }

      if (!modifier && !event.shiftKey && activeToolId !== "mesh-edit" && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setActiveToolId("transform");
        setTransformMode("rotate");
        return;
      }

      if (!modifier && !event.shiftKey && activeToolId !== "mesh-edit" && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setActiveToolId("transform");
        setTransformMode("scale");
        return;
      }

      if (!modifier && !event.shiftKey && activeToolId !== "mesh-edit" && event.key.toLowerCase() === "f") {
        event.preventDefault();
        handleFocusSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === "d" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === "i" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleInstanceSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === "g" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleGroupSelection();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleDeleteSelection();
        return;
      }

      if (event.key.toLowerCase() === "n" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleInvertSelectionNormals();
        return;
      }

      if (event.key === "1") {
        setActiveToolId("select");
        return;
      }

      if (event.key === "2") {
        setActiveToolId("transform");
        return;
      }

      if (event.key === "3") {
        setActiveToolId("clip");
        return;
      }

      if (event.key === "4") {
        setActiveToolId("extrude");
        return;
      }

      if (event.key === "5") {
        setActiveToolId("mesh-edit");
        return;
      }

      if (event.key === "6") {
        setActiveToolId("brush");
        return;
      }

      if (event.key === "7") {
        setActiveToolId("path-add");
        return;
      }

      if (event.key === "8") {
        setActiveToolId("path-edit");
        return;
      }

      if (event.key.toLowerCase() === "+" && !blocksSceneSelectionEdits) {
        setActiveToolId("brush");
        return;
      }

      if (event.code === "Space" && activeToolId === "transform") {
        event.preventDefault();
        cycleTransformMode();
        return;
      }

      if (activeToolId !== "transform" && activeToolId !== "mesh-edit") {
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setTransformMode("translate");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setTransformMode("rotate");
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setTransformMode("scale");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        setMeshEditMode("vertex");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setMeshEditMode("edge");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setMeshEditMode("face");
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleTranslateSelection("x", -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleTranslateSelection("x", 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        handleTranslateSelection("z", -1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleTranslateSelection("z", 1);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        handleTranslateSelection("y", 1);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        handleTranslateSelection("y", -1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeToolId,
    blocksSceneSelectionEdits,
    editor,
    enabled,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleFocusSelection,
    handleInstanceSelection,
    handleGroupSelection,
    handleInvertSelectionNormals,
    handleRedo,
    handleStartPlayPreview,
    handleStartSimulatePreview,
    handleStopPreview,
    handleToggleCopilot,
    handleToggleLogicViewer,
    handleTogglePreviewPossession,
    handleTranslateSelection,
    handleUndo,
    previewActive,
    setActiveToolId,
    setMeshEditMode,
    setTransformMode,
    transformMode
  ]);
}

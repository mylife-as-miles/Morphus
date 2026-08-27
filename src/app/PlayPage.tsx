import { useEffect, useMemo, useRef, useState } from "react";
import { createEditorCore, createSeedSceneDocument } from "@blud/editor-core";
import { createDerivedRenderSceneCache, deriveRenderSceneCached } from "@blud/render-pipeline";
import { Share2, ExternalLink, Play } from "lucide-react";
import type { ViewportState } from "@blud/render-pipeline";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import { createEditorViewports } from "@/viewport/viewports";
import { loadStoredSceneEditorDraft } from "@/lib/draft-storage";
import { useEditorSubscriptions } from "@/app/hooks/useEditorSubscriptions";
import { bootstrapEngine } from "@/lib/engine-bootstrap";

const VIEWPORT_ID = "perspective";
const NOOP = () => {};

export function PlayPage() {
  const [editor] = useState(() => createEditorCore(createSeedSceneDocument()));
  const [sceneRevision, setSceneRevision] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [physicsPlayback, setPhysicsPlayback] = useState<"paused" | "running" | "stopped">("stopped");
  const [physicsRevision, setPhysicsRevision] = useState(0);
  const [projectName, setProjectName] = useState("Dream Studio");
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>(() => createEditorViewports()["perspective"]);
  const renderSceneCacheRef = useRef(createDerivedRenderSceneCache());

  useEditorSubscriptions(editor, setSceneRevision, setSelectionRevision);

  const renderScene = useMemo(
    () =>
      deriveRenderSceneCached(
        editor.scene.nodes.values(),
        editor.scene.entities.values(),
        editor.scene.materials.values(),
        editor.scene.assets.values(),
        renderSceneCacheRef.current
      ),
    [editor, sceneRevision]
  );

  const nodes = useMemo(() => Array.from(editor.scene.nodes.values()), [editor, sceneRevision]);
  const entities = useMemo(() => Array.from(editor.scene.entities.values()), [editor, sceneRevision]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await bootstrapEngine();
        const draft = await loadStoredSceneEditorDraft();

        if (cancelled) return;

        if (draft) {
          editor.importSnapshot(draft.snapshot, "scene:restore-draft");
          setProjectName(draft.projectName || "Dream Studio");
        }
      } catch (error) {
        console.warn("[PlayPage] Failed to load draft.", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPhysicsPlayback("running");
          setPhysicsRevision((r) => r + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editor]);

  const handleShare = async () => {
    try {
      await navigator.share({
        title: projectName,
        url: window.location.href
      });
    } catch {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-black">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
        <div className="flex items-center gap-3">
          <div
            className="flex size-7 items-center justify-center rounded-lg text-[10px] font-black tracking-tight text-black"
            style={{ background: "linear-gradient(135deg, #f6d07d 0%, #e8a84a 100%)" }}
          >
            DS
          </div>
          <div>
            <div className="text-sm font-semibold text-white/90 leading-none">{projectName}</div>
            <div className="mt-0.5 text-[10px] text-white/40">Dream Studio</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/18 hover:text-white"
            onClick={handleShare}
          >
            <Share2 className="size-3.5" />
            {shared ? "Copied!" : "Share"}
          </button>

          <a
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/18 hover:text-white"
            href="/"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" />
            Edit
          </a>
        </div>
      </header>

      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl text-xl font-black text-black"
              style={{ background: "linear-gradient(135deg, #f6d07d 0%, #e8a84a 100%)" }}>
              <Play className="size-5 fill-black" />
            </div>
            <div className="text-sm text-white/50">Loading {projectName}…</div>
          </div>
        </div>
      ) : (
        <ViewportCanvas
          activeBrushShape="cube"
          aiModelPlacementArmed={false}
          activeToolId="select"
          dprScale={1}
          entities={entities}
          isActiveViewport={true}
          meshEditMode="vertex"
          sculptBrushRadius={3}
          sculptBrushStrength={0.2}
          sculptBrushType="draw"
          sculptSymmetryX={false}
          onActivateViewport={NOOP}
          onClearSelection={NOOP}
          onCommitMeshTopology={NOOP}
          onFocusNode={NOOP}
          onPlaceAsset={NOOP}
          onPlaceAiModelPlaceholder={NOOP}
          onPlaceBrush={NOOP}
          onPlaceMeshNode={NOOP}
          onPlacePrimitiveNode={NOOP}
          onPreviewBrushData={NOOP}
          onPreviewEntityTransform={NOOP}
          onPreviewMeshData={NOOP}
          onPreviewNodeTransform={NOOP}
          onSculptModeChange={NOOP}
          onSelectMaterialFaces={NOOP}
          onSelectScenePath={NOOP}
          onSelectNodes={NOOP}
          onSetToolId={NOOP}
          onSplitBrushAtCoordinate={NOOP}
          onUpdateBrushData={NOOP}
          onUpdateEntityTransform={NOOP}
          onUpdateMeshData={NOOP}
          onUpdateNodeTransform={NOOP}
          onUpdateSceneSettings={NOOP}
          onViewportChange={(_, v) => setViewport(v)}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          previewPossessed={false}
          previewSessionMode="play"
          previewStepTick={0}
          renderMode="lit"
          renderScene={renderScene}
          sceneSettings={editor.scene.settings}
          nodes={nodes}
          selectedNodeIds={[]}
          selectedNodes={[]}
          transformMode="translate"
          viewportId={VIEWPORT_ID}
          viewportPlane="xz"
          viewport={viewport}
        />
      )}
    </div>
  );
}

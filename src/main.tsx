import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { installChunkReloadHandler, isChunkLoadError, reloadOnceForFreshAssets } from "@/lib/chunk-reload";

const pathname = window.location.pathname;
const isPlayPage = pathname === "/play";

/**
 * The vendored Mesh Terrain Lab, mounted as its own workspace.
 *
 * It is a whole editor in its own right -- its own store, its own scene, its own
 * WebGPU render pipeline -- so it runs beside this one rather than inside it.
 * `?editor=terrain` and `?editor=tree` are upstream's own workspace switch, kept
 * verbatim so a link into either lands where it does in the reference build.
 *
 * It brings its own stylesheet too: the two define conflicting globals, so only
 * one of them is ever loaded.
 */
const meshTerrainWorkspace = new URLSearchParams(window.location.search).get("editor");
const isMeshTerrainLab =
  pathname === "/terrain" || meshTerrainWorkspace === "terrain" || meshTerrainWorkspace === "tree";

// Loaded lazily per workspace: the editor and the vendored lab ship
// conflicting global stylesheets.
if (!isMeshTerrainLab) void import("@/styles.css");

installChunkReloadHandler();

(async () => {
  if (isMeshTerrainLab) {
    await import("@/super-terrain/index.css");
    const { default: MeshTerrainLab } = await import("@/super-terrain/App");

    ReactDOM.createRoot(document.getElementById("root")!).render(<MeshTerrainLab />);
    return;
  }

  if (isPlayPage) {
    const { PlayPage } = await import("@/app/PlayPage");

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <PlayPage />
      </React.StrictMode>
    );
  } else {
    const { bootstrapEngine } = await import("@/lib/engine-bootstrap");
    const { App } = await import("@/app/App");

    await bootstrapEngine();

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </React.StrictMode>
    );
  }
})().catch((error) => {
  if (isChunkLoadError(error)) {
    reloadOnceForFreshAssets();
    return;
  }

  throw error;
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchForWorkspaceRoot, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createAntigravitySkillsApiPlugin } from "./server/antigravity-skills-api";
import { createArticraftApiPlugin } from "./server/articraft-api";
import { createCodexBridgePlugin } from "./server/codex-bridge-plugin";
import { createCopilotGenerateApiPlugin } from "./server/copilot-generate-api";
import { createEditorGameSyncPlugin } from "./server/editor-game-sync-plugin";
import { createElevenLabsApiPlugin } from "./server/elevenlabs-api";
import { createMorphusExportApiPlugin } from "./server/morphus-export-api";
import { createObjectGenerationApiPlugin } from "./server/object-generation-api";
import { createNpcChatApiPlugin } from "./server/npc-chat-api";
import { createTextureGenerationApiPlugin } from "./server/texture-generation-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This repo is the root: the editor and the packages it uses live side by side.
const repoRoot = __dirname;
// Keep every workspace package on the root Three installation. WebGPU node
// materials and renderer checks fail when Vite aliases a second package copy.
const editorThreePath = path.resolve(repoRoot, "node_modules/three");
const editorThreeWebGPUPath = path.resolve(editorThreePath, "build/three.webgpu.js");
const editorThreeTSLPath = path.resolve(editorThreePath, "build/three.tsl.js");

const workspaceAliases = {
  "@blud/dev-sync": path.resolve(repoRoot, "packages/dev-sync/src/index.ts"),
  "@blud/editor-core": path.resolve(repoRoot, "packages/editor-core/src/index.ts"),
  "@blud/forest": path.resolve(repoRoot, "packages/forest/src/index.ts"),
  "@blud/engine-config": path.resolve(repoRoot, "packages/engine-config/src/index.ts"),
  "@blud/gameplay-runtime": path.resolve(repoRoot, "packages/gameplay-runtime/src/index.ts"),
  "@blud/geometry-kernel": path.resolve(repoRoot, "packages/geometry-kernel/src/index.ts"),
  "@blud/physics-backend": path.resolve(repoRoot, "packages/physics-backend/src/index.ts"),
  "@blud/procedural-world": path.resolve(repoRoot, "packages/procedural-world/src/index.ts"),
  "@blud/render-pipeline": path.resolve(repoRoot, "packages/render-pipeline/src/index.ts"),
  "@blud/renderer-backend": path.resolve(repoRoot, "packages/renderer-backend/src/index.ts"),
  "@blud/runtime-build": path.resolve(repoRoot, "packages/runtime-build/src/index.ts"),
  "@blud/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
  "@blud/terrain/authoring": path.resolve(repoRoot, "packages/terrain/src/authoring.ts"),
  "@blud/terrain": path.resolve(repoRoot, "packages/terrain/src/index.ts"),
  "@blud/three-runtime": path.resolve(repoRoot, "packages/three-runtime/src/index.ts"),
  "@blud/tool-system": path.resolve(repoRoot, "packages/tool-system/src/index.ts"),
  "@blud/vfx": path.resolve(repoRoot, "packages/vfx/src/index.ts"),
  "@blud/workers": path.resolve(repoRoot, "packages/workers/src/index.ts")
} as const;

function resolveEditorManualChunk(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("/node_modules/react/") || normalizedId.includes("/node_modules/react-dom/") || normalizedId.includes("/node_modules/scheduler/") || normalizedId.includes("/node_modules/valtio/")) {
    return "react-vendor";
  }

  if (
    normalizedId.includes("/node_modules/three/build/three.webgpu") ||
    normalizedId.includes("/node_modules/three/build/three.tsl")
  ) {
    return "three-webgpu";
  }

  if (
    normalizedId.includes("/node_modules/three/") ||
    normalizedId.includes("/node_modules/@react-three/fiber/") ||
    normalizedId.includes("/node_modules/@react-three/drei/") ||
    normalizedId.includes("/node_modules/@dimforge/rapier3d-compat/") ||
    normalizedId.includes("/node_modules/three-mesh-bvh/")
  ) {
    return "three-stack";
  }

  if (
    normalizedId.includes("/node_modules/@xyflow/react/") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/logic-viewer/")
  ) {
    return "logic-viewer";
  }

  if (normalizedId.includes("/node_modules/@google/genai/") || normalizedId.includes("/node_modules/@fal-ai/client/")) {
    return "ai-vendor";
  }

  if (
    normalizedId.includes("/node_modules/@base-ui/") ||
    normalizedId.includes("/node_modules/class-variance-authority/") ||
    normalizedId.includes("/node_modules/clsx/") ||
    normalizedId.includes("/node_modules/cmdk/") ||
    normalizedId.includes("/node_modules/lucide-react/") ||
    normalizedId.includes("/node_modules/motion/") ||
    normalizedId.includes("/node_modules/next-themes/") ||
    normalizedId.includes("/node_modules/react-resizable-panels/") ||
    normalizedId.includes("/node_modules/sonner/") ||
    normalizedId.includes("/node_modules/tailwind-merge/") ||
    normalizedId.includes("/node_modules/vaul/")
  ) {
    return "ui-vendor";
  }

  if (
    normalizedId.includes("/packages/geometry-kernel/") ||
    normalizedId.includes("/apps/editor/src/viewport/editing.ts") ||
    normalizedId.includes("/apps/editor/src/lib/primitive-to-mesh.ts")
  ) {
    return "editable-mesh";
  }

  if (
    normalizedId.includes("/packages/three-runtime/") ||
    normalizedId.includes("/packages/runtime-build/") ||
    normalizedId.includes("/packages/runtime-format/")
  ) {
    return "runtime-scene";
  }

  if (
    normalizedId.includes("/three/examples/jsm/loaders/GLTFLoader.js") ||
    normalizedId.includes("/three/examples/jsm/loaders/DRACOLoader.js") ||
    normalizedId.includes("/three/examples/jsm/loaders/KTX2Loader.js") ||
    normalizedId.includes("/three/examples/jsm/libs/meshopt_decoder.module.js") ||
    normalizedId.includes("/three/examples/jsm/utils/SkeletonUtils.js")
  ) {
    return "gltf-loader";
  }

  if (
    normalizedId.includes("/three/examples/jsm/loaders/MTLLoader.js") ||
    normalizedId.includes("/three/examples/jsm/loaders/OBJLoader.js")
  ) {
    return "obj-loader";
  }

  if (normalizedId.includes("/apps/editor/src/lib/model-assets.ts")) {
    return "model-assets";
  }

  if (
    normalizedId.includes("/node_modules/@react-three/rapier/") ||
    normalizedId.includes("/apps/editor/src/viewport/components/ScenePreview.tsx") ||
    normalizedId.includes("/apps/editor/src/viewport/components/GrassField.tsx")
  ) {
    return "scene-preview";
  }

  if (
    normalizedId.includes("/apps/editor/src/viewport/") ||
    normalizedId.includes("/packages/render-pipeline/")
  ) {
    return "viewport-tools";
  }

  if (
    normalizedId.includes("/packages/editor-core/") ||
    normalizedId.includes("/packages/shared/") ||
    normalizedId.includes("/packages/tool-system/") ||
    normalizedId.includes("/packages/workers/") ||
    normalizedId.includes("/packages/dev-sync/")
  ) {
    return "editor-core";
  }

  if (
    normalizedId.includes("/apps/editor/src/components/editor-shell/InspectorSidebar.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/FloorPresetsPanel.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/GameplayPanels.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/MaterialLibraryPanel.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/MeshFaceUvEditorDialog.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/NpcVoiceInspector.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/SceneHierarchyPanel.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/TextureBrowserOverlay.tsx") ||
    normalizedId.includes("/apps/editor/src/components/editor-shell/VoicesPanel.tsx")
  ) {
    return "inspector-sidebar";
  }

  if (normalizedId.includes("/apps/editor/src/components/editor-shell/") || normalizedId.includes("/apps/editor/src/components/ui/")) {
    return "editor-shell";
  }

  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const explicitBase = process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH;
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const inferredGithubPagesBase =
    process.env.GITHUB_ACTIONS === "true" && githubRepository
      ? `/${githubRepository.split("/")[1]}/`
      : "/";

  if (env.FAL_KEY) {
    process.env.FAL_KEY = env.FAL_KEY;
  }

  return {
    base: explicitBase ?? inferredGithubPagesBase,
    plugins: [
      react(),
      tailwindcss(),
      createAntigravitySkillsApiPlugin(),
      createArticraftApiPlugin(),
      createCopilotGenerateApiPlugin(),
      createCodexBridgePlugin(),
      createEditorGameSyncPlugin(),
      createElevenLabsApiPlugin(),
      createMorphusExportApiPlugin(),
      createNpcChatApiPlugin(),
      createObjectGenerationApiPlugin(),
      createTextureGenerationApiPlugin()
    ],
    resolve: {
      tsconfigPaths: true,
      alias: {
        ...workspaceAliases,
        "three/webgpu": editorThreeWebGPUPath,
        "three/tsl": editorThreeTSLPath,
        "three/build/three.webgpu.js": editorThreeWebGPUPath,
        "three/build/three.tsl.js": editorThreeTSLPath
      },
      dedupe: ["react", "react-dom", "three"]
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rolldownOptions: {
        output: {
          manualChunks: resolveEditorManualChunk
        }
      }
    },
    define: {
      "process.env.BABEL_TYPES_8_BREAKING": JSON.stringify(""),
      "process.env.NODE_DEBUG": JSON.stringify(""),
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env": JSON.stringify({}),
      "process.version": JSON.stringify(process.version),
      "process.platform": JSON.stringify(process.platform),
      "process.browser": JSON.stringify(true)
    },
    server: {
      host: "0.0.0.0",
      port: 5000,
      strictPort: true,
      allowedHosts: true,
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())]
      }
    }
  };
});

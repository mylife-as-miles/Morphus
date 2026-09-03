# Dream Studio Editor

Dream Studio Editor is a browser-based 3D world editor: terrain you can sculpt,
forests you can grow, and a scene you can build, running on WebGPU.

## WebMCP: the editor is the agent's tool surface

Morphus registers 20 of the editor's own tools with the browser via
`document.modelContext.registerTool`, so an agent can build a world *in the page
the person is looking at* -- no server, no API key, no separate MCP process, and
no copy of the editor's logic that can fall out of step.

```js
await document.modelContext.registerTool(
  {
    name: "terrain_sculpt_stroke",
    description: "Sculpts the terrain along a path of world-space points...",
    inputSchema: { /* JSON Schema, shared with the in-app Copilot */ },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, { signal }) => { /* ... */ }
  },
  { signal: controller.signal }
);
```

The interesting part is what is *not* here. There is no second implementation.
The editor already described everything it can do to its own Copilot -- 145
declarations, each with a description and a JSON Schema, executed by one
switch. WebMCP asks for exactly that shape, so
[`src/lib/webmcp/tools.ts`](src/lib/webmcp/tools.ts) is a bridge: a browser
agent and the in-app Copilot run the same code, and neither can drift.

**Twenty tools, not 145.** A tool list is a prompt. Every entry spends the
agent's attention, and putting `offset_brush_face` beside `create_mesh_terrain`
makes the capabilities that matter harder to find. The twenty are chosen to
answer one question well -- *can a person and an agent build a 3D world
together?* -- and the list leads with read tools (`list_nodes`,
`get_terrain_state`, `capture_viewport_screenshot`) so an agent can act on what
is actually in the scene rather than on what it assumed.

**Budgets are enforced, not hoped for.** Chrome recommends 500 characters per
description, 150 per parameter, 1.5K per result. Two descriptions ran over and
are replaced with purpose-written text rather than truncated -- cutting a
description removes the part that says when *not* to reach for a tool, which is
the half an agent most needs. Oversized results come back as a short object
that says it was shortened and names a narrower tool, because a silent
truncation reads as a complete answer. `node scripts/webmcp-budget.mjs` checks
all of it and exits non-zero.

**The human can see what the agent did.** Tools run in the page, so the only
record of a call is the one the page chooses to show. The menu bar carries an
`AGENT` readout: how many tools are registered, and the name of the last call.
Without it, geometry appears and nobody in the room knows whether the person or
the model asked for it.

### Try it

Live: **[add deployment URL]**

In Chrome, enable `chrome://flags/#enable-webmcp-testing`, open the editor, and
ask an agent something like:

> Make a mountain ridge running east to west, then put a forest in the valley
> south of it.

Without the flag, `?webmcp=stub` installs a minimal `modelContext` and a
`window.__webmcp` harness so the tools can be driven straight from the console:

```js
await window.__webmcp.list();                    // the 20 registered names
await window.__webmcp.describe("create_mesh_terrain");  // the schema an agent sees
await window.__webmcp.call("create_mesh_terrain", { name: "Ridge" });
```

The stub is not an agent and does not pretend to be one -- there is no model in
it. It answers the deterministic half of the question ("did this tool run and
return what it promised") that Chrome's own guidance says to settle before
writing evals.

## LAAS Procedural Worlds

Copilot can create and configure a persistent LAAS `procedural-world` node with
the `create_procedural_world` and `configure_procedural_*` tools. The world is
WebGPU-only and reuses the viewport canvas; unsupported hosts show a diagnostic
instead of a silent WebGL fallback. Details are in
[`docs/PROCEDURAL_WORLD_EDITOR.md`](../../docs/PROCEDURAL_WORLD_EDITOR.md).

The inspector and Copilot share canonical version-2 config with runtime export.
Authored and effective values are shown separately, including preset/hardware
overrides and per-system readiness. The deterministic WebGPU validation page is
available while the dev server runs at
`http://127.0.0.1:5001/procedural-world-verification.html`.

```bash
npm run world:shoot
npm run world:compare
npm run world:battery
```

These commands write real seed-41729 captures and metrics under
`artifacts/procedural-world`; they never fall back to WebGL.

It is built for creative access. A player, solo creator, storyteller, student, modder, or non-builder can describe an interactive world, let Gemma 4 operate real editor tools, inspect the result visually, refine the scene, create characters and dialogue, or generate a standalone HTML/CSS/JavaScript game through Morphus.

## Why this editor matters

Game creation is still locked behind programming, 3D modeling, animation, engine knowledge, debugging, asset pipelines, funding, team coordination, and hardware that can run advanced engines. Dream Studio changes the entry point: creators can start with natural language and learn by inspecting the playable artifact Gemma 4 helps build.

For the Gemma 4 Good Hackathon, this editor is positioned under Digital Equity & Inclusivity:

- It lowers the skill barrier for players, solo creators, indie storytellers, modders, students, educators, and non-programmers.
- Gemma 4 helps creators by acting through structured editor tools instead of responding as a passive chatbot.
- It supports live 3D scene authoring, standalone browser-game generation, multilingual NPC dialogue, and voice-enabled experiences.

## What it does

The editor has two AI workspaces.

### Copilot

Copilot edits the live Dream Studio viewport. It can create and refine 3D scenes by calling structured tools against the editor command stack.

Copilot can:

- Place rooms, platforms, primitives, lights, entities, player spawns, architecture elements, and skatepark elements.
- Inspect scene settings, node outlines, entity details, materials, hooks, paths, events, and mesh topology.
- Edit meshes with extrusion, bevel, inset, bridge, cuts, welds, subdivision, solidify, mirror, vertex transforms, UVs, surface painting, decals, LOD metadata, and bake outputs.
- Author scene paths, gameplay hooks, behavior trees, and NPC/entity workflows.
- Capture viewport screenshots so Gemma 4 can inspect what was actually built before continuing.
- Push authored scenes into connected game projects when sync is configured.

### Morphus

Morphus creates standalone browser games and interactive prototypes. It maintains a local file workspace with generated HTML, CSS, JavaScript, JSON, image assets, and audio assets.

Morphus can:

- Generate playable multi-file web games.
- Import files, folders, and reference images.
- Preserve generated files in IndexedDB.
- Search project files before editing.
- Read bounded line ranges instead of scanning entire files.
- Write targeted changes to existing files.
- Create new modules when needed.
- Request approval before destructive delete/rename operations.
- Preview games, play them in the editor viewport, and export ZIP files.
- Request ElevenLabs music or sound effects through a human approval tray.

## Gemma 4 architecture

Gemma 4 is the default intelligence layer. The client calls `/api/copilot/generate`, and the server calls `gemma-4-31b-it` through the Google GenAI SDK.

The model receives:

- Conversation history.
- A mode-specific system prompt.
- A structured function-calling tool catalog.
- Optional images, including viewport screenshots or user-provided references.
- Tool results from previous steps.

The loop is:

```text
user prompt
  -> Gemma 4
  -> structured tool calls
  -> Dream Studio executes tools
  -> tool results return to Gemma 4
  -> optional screenshot or file inspection
  -> refinement or final artifact
```

This lets Gemma 4 help inside the editor workflow, not just generate text beside it.

## Tool surface

In the submitted editor slice, Dream Studio exposes `112` AI tools.

| Tool group | Count | Purpose |
| --- | ---: | --- |
| Copilot editor tools | 104 | Live 3D scene authoring, inspection, mesh editing, gameplay, behavior, surfaces, screenshots |
| Morphus game tools | 8 | Standalone game registration and file workspace operations |

Key files:

- `src/lib/copilot/tool-declarations.ts` defines the tool catalog.
- `src/lib/copilot/tool-executor.ts` maps tool calls to editor and Morphus operations.
- `src/lib/copilot/agentic-loop.ts` runs the model/tool iteration.
- `src/app/hooks/useCopilot.ts` selects Copilot vs Morphus mode and assembles runtime context.
- `server/copilot-generate-shared.ts` calls Gemma 4 with function calling enabled.

## Visual verification

Spatial work needs visual feedback. Copilot has a `capture_viewport_screenshot` tool that captures the active editor canvas and attaches the image to the next model turn.

This allows workflows like:

```text
build a scene
  -> inspect tool results
  -> capture viewport screenshot
  -> Gemma 4 sees layout and scale
  -> refine composition, lighting, or placement
```

The result is closer to human creative iteration: build, look, adjust.

## Game-code memory

The editor includes a game-code memory subsystem for grounding future game generation:

- `src/components/morphus-rag/RagIngestionUI.tsx` exposes the admin ingestion UI.
- `api/rag/upsert-game-code.ts` chunks code, embeds it, writes snapshots, and upserts vectors.
- `../../src/rag/embedGemini.ts` creates Gemini embeddings.
- `../../src/rag/searchCode.ts` queries Pinecone and formats retrieved code context.

This subsystem is currently best described as an admin/dev memory pipeline. The next planned step is exposing retrieval as a first-class Morphus tool so Gemma 4 can autonomously search examples before generating or debugging games.

## Multilingual and voice-enabled content

Dream Studio supports multilingual creation at the content layer:

- Gemma 4 can receive multilingual prompts and generate NPC dialogue.
- `server/npc-chat-shared.ts` routes NPC preview chat through Gemma 4.
- `src/viewport/components/PreviewNpcDialogueOverlay.tsx` shows in-viewport NPC dialogue.
- `api/elevenlabs/tts.ts` defaults to `eleven_multilingual_v2` for optional multilingual speech.

This is not full editor UI localization yet. The accurate claim is multilingual prompts, NPC dialogue, and voice-enabled game experiences.

## Tech stack

- React 19
- TypeScript
- Vite 8
- Three.js
- React Three Fiber and Drei
- Rapier physics preview
- Tailwind CSS
- Valtio state
- Base UI-style components
- Google GenAI SDK
- Pinecone
- Gemini embeddings
- ElevenLabs audio
- Custom `@blud/*` editor, geometry, runtime, render, shared, and worker packages

## Run locally

From the repository root:

```bash
npm install
npm run dev
```

The editor dev server runs on:

```text
http://localhost:5000
```

You can also run it directly from this workspace:

```bash
npm run dev -w @blud/editor
```

## Validate

From the repository root:

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

## Configuration

Core editor authoring works without provider secrets. AI-backed features use server-side environment variables or browser-stored user keys.

Create `apps/editor/.env.local` when needed:

```bash
GEMINI_API_KEY=your_google_ai_key
FAL_KEY=your_fal_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_HOST=your_pinecone_index_host
```

Environment notes:

- `GEMINI_API_KEY` or `GOOGLE_API_KEY` enables Gemma 4 Copilot, Morphus, and NPC dialogue.
- `PINECONE_API_KEY` plus `PINECONE_INDEX_HOST` enables game-code memory upserts/search.
- `FAL_KEY` enables optional object/texture generation paths.
- ElevenLabs keys are entered in the editor settings UI and stored locally in the browser.

## Important source map

| Area | Files |
| --- | --- |
| Gemma 4 server route | `server/copilot-generate-shared.ts`, `server/copilot-generate-api.ts`, `api/copilot/generate.ts` |
| Client provider | `src/lib/copilot/gemini-provider.ts`, `src/lib/copilot/provider.ts`, `src/lib/copilot/settings.ts` |
| Agent loop | `src/lib/copilot/agentic-loop.ts` |
| Tool catalog | `src/lib/copilot/tool-declarations.ts` |
| Tool execution | `src/lib/copilot/tool-executor.ts` |
| Mode/runtime hook | `src/app/hooks/useCopilot.ts` |
| Copilot UI | `src/components/editor-shell/CopilotPanel.tsx` |
| Morphus UI | `src/components/editor-shell/MorphusWorkspace.tsx` |
| Morphus memory | `src/lib/copilot/morphus-memory.ts` |
| NPC dialogue | `server/npc-chat-shared.ts`, `src/lib/preview-npc-chat.ts` |
| Game-code memory | `src/components/morphus-rag/RagIngestionUI.tsx`, `api/rag/upsert-game-code.ts`, `../../src/rag` |
| Vite API plugins | `vite.config.ts`, `server/*-api.ts` |

## AAA Worldbuilding Copilot Skill

Dream Studio bundles the repository-owned `aaa-game-worldbuilding` skill from
`.agents/skills/aaa-game-worldbuilding`. It guides Copilot through ambitious
AAA-style environment production: composition, procedural foundations,
authored gameplay landmarks, screenshot verification, and targeted performance
tuning. It is a UE5-class visual target for the browser/WebGPU renderer, not a
claim of identical Unreal Engine capabilities.

It activates automatically for requests such as AAA or UE5-class worlds,
cinematic alpine valleys, realistic forests with water and clouds, open-world
RPG regions, survival maps, and high-fidelity environment-art work. It remains
inactive for routine edits such as moving a cube or changing a material. Start
a prompt with `Use the AAA worldbuilding skill` to select it explicitly, or
expand the `AAA Worldbuilding` chip in Copilot and choose `Disable for this
session`.

The main skill is injected only when active. Its long LAAS specification and
supporting doctrine are available through read-only Copilot reference tools:
`list_copilot_skill_references`, `search_copilot_skill_references`, and
`read_copilot_skill_reference`. Reads are bounded to 24k characters, 80k per
run, and six unique documents.

The manifest generator runs before editor dev, typecheck, build, and test:

```bash
node scripts/generate-copilot-skills-manifest.mjs
```

Repository skills are bundled for Vite and serverless production. Development
can additionally load `~/.gemini/antigravity/skills`,
`BLUD_COPILOT_SKILLS_DIR`, and `BLUD_COPILOT_EXTRA_SKILLS_DIRS`; repository
skills retain priority. See
[`docs/COPILOT_AAA_WORLDBUILDING_SKILL.md`](../../docs/COPILOT_AAA_WORLDBUILDING_SKILL.md)
for the integration audit and limits.

Example prompts:

- `Use the AAA worldbuilding skill to build a golden-hour alpine valley with a navigable river and a ruined castle landmark.`
- `Create an open-world survival region with forest, meadow, wetland and snow biomes, then optimize it for the high preset.`
- `Inspect this world using the AAA quality pillars and fix the three biggest visual problems.`
- `Use the supplied image as composition reference and create a matching world bookmark.`
- `Turn this greybox into a detailed AAA-style sci-fi interior without changing the basic traversal route.`

## Submission docs

The repository root contains two Kaggle writeup drafts:

- `KAGGLE_WRITEUP_DREAM_STUDIO.md` is the detailed master draft.
- `KAGGLE_WRITEUP_DREAM_STUDIO_SUBMISSION.md` is the 1,500-word submission version.
- `KAGGLE_WRITEUP_RESEARCH_NOTES.md` summarizes the Kaggle/winner writeup research and claim guardrails.

Use the shorter version for Kaggle and the longer version as source material for the video script, architecture explanation, and repository documentation.

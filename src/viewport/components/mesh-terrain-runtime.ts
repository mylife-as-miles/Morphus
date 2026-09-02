/**
 * The editor's single import point for mesh terrain evaluation.
 *
 * ─── Why the relative path ───────────────────────────────────────────────────
 *
 * `@blud/terrain` is a workspace package like `@blud/shared`, but it is not yet
 * reachable from this app by name. Three files decide that, and none of them
 * lists it:
 *
 *   - `apps/editor/tsconfig.json` -- its `paths` map *replaces* the one in
 *     `tsconfig.base.json` (which does have `@blud/terrain`), so TypeScript
 *     falls through to `node_modules/@blud/terrain`, whose `exports` point at a
 *     `dist/` that is only produced by `npm run build` in that package.
 *   - `apps/editor/vite.config.ts` -- `workspaceAliases`, for the dev server.
 *   - `apps/editor/package.json` -- the declared dependency.
 *
 * Until those three gain an entry, importing the module by path is what keeps
 * the editor type-checking and the dev server resolving. Everything else in the
 * app imports from *this* file, so switching to the package name is a one-line
 * change here rather than an edit in every consumer.
 *
 * Importing `evaluate` directly rather than the package barrel is deliberate
 * even after that: the barrel also pulls in LOD selection, the spatial index and
 * the mesh validation surface, none of which the viewport needs.
 */

export {
  evaluateMeshTerrain,
  meshTerrainEvaluationKey,
  regionCoversBounds,
  type EvaluatedMeshTerrain,
  type MeshTerrainEvaluateOptions,
  type MeshTerrainRegion,
} from "@blud/terrain";

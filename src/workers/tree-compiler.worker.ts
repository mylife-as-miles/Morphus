/// <reference lib="webworker" />

/**
 * Compiles procedural tree prototypes off the main thread.
 *
 * A single hero tree takes between 0.4 and 4 seconds to grow and mesh, and a
 * forest field references a dozen prototypes. Doing that inline would freeze
 * the viewport for most of a minute the first time a stand is grown, so the
 * generator -- which is deliberately renderer-free -- runs here instead.
 *
 * Results come back by transfer, not copy: `treeAssetTransferables` collects
 * every buffer in all three LODs, which is why the asset arrives on the main
 * thread with its typed arrays intact and nothing was cloned on the way.
 */

import {
  compileProceduralTree,
  parametersForTreeVariation,
  treeAssetTransferables,
  type ProceduralTreeAsset,
  type TreeSpecies
} from "@blud/forest";

export type TreeCompileRequest = {
  /** `treePrototypeId(species, variation)` -- the cache key on both sides. */
  prototypeId: string;
  species: TreeSpecies;
  variation: number;
};

export type TreeCompileResponse =
  | { kind: "ready"; prototypeId: string; asset: ProceduralTreeAsset; ms: number }
  | { kind: "failed"; prototypeId: string; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<TreeCompileRequest>) => {
  const { prototypeId, species, variation } = event.data;

  try {
    const started = performance.now();
    const parameters = parametersForTreeVariation(species, variation);
    const asset = compileProceduralTree(parameters);
    const ms = performance.now() - started;

    const message: TreeCompileResponse = { kind: "ready", prototypeId, asset, ms };
    scope.postMessage(message, treeAssetTransferables(asset));
  } catch (error) {
    const message: TreeCompileResponse = {
      kind: "failed",
      prototypeId,
      message: error instanceof Error ? error.message : String(error)
    };
    scope.postMessage(message);
  }
};

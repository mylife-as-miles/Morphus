/**
 * The editor's single forest-field store.
 *
 * `ForestFieldStore` is an `ExternalStore`, not a valtio proxy like `uiStore`,
 * because it came across from upstream that way and the shape it publishes is
 * already exactly what a `useSyncExternalStore` subscriber wants: one immutable
 * snapshot per change, with spline edits deliberately *not* notifying on every
 * pointer move. Wrapping it in a proxy would undo that.
 */

import { useSyncExternalStore } from "react";
import { ForestFieldStore, type ForestFieldSnapshot } from "@blud/forest";

export const forestStore = new ForestFieldStore();

/** Subscribe a component to the forest fields. */
export function useForestSnapshot(): ForestFieldSnapshot {
  return useSyncExternalStore(forestStore.subscribe, forestStore.getSnapshot, forestStore.getSnapshot);
}

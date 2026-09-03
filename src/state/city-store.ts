/**
 * The editor's single street-network store.
 *
 * Mirrors `forest-store.ts`: an `ExternalStore` rather than a valtio proxy,
 * because it publishes one immutable snapshot per change and that is exactly
 * what `useSyncExternalStore` wants.
 */

import { useSyncExternalStore } from "react";
import { CityStore, type CitySnapshot } from "@blud/city";

export const cityStore = new CityStore();

/** Subscribe a component to the street network. */
export function useCitySnapshot(): CitySnapshot {
  return useSyncExternalStore(cityStore.subscribe, cityStore.getSnapshot, cityStore.getSnapshot);
}

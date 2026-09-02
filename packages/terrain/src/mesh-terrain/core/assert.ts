/**
 * Development-time invariant check.
 *
 * Upstream this read `import.meta.env.DEV`, which only exists inside a Vite
 * app. As a library we cannot assume a bundler, so the flag is resolved
 * defensively and defaults to off in an unknown host.
 */
const DEV: boolean = (() => {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    if (typeof meta?.env?.DEV === "boolean") return meta.env.DEV;
  } catch {
    // import.meta is unavailable in some CommonJS interop paths.
  }

  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
  } catch {
    return false;
  }
})();

export function terrainAssert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition && DEV) {
    throw new Error(`[WorldTerrain] ${message}`)
  }
}

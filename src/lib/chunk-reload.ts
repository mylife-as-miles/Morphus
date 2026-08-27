const RELOAD_FLAG = "dream-studio:chunk-reload-at";
const CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "loading chunk",
  "error loading dynamically imported module",
  "net::err_aborted 404"
];

export function installChunkReloadHandler() {
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      reloadOnceForFreshAssets();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnceForFreshAssets();
    }
  });
}

export function reloadOnceForFreshAssets() {
  const lastReloadAt = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
  const now = Date.now();

  if (now - lastReloadAt < 30_000) {
    return;
  }

  sessionStorage.setItem(RELOAD_FLAG, String(now));
  window.location.reload();
}

export function isChunkLoadError(value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : String(value ?? "");

  const lower = message.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

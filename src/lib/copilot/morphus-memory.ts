import type { CopilotSession } from "./types";

export type MorphusFileRecord = {
  content: string;
  language: "html" | "javascript" | "css" | "json" | "asset" | "text";
  mimeType?: string;
  path: string;
  updatedAt: number;
};

export type MorphusMemorySnapshot = {
  files: MorphusFileRecord[];
  latestGame: { title: string; html: string } | null;
  session: CopilotSession | null;
  updatedAt: number;
};

export type MorphusAudioRequest = {
  description: string;
  durationSeconds?: number;
  kind: "music" | "sfx";
  path: string;
};

const DB_NAME = "dream-studio-morphus";
const DB_VERSION = 1;
const STORE_NAME = "memory";
const DEFAULT_SNAPSHOT_KEY = "morphus";

const EMPTY_MEMORY: MorphusMemorySnapshot = {
  files: [],
  latestGame: null,
  session: null,
  updatedAt: 0
};

export async function loadMorphusMemory(key = DEFAULT_SNAPSHOT_KEY): Promise<MorphusMemorySnapshot> {
  if (!canUseIndexedDb()) {
    return EMPTY_MEMORY;
  }

  try {
    const db = await openMorphusDb();
    const snapshot = await getValue<MorphusMemorySnapshot>(db, key);
    db.close();
    return snapshot ?? EMPTY_MEMORY;
  } catch {
    return EMPTY_MEMORY;
  }
}

export async function saveMorphusMemory(snapshot: MorphusMemorySnapshot, key = DEFAULT_SNAPSHOT_KEY): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  try {
    const db = await openMorphusDb();
    await setValue(db, key, {
      ...snapshot,
      updatedAt: Date.now()
    });
    db.close();
  } catch {
    // Morphus memory should never block generation.
  }
}

export function createMorphusFilesFromGame(game: { title: string; html: string } | null): MorphusFileRecord[] {
  if (!game) {
    return [];
  }

  return [
    {
      content: game.html,
      language: "html",
      path: "index.html",
      updatedAt: Date.now()
    }
  ];
}

export function createMorphusFilesFromAssistantContent(content: string): MorphusFileRecord[] {
  const files: MorphusFileRecord[] = [];
  const usedPaths = new Set<string>();

  for (const file of readLooseFilenameBlocks(content)) {
    const path = uniquePath(normalizePath(file.path), usedPaths);
    usedPaths.add(path);
    files.push({
      content: file.content,
      language: inferMorphusFileLanguage(path, file.languageHint),
      path,
      updatedAt: Date.now()
    });
  }

  const fencePattern = /```([a-zA-Z0-9_-]+)?([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    const languageHint = normalizeLanguage(match[1]);
    const meta = match[2]?.trim() ?? "";
    let code = match[3].trim();
    if (!code || code.includes("```")) {
      continue;
    }

    if (isFilenameOnlyFence(code)) {
      continue;
    }

    const pathFromCode = readFileMarker(code);
    if (pathFromCode) {
      code = code.replace(/^\s*(?:<!--\s*)?(?:\/\/|#|\/\*)?\s*(?:file|filename|path):\s*([^\n*]+?)(?:\s*-->)?\s*(?:\*\/)?\s*\r?\n/i, "").trim();
    }

    const path = uniquePath(
      normalizePath(readMetaPath(meta) || pathFromCode || defaultPathForLanguage(languageHint, files)),
      usedPaths
    );

    usedPaths.add(path);
    files.push({
      content: code,
      language: inferMorphusFileLanguage(path, languageHint),
      path,
      updatedAt: Date.now()
    });
  }

  return files;
}

export function extractMorphusAudioRequests(content: string): MorphusAudioRequest[] {
  const requests: MorphusAudioRequest[] = [];
  const fencePattern = /```(?:morphus-audio|audio-assets|audio_requests)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const entries = Array.isArray(parsed) ? parsed : [parsed];

      for (const entry of entries) {
        if (!isRecord(entry)) {
          continue;
        }

        const description = typeof entry.description === "string" ? entry.description.trim() : "";
        const path = normalizePath(typeof entry.path === "string" ? entry.path : "");
        const kind = entry.kind === "music" ? "music" : "sfx";
        const durationSeconds =
          typeof entry.durationSeconds === "number"
            ? Math.max(0.5, Math.min(22, entry.durationSeconds))
            : undefined;

        if (!description || !path || !isAudioPath(path)) {
          continue;
        }

        requests.push({ description, durationSeconds, kind, path });
      }
    } catch {
      // Ignore malformed audio request blocks; Morphus should still show the game files.
    }
  }

  return dedupeAudioRequests(requests);
}

function readLooseFilenameBlocks(content: string) {
  const files: Array<{
    content: string;
    languageHint: MorphusFileRecord["language"] | "";
    path: string;
  }> = [];
  const markerPattern =
    /```([a-zA-Z0-9_-]+)?[^\n`]*\n\s*([^\n`]+\.[a-zA-Z0-9]+)\s*\n```\s*\n([\s\S]*?)(?=\n```|(?:\n|^)generate_game_html\s*\(|$)/g;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(content)) !== null) {
    const code = trimDanglingFence(match[3] ?? "");
    if (!code.trim()) {
      continue;
    }

    files.push({
      content: code.trim(),
      languageHint: normalizeLanguage(match[1]),
      path: match[2].trim()
    });
  }

  return files;
}

function isFilenameOnlyFence(code: string) {
  return /^[^\n`]+\.[a-zA-Z0-9]+\s*$/.test(code.trim());
}

function trimDanglingFence(code: string) {
  return code.replace(/\n```\s*$/m, "");
}

export function buildMorphusPreviewHtml(files: MorphusFileRecord[]): string | null {
  const htmlFile = files.find((file) => file.path.toLowerCase() === "index.html") ??
    files.find((file) => file.language === "html");

  if (!htmlFile) {
    return null;
  }

  let html = htmlFile.content;
  const byPath = new Map(files.map((file) => [file.path.toLowerCase(), file]));
  const moduleUrls = new Map<string, string>();
  const assetFiles = files.filter((file) => file.language === "asset");
  const getModuleUrl = (file: MorphusFileRecord): string => {
    const existing = moduleUrls.get(file.path.toLowerCase());
    if (existing) {
      return existing;
    }

    const source = rewriteModuleImports(rewriteAssetReferences(file.content, assetFiles), file.path, byPath, getModuleUrl);
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    moduleUrls.set(file.path.toLowerCase(), url);
    return url;
  };

  html = html.replace(
    /<link\b([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (tag, before, href, after) => {
      const file = byPath.get(stripRelativePrefix(href));
      if (!file || file.language !== "css") {
        return tag;
      }

      return `<style data-morphus-source="${escapeAttribute(file.path)}">\n${rewriteAssetReferences(file.content, assetFiles)}\n</style>`;
    }
  );

  html = html.replace(
    /<script\b([^>]*?)src=["']([^"']+)["']([^>]*?)>\s*<\/script>/gi,
    (tag, before, src, after) => {
      const file = byPath.get(stripRelativePrefix(src));
      if (!file || file.language !== "javascript") {
        return tag;
      }

      const attrs = `${before} ${after}`.replace(/\s*src=["'][^"']+["']/i, "").trim();
      if (/\btype\s*=\s*["']module["']/i.test(attrs) || /\bimport\s+/.test(file.content)) {
        return `<script ${attrs} src="${getModuleUrl(file)}" data-morphus-source="${escapeAttribute(file.path)}"></script>`;
      }

      const script = rewriteAssetReferences(file.content, assetFiles).replace(/<\/script/gi, "<\\/script");
      return `<script ${attrs} data-morphus-source="${escapeAttribute(file.path)}">\n${script}\n</script>`;
    }
  );

  html = rewriteAssetReferences(html, assetFiles);

  return html;
}

export function inferMorphusFileLanguage(
  path: string,
  languageHint: MorphusFileRecord["language"] | "" = ""
): MorphusFileRecord["language"] {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".ts")) return "javascript";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json") || lower.endsWith(".gltf")) return "json";
  if (isAssetPath(lower)) return "asset";
  return languageHint || "text";
}

function normalizeLanguage(value?: string): MorphusFileRecord["language"] | "" {
  const lower = value?.toLowerCase() ?? "";
  if (lower === "html" || lower === "htm") return "html";
  if (lower === "js" || lower === "javascript" || lower === "mjs" || lower === "ts" || lower === "typescript") return "javascript";
  if (lower === "css") return "css";
  if (lower === "json" || lower === "gltf") return "json";
  if (lower === "text" || lower === "txt" || lower === "glsl" || lower === "wgsl") return "text";
  return "";
}

function readMetaPath(meta: string) {
  const match =
    meta.match(/(?:file|filename|path)=["']?([^"'\s]+)["']?/i) ??
    meta.match(/(?:file|filename|path):\s*([^"'\s]+)/i);
  return match?.[1]?.trim() ?? "";
}

function readFileMarker(code: string) {
  const firstLine = code.split(/\r?\n/, 1)[0] ?? "";
  const match = firstLine.match(/^\s*(?:<!--\s*)?(?:\/\/|#|\/\*)?\s*(?:file|filename|path):\s*([^\n*]+?)(?:\s*-->)?\s*(?:\*\/)?\s*$/i);
  return match?.[1]?.trim() ?? "";
}

function defaultPathForLanguage(language: MorphusFileRecord["language"] | "", files: MorphusFileRecord[]) {
  const countByLanguage = files.filter((file) => file.language === language).length;

  if (language === "html") return countByLanguage === 0 ? "index.html" : `pages/page-${countByLanguage + 1}.html`;
  if (language === "javascript") return countByLanguage === 0 ? "index.js" : `scripts/script-${countByLanguage + 1}.js`;
  if (language === "css") return countByLanguage === 0 ? "style.css" : `styles/style-${countByLanguage + 1}.css`;
  if (language === "json") return countByLanguage === 0 ? "assets/manifest.json" : `assets/data-${countByLanguage + 1}.json`;
  if (language === "asset") return `assets/asset-${files.length + 1}`;
  return `notes/file-${files.length + 1}.txt`;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").trim() || "index.html";
}

function uniquePath(path: string, usedPaths: Set<string>) {
  if (!usedPaths.has(path)) {
    return path;
  }

  const dotIndex = path.lastIndexOf(".");
  const base = dotIndex >= 0 ? path.slice(0, dotIndex) : path;
  const ext = dotIndex >= 0 ? path.slice(dotIndex) : "";
  let index = 2;
  let candidate = `${base}-${index}${ext}`;

  while (usedPaths.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}${ext}`;
  }

  return candidate;
}

function stripRelativePrefix(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
}

function resolveRelativeImport(fromPath: string, specifier: string) {
  const normalized = specifier.replace(/\\/g, "/");
  if (!normalized.startsWith(".")) {
    return normalized.toLowerCase();
  }

  const fromParts = fromPath.split("/");
  fromParts.pop();
  for (const part of normalized.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      fromParts.pop();
      continue;
    }
    fromParts.push(part);
  }

  return fromParts.join("/").toLowerCase();
}

function rewriteModuleImports(
  source: string,
  fromPath: string,
  files: Map<string, MorphusFileRecord>,
  getModuleUrl: (file: MorphusFileRecord) => string,
) {
  return source
    .replace(
      /(\bimport\s+(?:(?:[\s\S]*?\s+from\s+)?|))["']([^"']+)["']/g,
      (statement, prefix, specifier) => {
        const file = files.get(resolveRelativeImport(fromPath, specifier)) ?? files.get(stripRelativePrefix(specifier));
        return file?.language === "javascript" ? `${prefix}"${getModuleUrl(file)}"` : statement;
      }
    )
    .replace(
      /(\bimport\s*\(\s*)["']([^"']+)["'](\s*\))/g,
      (statement, prefix, specifier, suffix) => {
        const file = files.get(resolveRelativeImport(fromPath, specifier)) ?? files.get(stripRelativePrefix(specifier));
        return file?.language === "javascript" ? `${prefix}"${getModuleUrl(file)}"${suffix}` : statement;
      }
    );
}

function rewriteAssetReferences(source: string, assetFiles: MorphusFileRecord[]) {
  return assetFiles.reduce((nextSource, asset) => {
    if (!asset.content.startsWith("data:")) {
      return nextSource;
    }

    const escapedPath = escapeRegExp(asset.path);
    const basename = asset.path.split("/").pop() ?? asset.path;
    const escapedBase = escapeRegExp(basename);

    return nextSource
      .replace(new RegExp(`(["'\\(])(?:\\./)?${escapedPath}(["'\\)])`, "g"), `$1${asset.content}$2`)
      .replace(new RegExp(`(["'\\(])(?:\\./)?assets/${escapedBase}(["'\\)])`, "g"), `$1${asset.content}$2`)
      .replace(new RegExp(`(["'\\(])(?:\\./)?${escapedBase}(["'\\)])`, "g"), `$1${asset.content}$2`);
  }, source);
}

function isAssetPath(path: string) {
  return /\.(glb|bin|png|jpe?g|webp|gif|svg|hdr|exr|ktx2|mp3|wav|ogg|fbx|obj|mtl|usdz)$/i.test(path);
}

function isAudioPath(path: string) {
  return /\.(mp3|wav|ogg)$/i.test(path);
}

function dedupeAudioRequests(requests: MorphusAudioRequest[]) {
  const seen = new Set<string>();
  return requests.filter((request) => {
    const key = request.path.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openMorphusDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
  });
}

function getValue<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

function setValue(db: IDBDatabase, key: string, value: MorphusMemorySnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

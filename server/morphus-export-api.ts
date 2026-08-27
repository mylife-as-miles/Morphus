import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

type MorphusExportRequest = {
  files?: Array<{
    content: string;
    language?: "asset" | "css" | "html" | "javascript" | "json" | "text";
    path: string;
  }>;
};

const API_PATH = "/api/morphus/export";
const EXPORT_ROOT = resolve(process.cwd(), "generated", "morphus-workspace");

export function createMorphusExportApiPlugin(): Plugin {
  return {
    name: "morphus-export-api",
    configurePreviewServer(server) {
      registerMorphusExportApi(server);
    },
    configureServer(server) {
      registerMorphusExportApi(server);
    }
  };
}

function registerMorphusExportApi(
  server: Pick<ViteDevServer, "middlewares"> | Pick<PreviewServer, "middlewares">
) {
  server.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split("?")[0];

    if (pathname !== API_PATH) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    try {
      const payload = JSON.parse(await readBody(req)) as MorphusExportRequest;
      const files = normalizeFiles(payload.files ?? []);

      if (files.length === 0) {
        sendJson(res, 400, { error: "No Morphus files were provided." });
        return;
      }

      await rm(EXPORT_ROOT, { force: true, recursive: true });
      await mkdir(EXPORT_ROOT, { recursive: true });

      for (const file of files) {
        const outputPath = resolve(EXPORT_ROOT, file.path);
        const relativePath = relative(EXPORT_ROOT, outputPath);

        if (relativePath.startsWith("..") || relativePath === "") {
          throw new Error(`Refusing to write outside Morphus export root: ${file.path}`);
        }

        await mkdir(dirname(outputPath), { recursive: true });

        if (file.language === "asset" || file.content.startsWith("data:")) {
          await writeFile(outputPath, decodeDataUrl(file.content));
        } else {
          await writeFile(outputPath, file.content, "utf8");
        }
      }

      sendJson(res, 200, {
        exportedFiles: files.length,
        root: EXPORT_ROOT
      });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Morphus export failed."
      });
    }
  });
}

function normalizeFiles(files: NonNullable<MorphusExportRequest["files"]>) {
  return files.map((file) => ({
    content: typeof file.content === "string" ? file.content : "",
    language: file.language ?? inferLanguage(file.path),
    path: normalizeRelativePath(file.path)
  }));
}

function normalizeRelativePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();

  if (!normalized || normalized.includes("..")) {
    throw new Error(`Invalid Morphus export path: ${path}`);
  }

  return normalized;
}

function inferLanguage(path: string) {
  return /\.(png|jpe?g|webp|gif|svg|glb|bin|mp3|wav|ogg)$/i.test(path) ? "asset" : "text";
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:.*?;base64,(.*)$/i.exec(dataUrl);

  if (!match) {
    throw new Error("Expected a base64 data URL for exported asset content.");
  }

  return Buffer.from(match[1], "base64");
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

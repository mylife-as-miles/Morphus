import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

import { materializeArticraftAsset } from "./articraft-materialize.js";

const API_PATH = "/api/articraft/materialize";

export function createArticraftApiPlugin(): Plugin {
  return {
    configurePreviewServer(server) {
      registerArticraftApi(server);
    },
    configureServer(server) {
      registerArticraftApi(server);
    },
    name: "articraft-api"
  };
}

function registerArticraftApi(
  server: Pick<ViteDevServer, "middlewares"> | Pick<PreviewServer, "middlewares">
) {
  server.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split("?")[0];

    if (pathname !== API_PATH) {
      next();
      return;
    }

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    try {
      const payload = JSON.parse(await readBody(req)) as unknown;
      sendJson(res, 200, await materializeArticraftAsset(payload));
    } catch (error) {
      sendJson(res, 500, {
        error: "Articraft engine failed.",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

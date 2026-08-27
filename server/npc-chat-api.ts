import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { generateNpcChatReply, type NpcChatRequest } from "./npc-chat-shared";

const API_PATH = "/api/copilot/npc";

export function createNpcChatApiPlugin(): Plugin {
  return {
    configurePreviewServer(server) {
      registerNpcChatApi(server);
    },
    configureServer(server) {
      registerNpcChatApi(server);
    },
    name: "npc-chat-api"
  };
}

function registerNpcChatApi(
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
      const payload = JSON.parse(await readBody(req)) as NpcChatRequest;
      sendJson(res, 200, { text: await generateNpcChatReply(payload) });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "NPC reply failed."
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
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

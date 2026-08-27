import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { findCopilotSkills, parseSkillIdList } from "./copilot-skills-service";

export function createAntigravitySkillsApiPlugin(): Plugin {
  return {
    name: "antigravity-skills-api",
    configureServer(server) {
      registerAntigravitySkillsApi(server);
    },
    configurePreviewServer(server) {
      registerAntigravitySkillsApi(server);
    }
  };
}

function registerAntigravitySkillsApi(
  server: Pick<ViteDevServer, "middlewares"> | Pick<PreviewServer, "middlewares">
) {
  server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = req.url?.split("?")[0];
    if (req.method !== "GET" || pathname !== "/api/copilot/skills") {
      next();
      return;
    }

    try {
      const requestUrl = new URL(req.url ?? "/api/copilot/skills", "http://localhost");
      const result = await findCopilotSkills(requestUrl.searchParams.get("prompt") ?? "", {
        activeSkillIds: parseSkillIdList(requestUrl.searchParams.get("activeSkillIds")),
        disabledSkillIds: parseSkillIdList(requestUrl.searchParams.get("disabledSkillIds"))
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        activeSkillIds: [],
        availableReferences: [],
        diagnostics: [error instanceof Error ? error.message : "Copilot skill discovery failed."],
        error: "Failed to load Copilot skills.",
        matchedSkills: [],
        skillCount: 0
      });
    }
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { findCopilotSkills, parseSkillIdList } from "../../server/copilot-skills-service";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const prompt = typeof req.query.prompt === "string" ? req.query.prompt : "";
    const activeSkillIds = parseSkillIdList(typeof req.query.activeSkillIds === "string" ? req.query.activeSkillIds : null);
    const disabledSkillIds = parseSkillIdList(typeof req.query.disabledSkillIds === "string" ? req.query.disabledSkillIds : null);
    return res.status(200).json(await findCopilotSkills(prompt, { activeSkillIds, disabledSkillIds }));
  } catch (error) {
    return res.status(500).json({
      activeSkillIds: [],
      availableReferences: [],
      diagnostics: [error instanceof Error ? error.message : "Copilot skill discovery failed."],
      error: "Failed to load Copilot skills.",
      matchedSkills: [],
      skillCount: 0
    });
  }
}

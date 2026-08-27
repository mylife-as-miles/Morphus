import { bundledCopilotSkills } from "@/generated/copilot-skills-manifest";
import type { CopilotSkillContext, CopilotSkillMatch } from "./types";

type SkillsApiResponse = {
  activeSkillIds?: string[];
  availableReferences?: CopilotSkillContext["availableReferences"];
  error?: string;
  matchedSkills?: CopilotSkillMatch[];
};

type DiscoverCopilotSkillsOptions = {
  activeSkillIds?: string[];
  disabledSkillIds?: string[];
};

export async function discoverCopilotSkills(
  prompt: string,
  options: DiscoverCopilotSkillsOptions = {}
): Promise<CopilotSkillContext | undefined> {
  const trimmed = prompt.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL("/api/copilot/skills", window.location.origin);
    url.searchParams.set("prompt", trimmed);
    if (options.activeSkillIds?.length) url.searchParams.set("activeSkillIds", options.activeSkillIds.join(","));
    if (options.disabledSkillIds?.length) url.searchParams.set("disabledSkillIds", options.disabledSkillIds.join(","));
    const response = await fetch(url.toString());
    if (!response.ok) return undefined;

    const payload = (await response.json()) as SkillsApiResponse;
    return {
      activeSkillIds: Array.isArray(payload.activeSkillIds) ? payload.activeSkillIds.slice(0, 3) : [],
      availableReferences: Array.isArray(payload.availableReferences) ? payload.availableReferences : [],
      matchedSkills: Array.isArray(payload.matchedSkills) ? payload.matchedSkills.slice(0, 3) : []
    };
  } catch {
    return undefined;
  }
}

function bundledSkillContent(skillId: string) {
  return bundledCopilotSkills.find((skill) => skill.id === skillId)?.content;
}

export function appendSkillContextToPrompt(
  systemPrompt: string,
  skillContext?: CopilotSkillContext
) {
  if (!skillContext || skillContext.matchedSkills.length === 0) return systemPrompt;

  const primarySkills = skillContext.matchedSkills.slice(0, 2);
  const skillBlocks = primarySkills.map((skill, index) => {
    const content = bundledSkillContent(skill.id);
    const references = skillContext.availableReferences
      .filter((reference) => reference.skillId === skill.id)
      .map((reference) => `- ${reference.referenceId}: ${reference.title}`)
      .join("\n");
    return [
      `### ${index + 1}. ${skill.name}`,
      `Activation: ${skill.activationReason}`,
      skill.description,
      content ? `\n${content}` : `\nGuidance: ${skill.excerpt}`,
      references ? `\nAvailable references (read only when useful):\n${references}` : ""
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `${systemPrompt}

## Active Copilot Skills
- Skills provide task-specific production doctrine. They guide tool choice and verification; they never replace real editor tools.
- Read deeper references only when needed. Do not reread the same range during one run.
- Confirm scene state, generation, visual quality, and performance through actual tool results.

${skillBlocks}`;
}

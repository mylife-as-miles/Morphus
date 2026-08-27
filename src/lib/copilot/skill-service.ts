import type { BundledCopilotSkill } from "@/generated/copilot-skills-manifest";
import type {
  CopilotSkillContext,
  CopilotSkillMatch,
  CopilotSkillReference
} from "./types";

export type CopilotSkillCatalog = {
  diagnostics?: string[];
  skills: BundledCopilotSkill[];
};

export type CopilotSkillMatchOptions = {
  activeSkillIds?: string[];
  disabledSkillIds?: string[];
  maxSkills?: number;
};

type ReferenceReadOptions = {
  endLine?: number;
  maxChars?: number;
  startLine?: number;
};

type ReferenceSearchOptions = {
  maxResults?: number;
  referenceIds?: string[];
  skillId?: string;
};

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "build", "can", "could", "create",
  "for", "from", "have", "into", "just", "make", "need", "not", "only", "please",
  "that", "the", "their", "them", "this", "use", "want", "with", "would", "you", "your"
]);

const AAA_EXPLICIT = /\b(?:use|enable|activate|apply)\s+(?:the\s+)?(?:aaa|ue5(?:-class)?|worldbuilding|aaa-game-worldbuilding)/i;
const AAA_PHRASES = [
  "aaa game", "aaa quality", "ue5", "unreal engine 5", "next gen", "next-generation",
  "photorealistic", "cinematic game world", "open world", "open-world", "large world",
  "procedural world", "realistic forest", "realistic mountain", "river valley", "alpine world",
  "showcase environment", "environment art", "high fidelity", "ultra detailed",
  "volumetric clouds", "advanced lighting", "realistic water", "cinematic flythrough",
  "world generation", "large-scale level", "game environment", "action rpg world",
  "survival game world", "survival map", "exploration game", "open-world rpg"
];
const AAA_WORLD_TERMS = [
  "world", "environment", "level", "map", "region", "valley", "kingdom", "alpine", "biome", "biomes",
  "forest", "mountain", "mountains", "river", "rivers", "lake", "lakes", "landscape", "terrain"
];
const AAA_QUALITY_TERMS = [
  "aaa", "cinematic", "realistic", "photorealistic", "detailed", "detail", "high fidelity",
  "showcase", "next-gen", "next generation", "immersive"
];
const MICRO_EDIT_PATTERN = /^(?:please\s+)?(?:move|rename|delete|list|select|change|make|set)\b/i;
const MICRO_EDIT_TERMS = ["cube", "chair", "node", "material", "wall", "room", "selected", "red", "blue"];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function firstUsefulExcerpt(content: string, maxLength = 420) {
  const excerpt = content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
    .slice(0, 6)
    .join(" ");

  return excerpt.length <= maxLength ? excerpt : `${excerpt.slice(0, maxLength - 3).trimEnd()}...`;
}

function priorityOf(skill: BundledCopilotSkill) {
  const priority = skill.metadata.priority;
  if (typeof priority === "number" && Number.isFinite(priority)) return priority;
  if (priority === "high") return 100;
  if (priority === "medium") return 50;
  if (priority === "low") return 10;
  return undefined;
}

function hasAny(value: string, candidates: string[]) {
  return candidates.filter((candidate) => value.includes(candidate));
}

function scoreAaaWorldbuilding(prompt: string) {
  const normalized = normalizeText(prompt);
  if (!normalized) return { reason: "", score: 0 };
  if (AAA_EXPLICIT.test(prompt) || normalized.includes("aaa game worldbuilding")) {
    return { reason: "Explicit AAA worldbuilding skill request.", score: 100 };
  }

  const phrases = hasAny(normalized, AAA_PHRASES.map(normalizeText));
  if (phrases.length > 0) {
    return { reason: `Matched ${phrases.slice(0, 2).join(" and ")} request language.`, score: 32 + phrases.length * 3 };
  }

  const worldTerms = hasAny(normalized, AAA_WORLD_TERMS);
  const qualityTerms = hasAny(normalized, AAA_QUALITY_TERMS);
  const hasExploreForHours = /\b(?:explore|exploration)\b/.test(normalized) && /\bhours?\b/.test(normalized);
  if (worldTerms.length >= 2 && (qualityTerms.length > 0 || hasExploreForHours)) {
    return {
      reason: "Matched an ambitious environment request from its world, scale, and quality intent.",
      score: 26 + Math.min(worldTerms.length, 4) + qualityTerms.length
    };
  }
  if (worldTerms.length >= 1 && qualityTerms.length > 0 && /\b(?:build|create|make|design)\b/.test(normalized)) {
    return {
      reason: "Matched a high-quality game-environment request.",
      score: 24 + qualityTerms.length
    };
  }
  if (worldTerms.length >= 3) {
    return {
      reason: "Matched a multi-feature game-environment request.",
      score: 24 + Math.min(worldTerms.length, 5)
    };
  }
  return { reason: "", score: 0 };
}

function scoreGenericSkill(skill: BundledCopilotSkill, prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  const promptTokens = tokenize(prompt);
  const name = normalizeText(skill.name);
  const description = normalizeText(skill.description);
  const keywords = new Set(skill.references.flatMap((reference) => reference.keywords));
  let score = normalizedPrompt.includes(name) ? 12 : 0;

  for (const token of promptTokens) {
    if (name.includes(token)) score += 5;
    else if (description.includes(token)) score += 3;
    else if (keywords.has(token)) score += 1;
  }
  return score;
}

function isClearlyUnrelatedMicroEdit(prompt: string) {
  const normalized = normalizeText(prompt);
  return MICRO_EDIT_PATTERN.test(prompt) &&
    hasAny(normalized, MICRO_EDIT_TERMS).length > 0 &&
    scoreAaaWorldbuilding(prompt).score === 0;
}

function toSkillMatch(skill: BundledCopilotSkill, score: number, activationReason: string): CopilotSkillMatch {
  const priority = priorityOf(skill);
  return {
    activationReason,
    description: skill.description,
    excerpt: firstUsefulExcerpt(skill.content),
    id: skill.id,
    name: skill.name,
    priority,
    referenceIds: skill.references.map((reference) => reference.id),
    score,
    source: skill.source
  };
}

function referencesForSkills(skills: BundledCopilotSkill[]): CopilotSkillReference[] {
  return skills.flatMap((skill) =>
    skill.references.map((reference) => ({
      description: firstUsefulExcerpt(reference.content, 180),
      referenceId: reference.id,
      skillId: skill.id,
      title: reference.title
    }))
  );
}

export function matchCopilotSkills(
  prompt: string,
  catalog: CopilotSkillCatalog,
  options: CopilotSkillMatchOptions = {}
): CopilotSkillContext {
  const maxSkills = Math.max(1, Math.min(options.maxSkills ?? 3, 3));
  const disabled = new Set(options.disabledSkillIds ?? []);
  const byId = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  const matches = new Map<string, CopilotSkillMatch>();
  const aaaSkill = byId.get("aaa-game-worldbuilding");

  for (const skill of catalog.skills) {
    if (disabled.has(skill.id)) continue;
    const aaaScore = skill.id === "aaa-game-worldbuilding" ? scoreAaaWorldbuilding(prompt) : undefined;
    const score = aaaScore ? aaaScore.score : scoreGenericSkill(skill, prompt);
    if (aaaScore ? score <= 0 : score < 4) continue;
    matches.set(skill.id, toSkillMatch(skill, score, aaaScore?.reason || "Matched relevant skill terms."));
  }

  if (!isClearlyUnrelatedMicroEdit(prompt)) {
    for (const activeId of options.activeSkillIds ?? []) {
      const skill = byId.get(activeId);
      if (!skill || disabled.has(activeId)) continue;
      const existing = matches.get(activeId);
      matches.set(
        activeId,
        existing ?? toSkillMatch(skill, 90, "Kept active from this Copilot session for the follow-up request.")
      );
    }
  }

  if (aaaSkill && disabled.has(aaaSkill.id)) matches.delete(aaaSkill.id);

  const matchedSkills = Array.from(matches.values())
    .sort((left, right) => right.score - left.score || (right.priority ?? 0) - (left.priority ?? 0) || left.name.localeCompare(right.name))
    .slice(0, maxSkills);
  const activeSkillIds = matchedSkills.map((skill) => skill.id);
  const matchedCatalogSkills = activeSkillIds
    .map((id) => byId.get(id))
    .filter((skill): skill is BundledCopilotSkill => Boolean(skill));

  return {
    activeSkillIds,
    availableReferences: referencesForSkills(matchedCatalogSkills),
    matchedSkills
  };
}

export function listCopilotSkillReferences(catalog: CopilotSkillCatalog, skillId?: string) {
  const skills = skillId ? catalog.skills.filter((skill) => skill.id === skillId) : catalog.skills;
  if (skillId && skills.length === 0) {
    return { error: { code: "unknown_skill", message: `Unknown Copilot skill: ${skillId}` }, success: false };
  }
  return {
    references: skills.flatMap((skill) => skill.references.map((reference) => ({
      approximateChars: reference.content.length,
      referenceId: reference.id,
      skillId: skill.id,
      title: reference.title
    }))),
    success: true
  };
}

export function readCopilotSkillReference(
  catalog: CopilotSkillCatalog,
  skillId: string,
  referenceId: string,
  options: ReferenceReadOptions = {}
) {
  const skill = catalog.skills.find((candidate) => candidate.id === skillId);
  if (!skill) return { error: { code: "unknown_skill", message: `Unknown Copilot skill: ${skillId}` }, success: false };
  const reference = skill.references.find((candidate) => candidate.id === referenceId);
  if (!reference) return { error: { code: "unknown_reference", message: `Unknown reference ${referenceId} for ${skillId}.` }, success: false };

  const lines = reference.content.split(/\r?\n/);
  const startLine = Math.max(1, Math.floor(options.startLine ?? 1));
  const requestedEnd = Math.max(startLine, Math.floor(options.endLine ?? lines.length));
  const endLine = Math.min(lines.length, requestedEnd);
  const maxChars = Math.max(1000, Math.min(Math.floor(options.maxChars ?? 24000), 24000));
  const sliced = lines.slice(startLine - 1, endLine).join("\n");
  const truncated = sliced.length > maxChars;

  return {
    content: truncated ? sliced.slice(0, maxChars) : sliced,
    endLine,
    maxChars,
    reference: { referenceId: reference.id, skillId: skill.id, title: reference.title },
    startLine,
    success: true,
    totalChars: reference.content.length,
    totalLines: lines.length,
    truncated
  };
}

function searchSnippet(line: string, index: number, length: number) {
  const radius = 84;
  const start = Math.max(0, index - radius);
  const end = Math.min(line.length, index + Math.max(length, 1) + radius);
  return `${start > 0 ? "..." : ""}${line.slice(start, end).trim()}${end < line.length ? "..." : ""}`;
}

export function searchCopilotSkillReferences(
  catalog: CopilotSkillCatalog,
  query: string,
  options: ReferenceSearchOptions = {}
) {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return { error: { code: "invalid_query", message: "Provide a specific search query." }, success: false };
  }
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 12, 24));
  const referenceFilter = options.referenceIds ? new Set(options.referenceIds) : undefined;
  const skills = options.skillId ? catalog.skills.filter((skill) => skill.id === options.skillId) : catalog.skills;
  if (options.skillId && skills.length === 0) {
    return { error: { code: "unknown_skill", message: `Unknown Copilot skill: ${options.skillId}` }, success: false };
  }

  const matches: Array<{
    endLine: number;
    excerpt: string;
    matchingTerms: string[];
    referenceId: string;
    skillId: string;
    startLine: number;
    title: string;
  }> = [];
  for (const skill of skills) {
    for (const reference of skill.references) {
      if (referenceFilter && !referenceFilter.has(reference.id)) continue;
      const lines = reference.content.split(/\r?\n/);
      for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
        const normalizedLine = normalizeText(lines[index]);
        const matchingTerms = terms.filter((term) => normalizedLine.includes(term));
        if (matchingTerms.length === 0) continue;
        const firstTerm = matchingTerms[0];
        matches.push({
          endLine: Math.min(lines.length, index + 3),
          excerpt: searchSnippet(lines[index], lines[index].toLowerCase().indexOf(firstTerm), firstTerm.length),
          matchingTerms,
          referenceId: reference.id,
          skillId: skill.id,
          startLine: Math.max(1, index - 1),
          title: reference.title
        });
      }
    }
  }

  return { matches, query, success: true };
}

export function worldbuildingStageForTool(toolName: string) {
  if (toolName === "capture_world_verification_screenshot") return "verification" as const;
  if (toolName === "inspect_world_performance") return "optimization" as const;
  if (toolName === "create_procedural_world" || toolName === "configure_procedural_terrain" || toolName === "regenerate_procedural_world") return "foundation" as const;
  if (toolName === "configure_procedural_vegetation" || toolName === "configure_procedural_motion") return "dressing" as const;
  if (toolName === "configure_procedural_lighting" || toolName === "configure_procedural_atmosphere" || toolName === "configure_procedural_water" || toolName === "configure_procedural_post" || toolName === "set_world_time_of_day" || toolName === "set_world_weather") return "lighting" as const;
  if (toolName === "set_world_exploration_mode" || toolName === "create_world_bookmark" || toolName === "play_world_flythrough" || toolName === "place_player_spawn") return "gameplay" as const;
  return undefined;
}

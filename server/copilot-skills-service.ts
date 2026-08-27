import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
  bundledCopilotSkillDiagnostics,
  bundledCopilotSkills,
  type BundledCopilotSkill
} from "../src/generated/copilot-skills-manifest";
import {
  matchCopilotSkills,
  type CopilotSkillCatalog,
  type CopilotSkillMatchOptions
} from "../src/lib/copilot/skill-service";

type SkillsServiceResult = ReturnType<typeof matchCopilotSkills> & {
  diagnostics: string[];
  skillCount: number;
};

let externalSkillsPromise: Promise<{ diagnostics: string[]; skills: BundledCopilotSkill[] }> | null = null;

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}

function readFrontmatterField(source: string, field: string) {
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/)?.[1] ?? "";
  const line = frontmatter.match(new RegExp(`^\\s*${field}:\\s*(.*)$`, "im"));
  if (!line) return "";
  if (line[1].trim() === ">" || line[1].trim() === "|") {
    const start = (line.index ?? 0) + line[0].length;
    return frontmatter.slice(start).split(/\r?\n[^\s#][^:]*:/)[0].replace(/^\s+/gm, "").replace(/\s+/g, " ").trim();
  }
  return line[1].trim().replace(/^['"]|['"]$/g, "");
}

function firstMeaningfulLine(source: string) {
  return source
    .replace(/^---[\s\S]*?---\s*/m, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("-")) ?? "External Copilot skill";
}

function keywordsFor(value: string) {
  return Array.from(new Set((value.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []).slice(0, 64)));
}

function titleForReference(filename: string, content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? filename.replace(/\.md$/i, "").replace(/[-_]/g, " ");
}

function externalRoots() {
  const configured = process.env.BLUD_COPILOT_SKILLS_DIR?.trim();
  const extra = process.env.BLUD_COPILOT_EXTRA_SKILLS_DIRS
    ?.split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
  const defaults = configured ? [configured] : [join(homedir(), ".gemini", "antigravity", "skills")];
  return Array.from(new Set([...defaults, ...extra]));
}

async function readExternalSkill(skillDirectory: string, directoryName: string, diagnostics: string[]) {
  let content: string;
  try {
    content = await readFile(join(skillDirectory, "SKILL.md"), "utf8");
  } catch {
    diagnostics.push(`Skipped external skill ${directoryName}: SKILL.md could not be read.`);
    return undefined;
  }

  const references: BundledCopilotSkill["references"] = [];
  try {
    const entries = await readdir(join(skillDirectory, "references"), { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
      try {
        const referenceContent = await readFile(join(skillDirectory, "references", entry.name), "utf8");
        const title = titleForReference(entry.name, referenceContent);
        references.push({
          content: referenceContent,
          id: slugify(entry.name.replace(/\.md$/i, "")),
          keywords: keywordsFor(`${title}\n${referenceContent}`),
          path: `${directoryName}/references/${entry.name}`,
          title
        });
      } catch {
        diagnostics.push(`Skipped external reference ${entry.name} for ${directoryName}.`);
      }
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      diagnostics.push(`Could not inspect external references for ${directoryName}.`);
    }
  }

  const name = readFrontmatterField(content, "name") || directoryName;
  return {
    content,
    description: readFrontmatterField(content, "description") || firstMeaningfulLine(content),
    id: slugify(directoryName),
    metadata: { priority: readFrontmatterField(content, "priority") || undefined },
    name,
    references,
    source: "external" as const
  } satisfies BundledCopilotSkill;
}

async function loadExternalSkills() {
  const diagnostics: string[] = [];
  const skills: BundledCopilotSkill[] = [];
  for (const root of externalRoots()) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      diagnostics.push("An external Copilot skills root could not be read.");
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readExternalSkill(join(root, entry.name), entry.name, diagnostics);
      if (skill) skills.push(skill);
    }
  }
  return { diagnostics, skills };
}

async function externalSkills() {
  if (!externalSkillsPromise) {
    externalSkillsPromise = loadExternalSkills().catch((error) => {
      externalSkillsPromise = null;
      throw error;
    });
  }
  return externalSkillsPromise;
}

export async function getCopilotSkillCatalog(): Promise<CopilotSkillCatalog> {
  const external = await externalSkills();
  const byId = new Map<string, BundledCopilotSkill>();
  const repositoryNames = new Set(bundledCopilotSkills.map((skill) => skill.name.toLowerCase()));
  for (const skill of bundledCopilotSkills) byId.set(skill.id, skill);
  for (const skill of external.skills) {
    if (!byId.has(skill.id) && !repositoryNames.has(skill.name.toLowerCase())) byId.set(skill.id, skill);
  }
  return {
    diagnostics: [...bundledCopilotSkillDiagnostics, ...external.diagnostics],
    skills: Array.from(byId.values())
  };
}

export async function findCopilotSkills(
  prompt: string,
  options: CopilotSkillMatchOptions = {}
): Promise<SkillsServiceResult> {
  const catalog = await getCopilotSkillCatalog();
  return {
    ...matchCopilotSkills(prompt, catalog, options),
    diagnostics: catalog.diagnostics ?? [],
    skillCount: catalog.skills.length
  };
}

export function parseSkillIdList(value: string | null) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^[a-z0-9][a-z0-9-]*$/i.test(entry))
    .slice(0, 12) ?? [];
}

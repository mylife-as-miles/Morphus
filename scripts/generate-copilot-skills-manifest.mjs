import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const skillsRoot = path.join(repositoryRoot, ".agents", "skills");
// This repo is the editor, so the manifest lands beside the rest of its source
// rather than under an apps/ directory that no longer exists here.
const outputPath = path.join(
  repositoryRoot,
  "src",
  "generated",
  "copilot-skills-manifest.ts"
);

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "available", "before", "between",
  "build", "can", "copilot", "create", "dream", "for", "from", "game", "guidance",
  "into", "level", "more", "not", "only", "other", "production", "quality", "scene",
  "skill", "that", "the", "their", "then", "this", "through", "use", "using", "when",
  "with", "world", "you", "your"
]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "reference";
}

function parseFrontmatter(source) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  const frontmatter = match?.[1] ?? "";
  const body = match ? source.slice(match[0].length) : source;
  const readField = (field) => {
    const lineMatch = frontmatter.match(new RegExp(`^\\s*${field}:\\s*(.*)$`, "im"));
    if (!lineMatch) return "";
    const value = lineMatch[1].trim();
    if (value === ">" || value === "|") {
      const start = lineMatch.index + lineMatch[0].length;
      const nextField = frontmatter.slice(start).search(/\r?\n[^\s#][^:]*:/);
      const continuation = frontmatter.slice(start, nextField === -1 ? undefined : start + nextField);
      return continuation.replace(/^\s+/gm, "").replace(/\s+/g, " ").trim();
    }
    return value.replace(/^['"]|['"]$/g, "").trim();
  };
  const firstMeaningfulLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("-"));

  return {
    body,
    description: readField("description") || firstMeaningfulLine || "Repository Copilot skill",
    metadata: {
      compatibility: readField("compatibility") || undefined,
      license: readField("license") || undefined,
      priority: readField("priority") || undefined
    },
    name: readField("name")
  };
}

function titleFromReference(filename, content) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || filename.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
}

function extractKeywords(value) {
  const words = value.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  return Array.from(new Set(words.filter((word) => !STOP_WORDS.has(word)))).slice(0, 48);
}

async function readReferences(skillDirectory, diagnostics) {
  const referencesDirectory = path.join(skillDirectory, "references");
  let entries;
  try {
    entries = await readdir(referencesDirectory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    diagnostics.push(`Could not read references for ${path.basename(skillDirectory)}.`);
    return [];
  }

  const references = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
    try {
      const content = await readFile(path.join(referencesDirectory, entry.name), "utf8");
      const title = titleFromReference(entry.name, content);
      references.push({
        id: slugify(entry.name.replace(/\.md$/i, "")),
        title,
        path: `${path.basename(skillDirectory)}/references/${entry.name}`,
        content,
        keywords: extractKeywords(`${title}\n${content}`)
      });
    } catch {
      diagnostics.push(`Could not read reference ${entry.name} for ${path.basename(skillDirectory)}.`);
    }
  }
  return references;
}

async function buildManifest() {
  const diagnostics = [];
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    throw new Error(`Repository skills directory is missing: ${skillsRoot}`);
  }

  const skills = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const skillDirectory = path.join(skillsRoot, entry.name);
    const skillPath = path.join(skillDirectory, "SKILL.md");
    let content;
    try {
      content = await readFile(skillPath, "utf8");
    } catch {
      diagnostics.push(`Skipped repository skill ${entry.name}: SKILL.md could not be read.`);
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed.name) {
      diagnostics.push(`Repository skill ${entry.name} has no frontmatter name; using its directory name.`);
    }
    const name = parsed.name || entry.name;
    skills.push({
      id: slugify(entry.name),
      name,
      description: parsed.description,
      content,
      references: await readReferences(skillDirectory, diagnostics),
      metadata: parsed.metadata,
      source: "repository"
    });
  }

  return { diagnostics, skills };
}

const manifest = await buildManifest();
const output = `/* This file is generated by scripts/generate-copilot-skills-manifest.mjs. */\n\n` +
`export type BundledCopilotSkill = {\n` +
`  id: string;\n  name: string;\n  description: string;\n  content: string;\n` +
`  references: Array<{ id: string; title: string; path: string; content: string; keywords: string[] }>;\n` +
`  metadata: Record<string, unknown>;\n  source: "repository" | "external";\n};\n\n` +
`export const bundledCopilotSkills: BundledCopilotSkill[] = ${JSON.stringify(manifest.skills, null, 2)};\n\n` +
`export const bundledCopilotSkillDiagnostics: string[] = ${JSON.stringify(manifest.diagnostics, null, 2)};\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");
console.log(`Generated ${manifest.skills.length} bundled Copilot skills at ${path.relative(repositoryRoot, outputPath)}.`);
for (const diagnostic of manifest.diagnostics) console.warn(`[copilot-skills] ${diagnostic}`);

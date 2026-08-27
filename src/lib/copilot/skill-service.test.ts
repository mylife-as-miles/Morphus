import assert from "node:assert/strict";
import test from "node:test";
import { bundledCopilotSkills } from "@/generated/copilot-skills-manifest";
import { createBudgetedCopilotSkillToolContext } from "@/app/hooks/useCopilot";
import { findCopilotSkills } from "../../../server/copilot-skills-service";
import { EDITOR_COPILOT_TOOL_DECLARATIONS, GAME_TOOL_DECLARATIONS } from "./tool-declarations";
import {
  listCopilotSkillReferences,
  matchCopilotSkills,
  readCopilotSkillReference,
  searchCopilotSkillReferences
} from "./skill-service";
import { appendSkillContextToPrompt } from "./skills";

const catalog = { skills: bundledCopilotSkills };
const aaaId = "aaa-game-worldbuilding";

function activeAaa(prompt: string) {
  return matchCopilotSkills(prompt, catalog).activeSkillIds.includes(aaaId);
}

test("AAA environment requests activate the repository worldbuilding skill", () => {
  const prompts = [
    "Create a UE5-quality open world.",
    "Build a cinematic alpine valley.",
    "Make a realistic forest with rivers and volumetric clouds.",
    "Create a next-gen RPG environment.",
    "Build the most detailed game world possible.",
    "Create a survival map with multiple biomes.",
    "Build a giant forest valley players can explore for hours.",
    "Create a cinematic mountain kingdom with rivers, lakes and weather."
  ];
  for (const prompt of prompts) assert.equal(activeAaa(prompt), true, prompt);
});

test("micro edits do not activate AAA worldbuilding", () => {
  const prompts = [
    "Move the selected cube.",
    "Rename this node.",
    "Make this wall blue.",
    "List all materials.",
    "Delete the selected chair."
  ];
  for (const prompt of prompts) assert.equal(activeAaa(prompt), false, prompt);
});

test("AAA matching does not pull in an unrelated low-score repository skill", () => {
  const context = matchCopilotSkills("Build a cinematic alpine valley.", catalog);
  assert.deepEqual(context.activeSkillIds, [aaaId]);
});

test("active AAA context survives relevant follow-ups and respects a session disable", () => {
  const followUp = matchCopilotSkills("Make the mountain route more dramatic.", catalog, {
    activeSkillIds: [aaaId]
  });
  assert.deepEqual(followUp.activeSkillIds, [aaaId]);

  const disabled = matchCopilotSkills("Create an open world.", catalog, {
    disabledSkillIds: [aaaId]
  });
  assert.equal(disabled.activeSkillIds.includes(aaaId), false);
});

test("bundled manifest includes the AAA skill, its main document, and all references without absolute paths", () => {
  const skill = bundledCopilotSkills.find((candidate) => candidate.id === aaaId);
  assert.ok(skill);
  assert.match(skill.content, /AAA Game Worldbuilding/);
  assert.equal(skill.metadata.priority, "high");
  assert.ok(skill.references.length >= 8);
  assert.ok(skill.references.some((reference) => reference.id === "project-laas-v2"));
  for (const reference of skill.references) assert.equal(/^[A-Za-z]:\\|^\//.test(reference.path), false);
});

test("the shared Node service returns the same production-safe repository match", async () => {
  const direct = matchCopilotSkills("Create a cinematic open world with a river.", catalog);
  const served = await findCopilotSkills("Create a cinematic open world with a river.");
  assert.equal(served.activeSkillIds.includes(aaaId), true);
  assert.equal(direct.activeSkillIds.includes(aaaId), true);
  const skill = served.matchedSkills.find((candidate) => candidate.id === aaaId);
  assert.equal(skill?.source, "repository");
  assert.equal(JSON.stringify(served).includes("C:\\Users\\"), false);
});

test("reference listing, bounded reads, searches, and structured failures work", () => {
  const listed = listCopilotSkillReferences(catalog, aaaId);
  assert.equal(listed.success, true);
  const references = ("references" in listed ? listed.references : []) ?? [];
  assert.ok(references.some((reference) => reference.referenceId === "verification-battery"));

  const read = readCopilotSkillReference(catalog, aaaId, "verification-battery", {
    endLine: 4,
    maxChars: 1200,
    startLine: 1
  });
  assert.equal(read.success, true);
  if (!read.success) return;
  assert.equal(read.startLine, 1);
  assert.equal(read.endLine, 4);
  assert.match(read.content, /Verification Battery/);

  const search = searchCopilotSkillReferences(catalog, "black shadows", { skillId: aaaId });
  assert.equal(search.success, true);
  const matches = ("matches" in search ? search.matches : []) ?? [];
  assert.ok(matches.some((match) => match.referenceId === "failure-modes"));

  const missing = readCopilotSkillReference(catalog, aaaId, "missing-reference");
  assert.equal(missing.success, false);
  const error = "error" in missing ? missing.error : undefined;
  assert.equal(error?.code, "unknown_reference");
});

test("reference reads cache duplicate ranges and cap unique documents per run", () => {
  const context = createBudgetedCopilotSkillToolContext({}, [aaaId]);
  const first = context.copilotReadSkillReference?.(aaaId, "verification-battery", { endLine: 4, startLine: 1 });
  assert.equal(first?.success, true);
  const duplicate = context.copilotReadSkillReference?.(aaaId, "verification-battery", { endLine: 4, startLine: 1 });
  assert.equal(duplicate?.cached, true);

  const references = bundledCopilotSkills.find((skill) => skill.id === aaaId)?.references ?? [];
  for (const reference of references.slice(1, 6)) {
    const result = context.copilotReadSkillReference?.(aaaId, reference.id, { maxChars: 1000 });
    assert.equal(result?.success, true, reference.id);
  }
  const overBudget = context.copilotReadSkillReference?.(aaaId, references[6]?.id ?? "missing", { maxChars: 1000 });
  assert.equal(overBudget?.budgetExceeded, true);
});

test("only editor Copilot receives reference tools and active skill content", () => {
  const editorToolNames = new Set(EDITOR_COPILOT_TOOL_DECLARATIONS.map((tool) => tool.name));
  const gameToolNames = new Set(GAME_TOOL_DECLARATIONS.map((tool) => tool.name));
  assert.equal(editorToolNames.has("list_copilot_skill_references"), true);
  assert.equal(editorToolNames.has("read_copilot_skill_reference"), true);
  assert.equal(editorToolNames.has("search_copilot_skill_references"), true);
  assert.equal(gameToolNames.has("read_copilot_skill_reference"), false);

  const context = matchCopilotSkills("Create an open-world RPG region.", catalog);
  const prompt = appendSkillContextToPrompt("base prompt", context);
  assert.match(prompt, /AAA Game Worldbuilding/);
  assert.match(prompt, /Available references/);
  assert.equal(appendSkillContextToPrompt("base prompt", undefined), "base prompt");
});

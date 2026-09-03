/**
 * Reports the exposed WebMCP tools against Chrome's recommended character
 * budgets: 30 per name, 500 per description, 150 per parameter description.
 *
 * The bridge exposes every Copilot declaration, so this walks all of them and
 * applies the same two substitutions the bridge does -- the short alias for an
 * over-long name, and the purpose-written override for an over-long
 * description -- because that is the text an agent actually receives.
 *
 * Run with `node scripts/webmcp-budget.mjs`. Exits non-zero if anything is over
 * budget, so it can gate a build.
 */

import { readFileSync } from "node:fs";

const NAME_BUDGET = 30;
const DESCRIPTION_BUDGET = 500;
const PARAM_BUDGET = 150;

/** Matches a double-quoted TS string literal, honouring backslash escapes. */
const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;

const source = readFileSync("src/lib/copilot/tool-declarations.ts", "utf8");
const bridge = readFileSync("src/lib/webmcp/tools.ts", "utf8");

/** Every declared tool name, in declaration order. */
const names = [...new Set([...source.matchAll(/name:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]))];

/** Short aliases the agent sees in place of an over-long name. */
const aliasBlock = bridge.slice(
  bridge.indexOf("const NAME_ALIASES"),
  bridge.indexOf("/** Alias back to the declaration name")
);
const aliases = new Map(
  [...aliasBlock.matchAll(/([a-z0-9_]+):\s*"([a-z0-9_]+)"/g)].map((m) => [m[1], m[2]])
);

/** Hand-written replacements, which are what the agent is really shown. */
const overrideBlock = bridge.slice(
  bridge.indexOf("const DESCRIPTION_OVERRIDES"),
  bridge.indexOf("/**\n * Tools an agent should meet first")
);
const overrides = new Map(
  [...overrideBlock.matchAll(new RegExp(`^\\s{2}([a-z0-9_]+):\\s*\\n?\\s*${STRING}`, "gm"))].map(
    (match) => [match[1], match[2]]
  )
);

let over = 0;
let trimmedParams = 0;
const problems = [];

for (const name of names) {
  const at = source.indexOf(`name: "${name}"`);
  const window = source.slice(at, at + 6000);

  const exposed = aliases.get(name) ?? name;
  const declared = window.match(new RegExp(`description:\\s*\\n?\\s*${STRING}`))?.[1] ?? "";
  const description = overrides.get(name) ?? declared;

  const issues = [];
  if (description.length > DESCRIPTION_BUDGET) {
    issues.push(`desc ${description.length} (+${description.length - DESCRIPTION_BUDGET})`);
  }
  if (exposed.length > NAME_BUDGET) {
    issues.push(`name ${exposed.length} (+${exposed.length - NAME_BUDGET})`);
  }

  // Parameter descriptions are trimmed at registration, so an overrun there is
  // counted for reporting but is not a failure.
  trimmedParams += [...window.matchAll(new RegExp(`description:\\s*${STRING}`, "g"))]
    .slice(1)
    .filter((match) => match[1].length > PARAM_BUDGET).length;

  if (issues.length) {
    over += 1;
    problems.push(`${String(description.length).padStart(5)}  ${exposed.padEnd(34)}  ${issues.join(", ")}`);
  }
}

console.log(`${names.length} tools exposed over WebMCP.`);
console.log(`  ${aliases.size} names shortened by alias, ${overrides.size} descriptions replaced by override.`);
console.log(`  ${trimmedParams} parameter descriptions over ${PARAM_BUDGET} chars, trimmed at registration.`);

if (problems.length) {
  console.log(`\nOver budget:\n${problems.join("\n")}`);
} else {
  console.log(`\nAll names within ${NAME_BUDGET} chars and all descriptions within ${DESCRIPTION_BUDGET}.`);
}

process.exit(over === 0 ? 0 : 1);

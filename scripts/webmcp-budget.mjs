/**
 * Reports the exposed WebMCP tools against Chrome's recommended character
 * budgets: 30 per name, 500 per description, 150 per parameter description.
 *
 * Descriptions are read from the Copilot declarations the bridge reuses, then
 * replaced by any purpose-written override in the bridge itself -- that is the
 * text an agent actually receives.
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

/** The curated names, taken from the WEBMCP_TOOL_NAMES block. */
const listBlock = bridge.slice(
  bridge.indexOf("WEBMCP_TOOL_NAMES = ["),
  bridge.indexOf("] as const;")
);
const names = [...new Set([...listBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]))];

/** Hand-written replacements, which are what the agent is really shown. */
const overrideBlock = bridge.slice(
  bridge.indexOf("const DESCRIPTION_OVERRIDES"),
  bridge.indexOf("/** Trims a string to a budget")
);
const overrides = new Map(
  [...overrideBlock.matchAll(new RegExp(`^\\s{2}([a-z0-9_]+):\\s*\\n?\\s*${STRING}`, "gm"))].map(
    (match) => [match[1], match[2]]
  )
);

let over = 0;
console.log("chars  tool                            source     status");

for (const name of names) {
  const at = source.indexOf(`name: "${name}"`);
  if (at < 0) {
    console.log(`    ?  ${name.padEnd(30)}  -          NOT FOUND`);
    over += 1;
    continue;
  }

  const window = source.slice(at, at + 6000);
  const override = overrides.get(name);
  const declared = window.match(new RegExp(`description:\\s*\\n?\\s*${STRING}`))?.[1] ?? "";
  const description = override ?? declared;

  const problems = [];
  if (description.length > DESCRIPTION_BUDGET) {
    problems.push(`desc +${description.length - DESCRIPTION_BUDGET}`);
  }
  if (name.length > NAME_BUDGET) problems.push(`name +${name.length - NAME_BUDGET}`);
  if (problems.length) over += 1;

  // Parameter descriptions are trimmed at registration, so an overrun here is
  // reported as a note rather than counted as a failure.
  const longParams = [...window.matchAll(new RegExp(`description:\\s*${STRING}`, "g"))]
    .slice(1)
    .filter((match) => match[1].length > PARAM_BUDGET).length;

  const status = problems.length ? problems.join(", ") : "ok";
  const note = longParams ? ` (${longParams} params trimmed)` : "";
  console.log(
    `${String(description.length).padStart(5)}  ${name.padEnd(30)}  ` +
      `${(override ? "override" : "copilot").padEnd(9)}  ${status}${note}`
  );
}

console.log(
  `\n${names.length} tools exposed, ${over} over budget (limit ${DESCRIPTION_BUDGET} chars).`
);
console.log(`Parameter descriptions over ${PARAM_BUDGET} chars are trimmed at registration.`);
process.exit(over === 0 ? 0 : 1);

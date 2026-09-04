"""Renames the product from "Dream Studio" to "Morphus" across the repository.

Only the space-separated forms are touched, in all three casings. That is not a
shortcut, it is the safety property: every persisted identifier in this
repository uses the hyphenated form -- the IndexedDB name `dream-studio-copilot`,
the localStorage keys `dream-studio:chunk-reload-at` and
`dream-studio:articraft-bridge-url`, the Pinecone namespace `dream-studio-games`,
the scene metadata source written into saved documents, and the MCP client id
`dream-studio-editor`. Renaming any of those would silently orphan data that
already exists in users' browsers and vector stores, and a display name is not
worth that. They are reported at the end rather than changed.

`src/generated/copilot-skills-manifest.ts` is generated from
`.agents/skills/`, so the skill source is renamed and the manifest regenerated
rather than edited in place.
"""

import io
import subprocess
from pathlib import Path

REPLACEMENTS = [
    ("Dream Studio", "Morphus"),
    ("DREAM STUDIO", "MORPHUS"),
    ("dream studio", "morphus"),
]

GENERATED = {"src/generated/copilot-skills-manifest.ts"}

tracked = subprocess.run(
    ["git", "ls-files"], capture_output=True, text=True, check=True
).stdout.splitlines()

changed: list[tuple[str, int]] = []
skipped_generated: list[str] = []

for relative in tracked:
    path = Path(relative)
    if not path.is_file():
        continue

    try:
        original = io.open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, PermissionError):
        continue

    if not any(old in original for old, _ in REPLACEMENTS):
        continue

    if relative in GENERATED:
        skipped_generated.append(relative)
        continue

    updated = original
    count = 0
    for old, new in REPLACEMENTS:
        count += updated.count(old)
        updated = updated.replace(old, new)

    if updated != original:
        io.open(path, "w", encoding="utf-8", newline="").write(updated)
        changed.append((relative, count))

print(f"Renamed in {len(changed)} files, {sum(n for _, n in changed)} occurrences:")
for relative, count in sorted(changed):
    print(f"  {count:>3}  {relative}")

if skipped_generated:
    print("\nGenerated, will be rebuilt from its renamed source:")
    for relative in skipped_generated:
        print(f"       {relative}")

print("\nLeft unchanged on purpose (persisted identifiers, renaming orphans data):")
for note in [
    "src/lib/copilot/copilot-memory.ts      IndexedDB name  dream-studio-copilot",
    "src/lib/chunk-reload.ts                localStorage    dream-studio:chunk-reload-at",
    "src/lib/articraft-client.ts            localStorage    dream-studio:articraft-bridge-url",
    "api/rag/upsert-game-code.ts            Pinecone ns     dream-studio-games",
    "src/lib/copilot/tool-executor.ts       scene metadata  dream-studio-copilot",
    "server/codex-bridge-plugin.ts          MCP client id   dream-studio-editor",
]:
    print(f"       {note}")

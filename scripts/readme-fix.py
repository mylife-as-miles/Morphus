"""Fixes the README's dead references and adds the live URL and licence."""

import io
import re
from pathlib import Path

P = Path("README.md")
s = io.open(P, encoding="utf-8").read()
before = s

# 1. The live URL, replacing the placeholder.
s = s.replace(
    "Live: **[add deployment URL]**",
    "Live: **<https://morphus.myles4miles.chatgpt.site/>**",
    1,
)

# 2. Two links into `../../docs/` -- paths from before this repo was flattened
#    out of the monorepo. Neither file exists here, so both 404 on GitHub. The
#    prose is kept; only the dangling link goes.
s = s.replace(
    """WebGPU-only and reuses the viewport canvas; unsupported hosts show a diagnostic
instead of a silent WebGL fallback. Details are in
[`docs/PROCEDURAL_WORLD_EDITOR.md`](../../docs/PROCEDURAL_WORLD_EDITOR.md).""",
    """WebGPU-only and reuses the viewport canvas; unsupported hosts show a diagnostic
instead of a silent WebGL fallback.""",
    1,
)

s = s.replace(
    """skills retain priority. See
[`docs/COPILOT_AAA_WORLDBUILDING_SKILL.md`](../../docs/COPILOT_AAA_WORLDBUILDING_SKILL.md)
for the integration audit and limits.""",
    "skills retain priority.",
    1,
)

# 3. The "Submission docs" section names three Kaggle drafts, none of which are
#    in this repository, for a different competition. Dead weight either way.
s = re.sub(r"\n## Submission docs\n.*?(?=\n## |\Z)", "\n", s, flags=re.S)

# 4. A licence section. GitHub's sidebar already detects the LICENSE file, but a
#    reader scanning the README should not have to go looking for it.
s = s.rstrip() + """

## Licence

MIT -- see [LICENSE](LICENSE).
"""

assert s != before, "no changes applied"
io.open(P, "w", encoding="utf-8", newline="").write(s)

# Report what is left dangling, so nothing silently rots.
remaining = re.findall(r"\]\((?!https?:|#)([^)]+)\)", s)
missing = [link for link in remaining if not Path(link.split("#")[0]).exists()]
print("README updated.")
print(f"  relative links: {len(remaining)}, broken: {len(missing)}")
for link in missing:
    print(f"    MISSING {link}")

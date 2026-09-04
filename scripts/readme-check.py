"""Checks the README for broken references and stale counts."""

import re
from pathlib import Path

s = Path("README.md").read_text(encoding="utf-8")

code_refs = re.findall(r"`([a-zA-Z0-9_./-]+\.(?:ts|tsx|mjs|md|json))`", s)
missing = [ref for ref in code_refs if not ref.startswith(("../", "http")) and not Path(ref).exists()]

links = re.findall(r"\]\((?!https?:|#)([^)]+)\)", s)
broken = [link for link in links if not Path(link.split("#")[0]).exists()]

print("broken source refs :", missing or "none")
print("broken md links    :", broken or "none")
print("stale counts       :", re.findall(r"\b(?:112|145)\b", s) or "none")
print("Morphus workspace  :", "PRESENT" if "### Morphus" in s else "removed")
print("city section       :", "present" if "## Procedural cities" in s else "MISSING")
print("lines              :", len(s.splitlines()))

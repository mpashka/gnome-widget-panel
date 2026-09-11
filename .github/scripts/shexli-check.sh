#!/usr/bin/env bash
# Run Shexli — the static checker extensions.gnome.org runs on every upload and
# shows the reviewer next to the code — over a packed extension zip, and fail on
# any finding. A finding caught here costs a rebuild; the same finding caught on
# EGO costs a place in a review queue that is weeks long.
#
# Shexli is installed into its own venv under the user cache on first use, so
# the same command works in CI and on a maintainer's machine.
#
# Usage: shexli-check.sh <extension zip>. See ../../docs/process/release.md.
set -euo pipefail

zip_path="$(realpath "${1:?usage: shexli-check.sh <extension zip>}")"

venv="${XDG_CACHE_HOME:-$HOME/.cache}/gwp-shexli"
if [ ! -x "$venv/bin/shexli" ]; then
  python3 -m venv "$venv"
  # tree-sitter 0.26 segfaults inside Shexli's import resolver on Python 3.14.
  "$venv/bin/pip" install --quiet 'shexli==0.2.1' 'tree-sitter<0.26'
fi

report="$(mktemp)"
trap 'rm -f "$report"' EXIT

# Shexli exits 0 even when it reports findings, so the verdict is read from the
# report rather than from the exit code.
"$venv/bin/shexli" --format json "$zip_path" > "$report"

python3 - "$report" <<'EOF'
import json
import sys

report = json.load(open(sys.argv[1]))
findings = report["findings"]
for finding in findings:
    print(f"{finding['rule_id']} {finding['severity']}: {finding['message']}")
    for evidence in finding["evidence"]:
        path = evidence["path"].split(".zip:", 1)[-1]
        line = evidence.get("line")
        print(f"    {path}:{line}" if line else f"    {path}")
if findings:
    print(f"Shexli: {len(findings)} finding(s) the EGO reviewer will see.")
    sys.exit(1)
print("Shexli: no findings.")
EOF

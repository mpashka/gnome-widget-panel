#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
src="$root/extension-src"
out="$root/extension"

if [[ ! -d "$src" ]]; then
  printf 'Missing TypeScript source directory: %s\n' "$src" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out"

while IFS= read -r -d '' dir; do
  rel="${dir#"$src"/}"
  if [[ "$rel" == "$dir" ]]; then
    rel="."
  fi
  mkdir -p "$out/$rel"
done < <(find "$src" -type d -print0)

while IFS= read -r -d '' file; do
  rel="${file#"$src"/}"
  cp "$file" "$out/$rel"
done < <(find "$src" -type f ! -name '*.ts' -print0)

if [[ ! -x "$root/node_modules/.bin/tsc" ]]; then
  printf 'Missing node_modules/.bin/tsc. Run npm install first.\n' >&2
  exit 1
fi

"$root/node_modules/.bin/tsc" -p "$root/tsconfig.json"

find "$out" -type f \( -name '*.js' -o -name '*.json' -o -name '*.md' -o -name '*.css' -o -name '*.xml' \) \
  -exec perl -0pi -e 's/[ \t]+$//mg' {} +

# tsc strips every blank line when it emits JS, leaving the shipped extension an
# unreadable wall of code. Reinsert the AGENTS.md "Code formatting" spacing into
# the generated extension/**/*.js (idempotent). Runs after tsc and the
# trailing-whitespace step above.
node "$root/tools/format-generated.mjs"

# Compile the GSettings schema so the built tree always has an up-to-date
# gschemas.compiled. Without this, `rm -rf extension` above wipes the compiled
# schema and a symlink install (dev-install.sh) would expose a stale/missing
# schema, so new settings keys (e.g. content-padding) would be unknown at
# runtime and their live handlers could not work.
if [[ -d "$out/schemas" ]] && command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas "$out/schemas"
fi

printf 'Built GNOME extension into %s\n' "$out"

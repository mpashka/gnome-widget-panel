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

printf 'Built GNOME extension into %s\n' "$out"

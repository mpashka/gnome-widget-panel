#!/usr/bin/env bash
# Build the extension and pack it into an extensions.gnome.org-ready zip.
#
# EGO (and `gnome-extensions install`) expect a zip whose *root* contains
# metadata.json — no wrapping top-level directory. We build extension-src ->
# extension/ with `npm run build`, then zip the contents of extension/ from
# inside it. The compiled gschemas.compiled is excluded: EGO ships the
# gschema.xml source and compiles schemas itself, and a stale compiled blob is
# just dead weight in the upload.
#
# Output: dist/<uuid>.shell-extension.zip. See ../../docs/release.md.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

npm run build

uuid="$(node -p "require('./extension-src/metadata.json').uuid")"
version="$(node -p "require('./extension-src/metadata.json')['version-name']")"

mkdir -p dist
zip_path="$root/dist/${uuid}.shell-extension.zip"
rm -f "$zip_path"

(
  cd extension
  zip -qr "$zip_path" . -x 'schemas/gschemas.compiled'
)

printf 'Packed %s (version %s) -> %s\n' "$uuid" "$version" "$zip_path"

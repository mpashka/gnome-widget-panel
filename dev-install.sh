#!/usr/bin/env bash
# @tag:dev
#
# Developer installation: symlink the built extension tree into an ISOLATED
# extensions directory used only by the dev shell (`./dev-run.sh` points GNOME
# Shell at it via XDG_DATA_HOME). This keeps the widget entirely out of your main
# GNOME session's extensions dir (`~/.local/share/gnome-shell/extensions`), so
# the two are completely separate. After this one-time setup, every
# `npm run build` is immediately live; just (re)start the dev shell to load it.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
# Isolated dev extensions dir (XDG_DATA_HOME=<root>/.dev/data). NOT the user's
# main extensions dir, so the main session never sees this widget.
target="$root/.dev/data/gnome-shell/extensions/$uuid"

if [[ ! -x "$root/node_modules/.bin/tsc" ]]; then
  (cd "$root" && npm install)
fi
"$root/build.sh"
glib-compile-schemas "$root/extension/schemas"

# Replace any previous copy-install with a symlink to the live build tree.
rm -rf "$target"
mkdir -p "$(dirname "$target")"
ln -sfn "$root/extension" "$target"

# Widget configuration lives in GSettings (the dev shell's isolated dconf
# profile); nothing to seed on disk.

printf 'Dev-installed %s (isolated from your main session)\n' "$uuid"
printf '  %s -> %s/extension (symlink)\n' "$target" "$root"
printf 'Iterate with ./dev-run.sh (nested GNOME Shell; no logout needed).\n'

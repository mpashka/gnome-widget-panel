#!/usr/bin/env bash
# @tag:dev
#
# Developer installation: symlink the built extension tree into the GNOME Shell
# extensions directory instead of copying it. After this one-time setup, every
# `npm run build` is immediately live; you only need to (re)start a GNOME Shell
# process to load the new code. Use ./dev-run.sh for that without logging out.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
target="$HOME/.local/share/gnome-shell/extensions/$uuid"
config_dir="$HOME/.config/gnome-widget-panel"

if [[ ! -x "$root/node_modules/.bin/tsc" ]]; then
  (cd "$root" && npm install)
fi
"$root/build.sh"
glib-compile-schemas "$root/extension/schemas"

# Replace any previous copy-install with a symlink to the live build tree.
rm -rf "$target"
mkdir -p "$(dirname "$target")"
ln -sfn "$root/extension" "$target"

mkdir -p "$config_dir"
if [[ ! -f "$config_dir/widgets.json" ]]; then
  cp "$root/extension/config/widgets.json" "$config_dir/widgets.json"
fi

printf 'Dev-installed %s\n' "$uuid"
printf '  %s -> %s/extension (symlink)\n' "$target" "$root"
printf 'Iterate with ./dev-run.sh (nested GNOME Shell; no logout needed).\n'

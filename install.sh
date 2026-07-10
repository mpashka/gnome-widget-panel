#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
target="$HOME/.local/share/gnome-shell/extensions/$uuid"

if [[ ! -x "$root/node_modules/.bin/tsc" ]]; then
  (cd "$root" && npm install)
fi
"$root/build.sh"

rm -rf "$target"
mkdir -p "$target"
cp -a "$root/extension/." "$target/"
glib-compile-schemas "$target/schemas"
# All configuration (widget list/options and panel settings) lives in GSettings
# (dconf); a legacy ~/.config/gnome-widget-panel/widgets.json is migrated into
# the `widgets` key automatically on first run. Nothing to seed here.
printf 'Installed %s\nLog out and log in before enabling it.\n' "$uuid"

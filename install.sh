#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
target="$HOME/.local/share/gnome-shell/extensions/$uuid"
config_dir="$HOME/.config/gnome-widget-panel"
rm -rf "$target"
mkdir -p "$target"
cp -a "$root/extension/." "$target/"
glib-compile-schemas "$target/schemas"
mkdir -p "$config_dir"
if [[ ! -f "$config_dir/widgets.json" ]]; then
  cp "$root/extension/config/widgets.json" "$config_dir/widgets.json"
fi
printf 'Installed %s\nLog out and log in before enabling it.\n' "$uuid"

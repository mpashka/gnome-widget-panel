#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
target="$HOME/.local/share/gnome-shell/extensions/$uuid"
config_dir="$HOME/.config/gnome-widget-panel"

if [[ ! -x "$root/node_modules/.bin/tsc" ]]; then
  (cd "$root" && npm install)
fi
"$root/build.sh"

rm -rf "$target"
mkdir -p "$target"
cp -a "$root/extension/." "$target/"
glib-compile-schemas "$target/schemas"
mkdir -p "$config_dir"
if [[ ! -f "$config_dir/widgets.json" ]]; then
  cp "$root/extension/config/widgets.json" "$config_dir/widgets.json"
elif ! grep -q '"id"[[:space:]]*:[[:space:]]*"ai-agent-usage"' "$config_dir/widgets.json"; then
  python3 - "$config_dir/widgets.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text())
plugins = data.setdefault("plugins", [])
item = {"id": "ai-agent-usage", "enabled": True}
insert_at = len(plugins)
for index, plugin in enumerate(plugins):
    if plugin.get("id") == "cpu-load-monitor":
        insert_at = index + 1
        break
plugins.insert(insert_at, item)
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY
fi
printf 'Installed %s\nLog out and log in before enabling it.\n' "$uuid"

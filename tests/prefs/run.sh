#!/usr/bin/env bash
# @tag:ui-testing
#
# Runs the widget-settings smoke test (widget-prefs-open.js): builds the
# extension, then opens and clicks through every widget's settings page.
#
#   tests/prefs/run.sh              # also: npm run test:prefs
#   SKIP_BUILD=1 tests/prefs/run.sh # reuse the existing extension/ build
#
# Needs a display: these are real GTK4/libadwaita widgets. Any session works
# (nothing is ever presented on screen); headless CI runs it under the UI
# suite's `gnome-shell --headless`.
#
# HOME is redirected to a throwaway directory on purpose. Clicking through the
# AI widgets' settings presses their "Configure" button, which installs Claude
# hook scripts into ~/.claude — the test must never touch the real one.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd -- "$here/../.." && pwd)"

command -v gjs >/dev/null || { echo "gjs not found." >&2; exit 1; }
if [[ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]]; then
    echo "no display: GTK cannot start. Run inside a session, or under" >&2
    echo "gnome-shell --headless as tests/ui/run.sh does." >&2
    exit 1
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    (cd "$root" && npm run --silent build)
fi

tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

mkdir -p "$tmp/home" "$tmp/state" "$tmp/data" "$tmp/cache"

# Filter GTK's "GtkDialog mapped without a transient parent" chatter: the test
# builds pages without a window on purpose, and the warning is not a result.
if env \
    HOME="$tmp/home" \
    XDG_STATE_HOME="$tmp/state" \
    XDG_DATA_HOME="$tmp/data" \
    XDG_CACHE_HOME="$tmp/cache" \
    GWP_PREFS_TEST_ROOT="$root" \
    gjs -m "$here/widget-prefs-open.js" 2>&1 | grep -vE "^Gtk-Message:"; then
    exit 0
else
    exit 1
fi

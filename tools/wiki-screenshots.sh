#!/usr/bin/env bash
# @tag:ui-testing
# Captures the wiki screenshots headlessly: the floating panel (expanded and
# collapsed) and the preferences window. Reuses the UI test harness (isolated
# headless GNOME Shell, own dconf profile), so nothing touches the user's
# session and no human has to click anything.
#
#   tools/wiki-screenshots.sh [OUT_DIR]
#
# Output goes to dist/wiki-screenshots (gitignored) unless OUT_DIR is given;
# copy what you need into the wiki repository.
#
# GWP_SHOT_SCALE multiplies every crop box, for the case where the session
# renders at a HiDPI scale. Mutter's headless backend ignores
# `org.gnome.desktop.interface scaling-factor`, so in practice the session is
# 1:1 and the default is 1. Set GWP_UI_MONITOR (e.g. 1500x1400) large enough for
# the whole settings window to fit — it is resized to the work area and captured
# in full.
set -euo pipefail

_shot_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SHOT_SCALE="${GWP_SHOT_SCALE:-1}"

# Give the session its own HOME. The preferences window checks
# ~/.local/share/gnome-shell/extensions for "Hide Top Bar" through
# GLib.get_home_dir(), not XDG_DATA_HOME, so with the real home it renders a
# machine-specific "Hide Top Bar is still installed" warning that has no place
# in a published screenshot.
if [[ -z "${GWP_UI_IN_SESSION:-}" ]]; then
    export HOME="$(mktemp -d)/home"
    mkdir -p "$HOME"
fi

# Interface scale and colour scheme must be set BEFORE the shell starts (mutter
# and GTK read them at startup), in the same throwaway dconf profile lib.sh
# exports — which now lives under the isolated HOME set above.
if [[ -z "${GWP_UI_IN_SESSION:-}" ]]; then
    _profile="$(mktemp -d)/dconf-profile"
    printf 'user-db:gwpuitest\n' > "$_profile"
    DCONF_PROFILE="$_profile" gsettings set org.gnome.desktop.interface \
        scaling-factor "$SHOT_SCALE"
    DCONF_PROFILE="$_profile" gsettings set org.gnome.desktop.interface \
        color-scheme "'prefer-dark'"
fi

source "$_shot_root/tests/ui/lib.sh"

OUT_DIR="${1:-$_shot_root/dist/wiki-screenshots}"

# A representative panel: applications menu, places, keyboard layout, app
# notifications, CPU graph, AI usage graph, clock and system status.
ui_start '{"schema":1,"plugins":[
  {"id":"gnome-menu","enabled":true},
  {"id":"favorites","enabled":true},
  {"id":"keyboard-layout","enabled":true},
  {"id":"app-notifications","enabled":true},
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"ai-agent-usage","enabled":true},
  {"id":"clock","enabled":true,"options":{"format":"<b>%H:%M</b>"}},
  {"id":"ubuntu-system-status","enabled":true}
]}'

mkdir -p "$OUT_DIR"
sleep 4

# crop FULL.PNG X Y W H PAD OUT.PNG — the geometry is in logical pixels, the PNG
# is in physical ones, so scale the box by SHOT_SCALE.
crop() {
    python3 - "$SHOT_SCALE" "$@" <<'PY'
import sys
from PIL import Image
scale = float(sys.argv[1])
src, x, y, w, h, pad, out = sys.argv[2:9]
x, y, w, h = (int(float(v) * scale) for v in (x, y, w, h))
pad = int(float(pad) * scale)
im = Image.open(src).convert('RGBA')
box = (max(0, x - pad), max(0, y - pad),
       min(im.width, x + w + pad), min(im.height, y + h + pad))
im.crop(box).save(out)
print(f"{out}: {box[2]-box[0]}x{box[3]-box[1]}")
PY
}

geom() { ui_eval "(a => [a.x, a.y, a.width, a.height].join(' '))(panel)" | tr -d '"'; }

# The graphs are empty in a fresh headless session (no CPU load, no agent
# traffic), which makes a dishonest screenshot of a *graph* widget. Fill their
# sample buffers — the same arrays their own samplers write — with a plausible
# curve, so the screenshot shows what the widget really looks like in use. This
# is injection only; the drawing code is the shipped one.
ui_eval '
const cpu = plugin("cpu-load-monitor");
const n = cpu._samples.length;
cpu._samples = Array.from({length: n}, (_, i) => {
    const wave = 0.35 + 0.3 * Math.sin(i / 3.1) + 0.22 * Math.sin(i / 1.3);
    const load = Math.max(0.04, Math.min(0.98, wave + (i > n - 12 ? 0.35 : 0)));
    return {load, temp: 45 + load * 38};
});
cpu._lastLoad = cpu._samples[n - 1].load;
cpu.queue_repaint();

const ai = plugin("ai-agent-usage");
const m = ai._samples.length;
ai._samples = Array.from({length: m}, (_, i) => {
    const phase = i / m;
    const busy = phase > 0.25;
    const provider = i > m * 0.62 ? "claude" : "codex";
    const tokens = busy ? Math.round(38000 + 92000 * Math.abs(Math.sin(i / 5.7))) : 0;
    return {
        tokens,
        context: busy ? Math.min(0.92, 0.2 + phase * 0.8) : 0,
        limit: busy ? Math.min(0.7, 0.05 + phase * 0.6) : 0,
        provider: busy ? provider : null,
    };
});
ai._maxTokens = Math.max(1, ...ai._samples.map(s => s.tokens));
ai.queue_repaint();
true' >/dev/null
sleep 1

# --- the panel, expanded and collapsed -------------------------------------
ui_screenshot "$OUT_DIR/full-panel.png" >/dev/null
crop "$OUT_DIR/full-panel.png" $(geom) 16 "$OUT_DIR/panel.png"

ui_set collapsed true
sleep 2
ui_screenshot "$OUT_DIR/full-collapsed.png" >/dev/null
crop "$OUT_DIR/full-collapsed.png" $(geom) 16 "$OUT_DIR/panel-collapsed.png"
ui_set collapsed false
sleep 1

# --- the preferences window ------------------------------------------------
WIN_RECT='(() => {
    const w = global.get_window_actors()
        .map(a => a.meta_window)
        .find(w => (w.get_title() || "").includes("Widget Panel"));
    if (!w) return "";
    const r = w.get_frame_rect();
    return [r.x, r.y, r.width, r.height].join(" ");
})()'

# Park the panel out of the window's way first — otherwise it floats over the
# top-left corner of the settings window in the capture.
ui_set aligned 10   # BOTTOM|RIGHT
sleep 2

gnome-extensions prefs "$GWP_UUID" >>"$GWP_UI_TMP/prefs.log" 2>&1 &
ui_wait_js "$WIN_RECT !== \"\"" 25 || fail "the preferences window never appeared"
sleep 3

# Grow the window to (almost) the virtual screen so the whole settings page —
# the widget list AND the panel/top-bar groups below it — fits in one capture
# instead of ending mid-row at the default window height.
ui_eval '
const w = global.get_window_actors()
    .map(a => a.meta_window)
    .find(w => (w.get_title() || "").includes("Widget Panel"));
const mon = w.get_work_area_current_monitor();
w.move_resize_frame(false, mon.x + 16, mon.y + 16, 700, mon.height - 32);
true' >/dev/null
sleep 3

ui_screenshot "$OUT_DIR/full-prefs.png" >/dev/null
crop "$OUT_DIR/full-prefs.png" $(ui_eval "$WIN_RECT" | tr -d '"') 0 \
    "$OUT_DIR/settings.png"

_ui_log "screenshots written to $OUT_DIR"

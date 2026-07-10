#!/usr/bin/env bash
# @tag:ui-testing
#
# FEATURE-DEBUG STUB — copy, hack, throw away. Not a regression test (the
# runner only picks up t-*.sh). Workflow:
#
#   cp tests/ui/feature-debug.stub.sh tests/ui/local-mydebug.sh   # gitignored
#   bash tests/ui/local-mydebug.sh
#
# It boots the same isolated headless shell the regression tests use and then
# runs whatever probes you leave in. Rebuild first when you changed sources:
# `npm run build` (or run via tests/ui/run.sh which builds). Useful knobs:
#   GWP_UI_KEEP=1     keep the artifacts dir (shell.log, screenshots)
#   GWP_UI_MONITOR=WxH   virtual monitor size
# For interactive/visual debugging use ./dev-run.sh instead (real window).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

# --- 1. Boot with the widget set you are debugging -------------------------
ui_start '{"schema":1,"plugins":[
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"clock","enabled":true},
  {"id":"gnome-action","enabled":true,"options":{"action":"overview"}}]}'

# --- 2. Introspect shell/panel state (JS runs inside the shell) ------------
# `find(actor, pred)`, `panel` and `plugin(id)` are pre-defined; the last
# expression is JSON-returned. A returned Promise is awaited.
ui_eval '({
    panel: {x: panel.x, y: panel.y, w: panel.width, h: panel.height,
            orientation: panel.orientation, style: String(panel.style)},
    widgets: panel.get_children().map(c => c._panelPluginId ?? "ctl"),
})'

# --- 3. Poke panel GSettings live (same bus + profile as the shell) --------
ui_set orientation right
ui_wait_js 'panel.orientation === 1'
ui_eval '({vertical_now: {w: panel.width, h: panel.height}})'
ui_set orientation horizontal

# --- 4. Click things with a virtual pointer --------------------------------
ui_click "plugin('gnome-action')"
ui_wait_js 'Main.overview.visible' && echo "overview opened"
ui_eval 'Main.overview.hide(); "hidden"'

# --- 5. Screenshot the stage (view the PNG to see what happened) -----------
GWP_UI_KEEP=1   # keep the artifacts dir so the screenshot survives
ui_screenshot "$GWP_UI_TMP/debug.png"
gjs -m "$(dirname -- "${BASH_SOURCE[0]}")/png-stats.js" "$GWP_UI_TMP/debug.png"
echo "screenshot: $GWP_UI_TMP/debug.png"

# --- 6. Tail the shell log for your extension's output ---------------------
grep -iE "widget-panel|JS ERROR" "$GWP_UI_TMP/shell.log" | tail -20 || true

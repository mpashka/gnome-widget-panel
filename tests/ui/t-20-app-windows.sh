#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-app-windows
# The app-windows widget against REAL client windows: three GTK windows of one
# application are opened in the headless session, and the widget must track that
# application, count its windows on the button, list their titles in a stable
# order with the focused one marked, activate the window whose row is clicked,
# and switch to switcher order (with its row limit) when told to.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

# gnome-action is the reference button: a plain icon button with no badge, which
# the app-windows button must not be wider than.
ui_start '{"schema":1,"plugins":[
  {"id":"app-windows","enabled":true,"options":{}},
  {"id":"gnome-action","enabled":true,"options":{"action":"overview"}}
]}'

CLIENT="$GWP_UI_ROOT/tests/ui/window-client.js"
# Spawned from INSIDE the shell so it inherits WAYLAND_DISPLAY and connects to
# the test compositor. The cairo renderer keeps GTK off GL, which the headless
# virtual monitor does not provide.
ui_eval "GLib.spawn_command_line_async(
    \"sh -c 'GDK_BACKEND=wayland GSK_RENDERER=cairo exec gjs -m $CLIENT Beta Gamma Alpha'\"
)" >/dev/null
# The client self-quits after two minutes, but a failing test must not leave a
# window behind for that long.
trap 'pkill -f "gjs -m .*window-client.js" 2>/dev/null || true' EXIT

ui_wait_js "plugin('app-windows')._app !== null" 30 \
    || fail "the widget never tracked an application"
ui_wait_js "plugin('app-windows')._app.get_windows().length === 3" 30 \
    || fail "the three client windows did not all reach the tracked app"
_ui_log "ok - the widget tracks the client application and its three windows"

assert_eq "$(ui_eval "plugin('app-windows')._countLabel.visible")" true \
    "window count shown on the button"
assert_eq "$(ui_eval "plugin('app-windows')._countLabel.text.trim()")" '"3"' \
    "button counts the three windows"
assert_contains "$(ui_eval "plugin('app-windows')._tooltipMarkup()")" '3 windows' \
    "tooltip names the window count"

# The count is a badge ON the icon: it must not make the button wider than the
# same button without a count (a vertical panel is as wide as its widest child).
assert_true "plugin('app-windows').width <= plugin('gnome-action').width" \
    "the count badge does not widen the button"

# --- The menu, in the default (title) order ---------------------------------
# Rows in JS: the window rows only, in the order the popup shows them.
ROWS="plugin('app-windows')._menu.box.get_children()
    .filter(i => i.get_children().some(c => ['Alpha','Beta','Gamma'].includes(c.text)))"
TITLE_OF="i => i.get_children().map(c => c.text).filter(t => t)[0]"

ui_click "plugin('app-windows')" >/dev/null
ui_wait_js "plugin('app-windows')._menu.isOpen" \
    || fail "clicking the button did not open the window menu"

# The client presents its windows as Beta, Gamma, Alpha; by title they must come
# out sorted, whatever the shell's own (most-recently-used) order is.
assert_eq "$(ui_eval "JSON.stringify(($ROWS).map($TITLE_OF))")" \
    '"[\"Alpha\",\"Beta\",\"Gamma\"]"' \
    "the default order is alphabetical, not the shell's window order"

# Every title starts at the same x: the focus mark must not push its own row's
# title to the right of the others (a ragged left edge in the menu).
assert_eq "$(ui_eval "new Set(($ROWS).map(
    i => Math.round(i.get_children().find(
        c => ['Alpha','Beta','Gamma'].includes(c.text)).get_transformed_position()[0])
)).size")" 1 "every window title starts at the same x"

# Exactly one row carries the mark, and it is the window that had focus — which
# in title order is NOT necessarily the first row, and is the whole reason the
# mark exists.
FOCUSED="$(ui_eval "plugin('app-windows')._focusWindow.get_title()" | tr -d '"')"
MARKED="plugin('app-windows')._menu.box.get_children()
    .filter(i => i.get_children().some(c => c.opacity === 255 && c.icon_name === 'media-record-symbolic'))"
assert_eq "$(ui_eval "($MARKED).length")" 1 "exactly one row is marked"
assert_eq "$(ui_eval "($MARKED).map($TITLE_OF)[0]")" "\"$FOCUSED\"" \
    "the mark is on the window that had focus ($FOCUSED)"

# --- Activating a row -------------------------------------------------------
# Click a row that is NOT the focused one and check the shell really focuses it.
TARGET_INDEX="$(ui_eval "($ROWS).findIndex(i => ($TITLE_OF)(i) !== '$FOCUSED')")"
TARGET="$(ui_eval "($ROWS).map($TITLE_OF)[$TARGET_INDEX]" | tr -d '"')"
[[ -n "$TARGET" ]] || fail "could not pick a row to activate"

ui_click "($ROWS)[$TARGET_INDEX]" >/dev/null
ui_wait_js "global.display.focus_window &&
    global.display.focus_window.get_title() === '$TARGET'" \
    || fail "clicking the '$TARGET' row did not focus that window"
_ui_log "ok - clicking a row activates its window ($TARGET)"

ui_wait_js "!plugin('app-windows')._menu.isOpen" \
    || fail "the menu stayed open after a row was activated"

# --- Switcher order, and the row limit --------------------------------------
ui_config_write '{"schema":1,"plugins":[
  {"id":"app-windows","enabled":true,"options":{"sort":"recent","maxWindows":2}},
  {"id":"gnome-action","enabled":true,"options":{"action":"overview"}}
]}'
ui_wait_js "plugin('app-windows') && plugin('app-windows')._options.sort === 'recent'" \
    || fail "the widget did not reload with the recent order"
ui_wait_js "plugin('app-windows')._app !== null" 30 \
    || fail "the reloaded widget never tracked an application"

ui_click "plugin('app-windows')" >/dev/null
ui_wait_js "plugin('app-windows')._menu.isOpen" || fail "the menu did not reopen"

LABELS="$(ui_eval "plugin('app-windows')._menu.box.get_children().flatMap(
    item => item.get_children().map(c => c.text).filter(t => t))")"
_ui_log "menu labels (recent, maxWindows=2): $LABELS"
assert_contains "$LABELS" '1 more not shown' \
    "maxWindows=2 lists two rows and announces the remainder"
assert_eq "$(ui_eval "($ROWS).length")" 2 "exactly maxWindows window rows"

# In switcher order the window that had focus is always the first row.
RECENT_FOCUSED="$(ui_eval "plugin('app-windows')._focusWindow.get_title()" | tr -d '"')"
assert_eq "$(ui_eval "($ROWS).map($TITLE_OF)[0]")" "\"$RECENT_FOCUSED\"" \
    "recent order starts with the window that had focus ($RECENT_FOCUSED)"

# --- No JS errors -----------------------------------------------------------
if grep -q "app-windows:" "$GWP_UI_TMP/shell.log"; then
    tail -n 20 "$GWP_UI_TMP/shell.log" >&2
    fail "the widget logged an error"
fi
_ui_log "ok - app-windows widget clean in the shell log"

#!/usr/bin/env bash
# @tag:widget-clock @tag:ui-testing
# The clock's format template accepts a small HTML-like subset (Pango markup)
# for bold/italic/colour. Two things must hold:
#   1. the markup is applied to the SIZE request too — measuring the plain text
#      while drawing bold/big markup clips the time;
#   2. invalid markup never costs the user their clock — the tags are dropped
#      and the time is still drawn.
# See extension-src/plugins/clock/clockMarkup.ts and dateButton.ts _applyText.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
# The templates below use a LITERAL time ("18:88", no % specifiers, passed
# through by strftime) rather than %H:%M: the measured width must be comparable
# across steps, and real digits change between two measurements a second apart.
ui_start '{"schema":1,"plugins":[{"id":"clock","enabled":true,"options":{"format":"18:88"}}]}'

CLOCK_W="plugin('clock')._dateLabel.width"

ui_wait_js "plugin('clock') !== null && $CLOCK_W > 0" \
    || fail "clock did not appear with a measured size"
plain_w="$(ui_eval "$CLOCK_W")"
_ui_log "ok - plain '18:88' measures ${plain_w}px"

# --- bold markup widens the measured size --------------------------------
ui_config_write '{"schema":1,"plugins":[
  {"id":"clock","enabled":true,"options":{"format":"<b>18:88</b>"}}]}'
ui_wait_js "plugin('clock') !== null && $CLOCK_W > $plain_w" 15 \
    || fail "bold markup did not widen the clock's size request (text would be clipped): plain=${plain_w}, bold=$(ui_eval "$CLOCK_W")"
bold_w="$(ui_eval "$CLOCK_W")"
_ui_log "ok - bold '<b>18:88</b>' measures ${bold_w}px > ${plain_w}px (markup reaches the size request)"

# --- colour markup is accepted -------------------------------------------
ui_config_write '{"schema":1,"plugins":[
  {"id":"clock","enabled":true,"options":{"format":"<span foreground=\"#ff8800\">18:88</span>"}}]}'
# Wait for the reloaded clock to be back at the plain metrics — waiting for
# "any size" would pass on the previous (bold) actor before the reload lands.
ui_wait_js "plugin('clock') !== null && $CLOCK_W == $plain_w" 15 \
    || fail "a coloured span changed the metrics or broke the clock: got $(ui_eval "$CLOCK_W"), want $plain_w"
_ui_log "ok - <span foreground> renders without disturbing layout"

# --- invalid markup falls back to the plain time -------------------------
# Unbalanced tag: Pango rejects it. The clock must keep working, showing the
# time with the tags stripped rather than an empty widget.
ui_config_write '{"schema":1,"plugins":[
  {"id":"clock","enabled":true,"options":{"format":"<b>18:88"}}]}'
ui_wait_js "plugin('clock') !== null && $CLOCK_W == $plain_w" 15 \
    || fail "invalid markup did not fall back to the plain time: got $(ui_eval "$CLOCK_W"), want $plain_w"
_ui_log "ok - invalid markup degrades to plain text instead of breaking the clock"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"

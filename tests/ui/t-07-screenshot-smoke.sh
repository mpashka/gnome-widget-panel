#!/usr/bin/env bash
# @tag:ui-testing
# Regression (smoke): the headless stage renders real content and can be
# captured to a PNG. Asserts the image is non-trivial (not a uniform fill).
# Deliberately NOT a golden-image comparison — see docs/ui-testing.md for why
# committed reference screenshots are avoided (theme/font brittleness).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

shot="$GWP_UI_TMP/stage.png"
ui_screenshot "$shot"
_ui_log "ok - screenshot written ($(stat -c %s "$shot") bytes)"

stats="$(gjs -m "$(dirname -- "${BASH_SOURCE[0]}")/png-stats.js" "$shot")"
_ui_log "stats: $stats"
stddev="$(printf '%s' "$stats" | sed -E 's/.*"stddev":([0-9.]+).*/\1/')"
awk -v s="$stddev" 'BEGIN {exit !(s > 2)}' \
    || fail "stage render looks uniform (stddev=$stddev) — nothing was drawn?"
_ui_log "ok - stage render is non-uniform (stddev=$stddev)"

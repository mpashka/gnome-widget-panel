#!/usr/bin/env bash
# @tag:ui-testing
#
# UI regression test runner: builds the extension, then runs every
# tests/ui/t-*.sh sequentially, each in its own throwaway headless GNOME Shell
# session (see lib.sh). Usage:
#
#   tests/ui/run.sh              # all tests (also: npm run test:ui)
#   tests/ui/run.sh t-02 t-05    # only tests whose filename matches a filter
#   SKIP_BUILD=1 tests/ui/run.sh # reuse the existing extension/ build
#
# Env knobs: GWP_UI_KEEP=1 keeps per-test artifacts, GWP_UI_MONITOR=WxH,
# GWP_UI_TEST_TIMEOUT (seconds per test, default 180).
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd -- "$here/../.." && pwd)"
timeout_s="${GWP_UI_TEST_TIMEOUT:-180}"

command -v gnome-shell >/dev/null || {
    echo "gnome-shell not found; UI tests need a GNOME host." >&2; exit 1; }
command -v dbus-run-session >/dev/null || {
    echo "dbus-run-session not found." >&2; exit 1; }

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    (cd "$root" && npm run --silent build)
fi

tests=()
for t in "$here"/t-*.sh; do
    [[ -f "$t" ]] || continue
    if (($# > 0)); then
        keep=0
        for f in "$@"; do [[ "$(basename "$t")" == *"$f"* ]] && keep=1; done
        ((keep)) || continue
    fi
    tests+=("$t")
done
((${#tests[@]})) || { echo "no tests matched" >&2; exit 1; }

pass=0; failed=()
for t in "${tests[@]}"; do
    name="$(basename "$t")"
    echo "=== $name ==="
    if timeout --kill-after=15 "$timeout_s" bash "$t"; then
        echo "--- PASS $name"
        ((pass += 1))
    else
        echo "--- FAIL $name"
        failed+=("$name")
    fi
done

echo
echo "UI tests: $pass/${#tests[@]} passed"
if ((${#failed[@]})); then
    printf 'failed: %s\n' "${failed[@]}"
    exit 1
fi

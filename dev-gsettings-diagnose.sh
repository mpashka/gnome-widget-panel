#!/usr/bin/env bash
# @tag:dev
#
# Diagnose whether panel-level GSettings changes reach the dev GNOME Shell
# profile used by ./dev-run.sh.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
schema="org.gnome.shell.extensions.floating-mini-panel"
devdir="$root/.dev"
profile="$devdir/dconf-profile"
sessionenv="$devdir/session-env"
schema_dir="$root/extension/schemas"
datahome="$devdir/data"

usage() {
    cat <<EOF
Usage: $0 <command>

Commands:
  snapshot    Print main-session and dev-profile panel settings.
  monitor     Monitor changes on the dev shell's DBus/dconf session.
  poke        Write temporary values on the dev shell's session, then restore.
  open-prefs  Open preferences with the dev shell's session environment.

Run ./dev-run.sh first so .dev/dconf-profile and the generated schema exist.
EOF
}

require_dev_env() {
    if [[ ! -f "$profile" ]]; then
        printf 'Missing %s. Run ./dev-run.sh first.\n' "$profile" >&2
        exit 1
    fi
    if [[ ! -d "$schema_dir" ]]; then
        printf 'Missing %s. Run npm run build or ./dev-run.sh first.\n' "$schema_dir" >&2
        exit 1
    fi
}

require_dev_session() {
    require_dev_env
    if [[ ! -f "$sessionenv" ]]; then
        printf 'Missing %s. Start ./dev-run.sh and keep it running.\n' "$sessionenv" >&2
        exit 1
    fi
}

load_dev_session() {
    require_dev_session
    # shellcheck disable=SC1090
    source "$sessionenv"
}

dev_gsettings() {
    DCONF_PROFILE="$profile" \
    GSETTINGS_SCHEMA_DIR="$schema_dir" \
    gsettings "$@"
}

dev_session_gsettings() {
    load_dev_session
    gsettings "$@"
}

main_gsettings() {
    GSETTINGS_SCHEMA_DIR="$schema_dir" gsettings "$@"
}

print_values() {
    local label="$1"
    shift
    printf '%s\n' "$label"
    "$@" get "$schema" orientation
    "$@" get "$schema" content-padding
}

snapshot() {
    require_dev_env
    print_values 'main session:' main_gsettings
    print_values 'dev profile:' dev_gsettings
}

monitor() {
    load_dev_session
    printf 'Monitoring dev shell session bus for %s. Press Ctrl+C to stop.\n' "$schema"
    dev_session_gsettings monitor "$schema"
}

poke() {
    load_dev_session
    local old_orientation old_padding new_orientation new_padding
    old_orientation="$(dev_session_gsettings get "$schema" orientation)"
    old_padding="$(dev_session_gsettings get "$schema" content-padding)"
    # Toggle orientation between horizontal and right; toggle padding.
    if [[ "$old_orientation" == "'horizontal'" ]]; then
        new_orientation=right
    else
        new_orientation=horizontal
    fi
    new_padding=$((old_padding == 7 ? 13 : 7))

    printf 'Old dev values: orientation=%s content-padding=%s\n' \
        "$old_orientation" "$old_padding"
    printf 'Writing dev values: orientation=%s content-padding=%s\n' \
        "$new_orientation" "$new_padding"
    dev_session_gsettings set "$schema" orientation "$new_orientation"
    dev_session_gsettings set "$schema" content-padding "$new_padding"

    printf 'Sleeping 3s so the dev shell can react...\n'
    sleep 3

    printf 'Restoring old dev values.\n'
    dev_session_gsettings set "$schema" orientation "$old_orientation"
    dev_session_gsettings set "$schema" content-padding "$old_padding"
}

open_prefs() {
    load_dev_session
    gnome-extensions prefs "$uuid"
}

cmd="${1:-}"
case "$cmd" in
    snapshot) snapshot ;;
    monitor) monitor ;;
    poke) poke ;;
    open-prefs) open_prefs ;;
    -h|--help|help|"") usage ;;
    *)
        usage >&2
        exit 2
        ;;
esac

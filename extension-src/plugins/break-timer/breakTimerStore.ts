// @ts-nocheck
// @tag:widget-break-timer
//
// Persistence of the break-timer counters. A daily limit that a shell restart
// wipes measures nothing, so the counters are written to
// $XDG_STATE_HOME/gnome-widget-panel/break-timer.json together with the boot id
// and the moment of the save; breakTimerState.ts decides what survives (see
// restoreElapsed). All I/O is async — EGO forbids blocking the Shell loop.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'make_directory_async', 'make_directory_finish');

const STATE_DIR_NAME = 'gnome-widget-panel';
const STATE_FILE_NAME = 'break-timer.json';
const BOOT_ID_PATH = '/proc/sys/kernel/random/boot_id';


export function stateFilePath() {
    return GLib.build_filenamev([
        GLib.get_user_state_dir(),
        STATE_DIR_NAME,
        STATE_FILE_NAME,
    ]);
}


/**
 * The kernel's boot id, which the daily counter uses as its day boundary: the
 * day starts when the machine is switched on. An unreadable boot id yields a
 * value that matches nothing, so the counter simply starts over — the
 * conservative direction.
 */
export async function readBootId() {
    try {
        const file = Gio.File.new_for_path(BOOT_ID_PATH);
        const [contents] = await file.load_contents_async(null);
        const bootId = new TextDecoder().decode(contents).trim();
        if (bootId.length > 0)
            return bootId;
    } catch (error) {
        // Not Linux, or /proc is not mounted: fall through.
    }
    return `unknown-${GLib.get_monotonic_time()}`;
}


export async function loadStoredState() {
    try {
        const file = Gio.File.new_for_path(stateFilePath());
        // Promisified load_contents_async resolves to [contents, etag].
        const [contents] = await file.load_contents_async(null);
        return JSON.parse(new TextDecoder().decode(contents));
    } catch (error) {
        // No store yet, or a damaged one: start from zero.
        return null;
    }
}


async function ensureStateDirectory(directory) {
    try {
        await directory.make_directory_async(GLib.PRIORITY_DEFAULT, null);
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw error;
    }
}


export async function saveStoredState(stored) {
    const file = Gio.File.new_for_path(stateFilePath());
    await ensureStateDirectory(file.get_parent());
    await file.replace_contents_bytes_async(
        GLib.Bytes.new(new TextEncoder().encode(JSON.stringify(stored))),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
    );
}

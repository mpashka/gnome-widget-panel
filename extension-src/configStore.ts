// @tag:mechanism
//
// Single owner of reading, validating and writing the widget configuration.
// The configuration lives in the `widgets` GSettings key (a JSON string with
// the same schema the former `widgets.json` used), so ALL settings — panel
// level and widget level — share one storage/update mechanism: GSettings/dconf.
// Both the panel host (`pluginManager.ts`) and the preferences UI (`prefs.ts`)
// go through here so there is never a second settings model. Live updates are
// delivered by the `changed::widgets` signal (see extension.ts).
//
// A legacy `~/.config/gnome-widget-panel/widgets.json` is migrated into the
// key once (then renamed), so pre-GSettings installs keep their configuration.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {type WidgetConfig} from './contracts.js';
import {
    defaultWidgetConfig,
    parseWidgetConfig,
    serializeWidgetConfig,
} from './widgetConfig.js';

// Async legacy-file read keeps the one-time migration off the Shell main loop
// (EGO forbids synchronous file I/O there).
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

export const WIDGETS_KEY = 'widgets';

const LEGACY_DIR_NAME = 'gnome-widget-panel';
const LEGACY_FILE_NAME = 'widgets.json';

/** Location of the pre-GSettings configuration file (migration source). */
export function legacyConfigPath(): string {
    return GLib.build_filenamev([
        GLib.get_user_config_dir(),
        LEGACY_DIR_NAME,
        LEGACY_FILE_NAME,
    ]);
}

async function readLegacyFile(): Promise<WidgetConfig | null> {
    const path = legacyConfigPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return null;
    try {
        const file = Gio.File.new_for_path(path);
        // Promisified load_contents_async resolves to [contents, etag] (the
        // Uint8Array and the etag string) — NO leading success boolean; it
        // throws on failure, handled by the surrounding try/catch.
        const [contents] = await file.load_contents_async(null);
        return parseWidgetConfig(new TextDecoder().decode(contents));
    } catch (error) {
        logError(error, `widget-panel: invalid legacy config at ${path}`);
        return null;
    }
}

/**
 * One-time async migration: if the `widgets` GSettings key is still empty and a
 * legacy `widgets.json` exists, import it into the key and rename the file so it
 * is visibly no longer the source of truth. Writing the key fires the panel's
 * `changed::widgets` handler, which reloads the widgets. Returns early (no I/O)
 * once the key is set. Both the shell and preferences process may race here; the
 * operations are idempotent (same parsed content, second rename fails silently).
 *
 * `loadWidgetConfig` no longer migrates so it can stay synchronous for the
 * enable()-time panel build; call this once (best-effort, not awaited) from
 * `extension.ts` enable().
 */
export async function migrateLegacyConfigIfNeeded(
    settings: Gio.Settings
): Promise<void> {
    // Already configured/migrated: nothing to do (and no file I/O).
    if (settings.get_string(WIDGETS_KEY))
        return;
    const config = await readLegacyFile();
    if (!config)
        return;
    try {
        settings.set_string(WIDGETS_KEY, serializeWidgetConfig(config));
        const from = legacyConfigPath();
        Gio.File.new_for_path(from).set_display_name(
            `${LEGACY_FILE_NAME}.imported-to-gsettings`,
            null
        );
        console.log('widget-panel: migrated widgets.json into GSettings');
    } catch (error) {
        logError(error, 'widget-panel: legacy config migration failed');
    }
}

/**
 * Read the effective configuration from the `widgets` GSettings key, degrading
 * gracefully so a broken or incompatible value can never crash the panel:
 * empty key → built-in default; invalid JSON → the built-in default. Errors are
 * logged, not thrown. Malformed individual widget entries are skipped by
 * `parseWidgetConfig`. Stays synchronous so the enable()-time panel build gets
 * its config immediately; the one-time legacy-file migration is handled
 * separately by `migrateLegacyConfigIfNeeded`.
 */
export function loadWidgetConfig(settings: Gio.Settings): WidgetConfig {
    const raw = settings.get_string(WIDGETS_KEY);
    if (!raw)
        return defaultWidgetConfig();
    try {
        return parseWidgetConfig(raw);
    } catch (error) {
        logError(error, 'widget-panel: invalid widgets key, using defaults');
        return defaultWidgetConfig();
    }
}

/** Persist the configuration to the `widgets` GSettings key. */
export function saveWidgetConfig(
    settings: Gio.Settings,
    config: WidgetConfig
): void {
    settings.set_string(WIDGETS_KEY, serializeWidgetConfig(config));
}

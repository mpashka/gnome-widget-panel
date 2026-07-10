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

function readLegacyFile(): WidgetConfig | null {
    const path = legacyConfigPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return null;
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (!ok)
            return null;
        return parseWidgetConfig(new TextDecoder().decode(contents));
    } catch (error) {
        logError(error, `widget-panel: invalid legacy config at ${path}`);
        return null;
    }
}

// One-time migration: import the legacy widgets.json into the GSettings key
// and rename the file so it is visibly no longer the source of truth. Both the
// shell and the preferences process may race here; the operations are
// idempotent (same parsed content, second rename fails silently).
function migrateLegacyConfig(settings: Gio.Settings): WidgetConfig | null {
    const config = readLegacyFile();
    if (!config)
        return null;
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
    return config;
}

/**
 * Read the effective configuration from the `widgets` GSettings key, degrading
 * gracefully so a broken or incompatible value can never crash the panel:
 * empty key → legacy-file migration → built-in default; invalid JSON → the
 * built-in default. Errors are logged, not thrown. Malformed individual widget
 * entries are skipped by `parseWidgetConfig`.
 */
export function loadWidgetConfig(settings: Gio.Settings): WidgetConfig {
    const raw = settings.get_string(WIDGETS_KEY);
    if (!raw)
        return migrateLegacyConfig(settings) ?? defaultWidgetConfig();
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

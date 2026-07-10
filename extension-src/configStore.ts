// @tag:mechanism
//
// Single owner of reading, validating and writing the widget configuration
// (`widgets.json`). The configuration file is the source of truth; both the
// panel host (`pluginManager.ts`) and the preferences UI (`prefs.ts`) go
// through here so there is never a second settings model.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {WIDGET_CONFIG_SCHEMA, type WidgetConfig} from './contracts.js';
import {parseWidgetConfig, serializeWidgetConfig} from './widgetConfig.js';

const CONFIG_DIR_NAME = 'gnome-widget-panel';
const CONFIG_FILE_NAME = 'widgets.json';

/**
 * User-owned, writable configuration path (source of truth once created).
 *
 * `GWP_CONFIG_FILE` overrides it: a dev/test-only hook so an isolated panel
 * instance can run against its own `widgets.json` without disturbing dconf —
 * used by `dev-run.sh` parallel mode (e.g. a different `ai-agent-usage` Claude
 * port) and by the UI test harness (`tests/ui/lib.sh`, `docs/ui-testing.md`).
 */
export function userConfigPath(): string {
    const override = GLib.getenv('GWP_CONFIG_FILE');
    if (override)
        return override;
    return GLib.build_filenamev([
        GLib.get_user_config_dir(),
        CONFIG_DIR_NAME,
        CONFIG_FILE_NAME,
    ]);
}

/** Bundled default shipped inside the extension, used until the user file exists. */
export function bundledConfigPath(extensionPath: string): string {
    return GLib.build_filenamev([extensionPath, 'config', CONFIG_FILE_NAME]);
}

function readConfigFile(path: string): WidgetConfig | null {
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return null;
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (!ok)
            return null;
        return parseWidgetConfig(new TextDecoder().decode(contents));
    } catch (error) {
        logError(error, `widget-panel: invalid widget config at ${path}`);
        return null;
    }
}

/**
 * Read the effective configuration, degrading gracefully so a broken or
 * incompatible config can never crash the panel: try the user file, then the
 * bundled default, then an empty config (a bare panel). Errors are logged, not
 * thrown. Malformed individual widget entries are skipped by `parseWidgetConfig`.
 */
export function loadWidgetConfig(extensionPath: string): WidgetConfig {
    return (
        readConfigFile(userConfigPath()) ??
        readConfigFile(bundledConfigPath(extensionPath)) ??
        {schema: WIDGET_CONFIG_SCHEMA, plugins: []}
    );
}

/** Persist the configuration to the user file, creating its directory. */
export function saveWidgetConfig(config: WidgetConfig): void {
    const path = userConfigPath();
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
    const bytes = new TextEncoder().encode(serializeWidgetConfig(config));
    const file = Gio.File.new_for_path(path);
    file.replace_contents(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
    );
}

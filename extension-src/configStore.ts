// @tag:mechanism
//
// Single owner of reading, validating and writing the widget configuration
// (`widgets.json`). The configuration file is the source of truth; both the
// panel host (`pluginManager.ts`) and the preferences UI (`prefs.ts`) go
// through here so there is never a second settings model.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {type WidgetConfig} from './contracts.js';
import {parseWidgetConfig, serializeWidgetConfig} from './widgetConfig.js';

const CONFIG_DIR_NAME = 'gnome-widget-panel';
const CONFIG_FILE_NAME = 'widgets.json';

/**
 * User-owned, writable configuration path (source of truth once created).
 *
 * `GWP_CONFIG_FILE` overrides it: a dev-only hook so a second panel instance
 * (see `dev-run.sh` parallel mode) can run against its own `widgets.json` — e.g.
 * a different `ai-agent-usage` Claude port — without disturbing dconf.
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

/** Read the effective configuration: the user file, else the bundled default. */
export function loadWidgetConfig(extensionPath: string): WidgetConfig {
    const userPath = userConfigPath();
    const path = GLib.file_test(userPath, GLib.FileTest.EXISTS)
        ? userPath
        : bundledConfigPath(extensionPath);
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok) throw new Error(`Cannot read widget configuration: ${path}`);
    return parseWidgetConfig(new TextDecoder().decode(contents));
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

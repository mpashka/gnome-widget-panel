// @tag:mechanism
//
// Single owner of reading, validating and writing the widget configuration
// (`widgets.json`). The configuration file is the source of truth; both the
// panel host (`pluginManager.ts`) and the preferences UI (`prefs.ts`) go
// through here so there is never a second settings model.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {
    WIDGET_CONFIG_SCHEMA,
    type PluginConfig,
    type WidgetConfig,
} from './contracts.js';

const CONFIG_DIR_NAME = 'gnome-widget-panel';
const CONFIG_FILE_NAME = 'widgets.json';

/** User-owned, writable configuration path (source of truth once created). */
export function userConfigPath(): string {
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

function parseWidgetConfig(raw: string): WidgetConfig {
    const data: unknown = JSON.parse(raw);
    if (
        !data ||
        typeof data !== 'object' ||
        (data as {schema?: unknown}).schema !== WIDGET_CONFIG_SCHEMA ||
        !Array.isArray((data as {plugins?: unknown}).plugins)
    )
        throw new Error('Unsupported widget configuration schema');

    const plugins: PluginConfig[] = (data as {plugins: unknown[]}).plugins.map(
        (entry) => {
            if (
                !entry ||
                typeof entry !== 'object' ||
                typeof (entry as {id?: unknown}).id !== 'string'
            )
                throw new Error('Invalid plugin entry in widget configuration');
            const item = entry as {
                id: string;
                enabled?: unknown;
                options?: unknown;
            };
            const config: PluginConfig = {
                id: item.id,
                enabled: item.enabled !== false,
            };
            if (item.options && typeof item.options === 'object')
                config.options = item.options as Record<string, unknown>;
            return config;
        }
    );

    return {schema: WIDGET_CONFIG_SCHEMA, plugins};
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
    const json = `${JSON.stringify(config, null, 2)}\n`;
    const bytes = new TextEncoder().encode(json);
    const file = Gio.File.new_for_path(path);
    file.replace_contents(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
    );
}

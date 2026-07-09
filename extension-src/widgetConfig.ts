// @tag:mechanism
//
// Pure parsing, validation and serialization of the widget configuration
// (`widgets.json`). Deliberately free of any `gi://` import so it can be unit
// tested in plain Node (see ../tests/) and reused in any process. File I/O lives
// in `configStore.ts`.

import {
    WIDGET_CONFIG_SCHEMA,
    type PluginConfig,
    type WidgetConfig,
} from './contracts.js';

/**
 * Parse and validate raw `widgets.json` text. Lenient by design so a bad or
 * partially-incompatible config never crashes the panel:
 * - throws only when the input is not JSON or the top-level schema is
 *   unsupported (the caller then falls back to a safe default);
 * - individual malformed plugin entries (not an object, or no string id) are
 *   skipped rather than aborting the whole config.
 */
export function parseWidgetConfig(raw: string): WidgetConfig {
    const data: unknown = JSON.parse(raw);
    if (
        !data ||
        typeof data !== 'object' ||
        (data as {schema?: unknown}).schema !== WIDGET_CONFIG_SCHEMA ||
        !Array.isArray((data as {plugins?: unknown}).plugins)
    )
        throw new Error('Unsupported widget configuration schema');

    const plugins: PluginConfig[] = [];
    for (const entry of (data as {plugins: unknown[]}).plugins) {
        if (
            !entry ||
            typeof entry !== 'object' ||
            typeof (entry as {id?: unknown}).id !== 'string'
        )
            continue; // skip a malformed entry rather than failing the config
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
        plugins.push(config);
    }

    return {schema: WIDGET_CONFIG_SCHEMA, plugins};
}

/** Serialize a configuration to its on-disk JSON representation (trailing LF). */
export function serializeWidgetConfig(config: WidgetConfig): string {
    return `${JSON.stringify(config, null, 2)}\n`;
}

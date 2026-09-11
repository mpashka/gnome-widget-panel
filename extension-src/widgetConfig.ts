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

// Sort object keys, recursively, so two values that differ only in the order
// their keys were written produce the same JSON text.
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort())
            sorted[key] = canonicalize(source[key]);
        return sorted;
    }
    return value;
}

/**
 * Signature of one configured widget instance: two entries produce the same
 * string exactly when they would produce the same widget. The panel uses it to
 * reuse the actors a configuration change did not touch, instead of rebuilding
 * every widget whenever one of them is edited.
 *
 * Key order is normalized on purpose: the preferences window rewrites the whole
 * `widgets` document on every edit, and a widget whose options came back with
 * their keys in another order has not changed.
 */
export function widgetInstanceKey(item: PluginConfig): string {
    return JSON.stringify([item.id, canonicalize(item.options ?? {})]);
}

/** Serialize a configuration to its on-disk JSON representation (trailing LF). */
export function serializeWidgetConfig(config: WidgetConfig): string {
    return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * The built-in default widget set, used when the `widgets` GSettings key is
 * empty (fresh install) and no legacy `widgets.json` exists to migrate.
 * Returns a fresh copy so callers may mutate it freely.
 */
export function defaultWidgetConfig(): WidgetConfig {
    return {
        schema: WIDGET_CONFIG_SCHEMA,
        plugins: [
            {id: 'gnome-action', enabled: true},
            {id: 'gnome-menu', enabled: true},
            {id: 'favorites', enabled: true},
            {id: 'keyboard-layout', enabled: true},
            {id: 'app-notifications', enabled: true},
            {id: 'cpu-load-monitor', enabled: true},
            {id: 'ai-agent-usage', enabled: true},
            {id: 'clock', enabled: true},
            {id: 'ubuntu-system-status', enabled: true},
            {id: 'printscreen', enabled: false},
        ],
    };
}

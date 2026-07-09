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

/** Parse and validate raw `widgets.json` text. Throws on invalid input. */
export function parseWidgetConfig(raw: string): WidgetConfig {
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

/** Serialize a configuration to its on-disk JSON representation (trailing LF). */
export function serializeWidgetConfig(config: WidgetConfig): string {
    return `${JSON.stringify(config, null, 2)}\n`;
}

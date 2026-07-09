// @tag:mechanism
//
// Stable, process-independent contracts shared by the panel host, the plugin
// registry and the preferences UI. Keep runtime-validating parsers (see
// `configStore.ts`) as the only place untrusted JSON becomes one of these
// types. See ../docs/preferences.md and ../docs/object-model.md.

/** Only schema version understood by this build of the widget configuration. */
export const WIDGET_CONFIG_SCHEMA = 1 as const;

/** One entry in the ordered widget configuration list. */
export interface PluginConfig {
    /** Registry id of the plugin, e.g. `ai-agent-usage`. */
    id: string;
    /** Disabled plugins stay in the list but are not instantiated. */
    enabled: boolean;
    /** Opaque per-widget options passed verbatim to `create`. */
    options?: Record<string, unknown>;
}

/** Parsed and validated `widgets.json`. Array order defines panel order. */
export interface WidgetConfig {
    schema: typeof WIDGET_CONFIG_SCHEMA;
    plugins: PluginConfig[];
}

/** Actor returned by a plugin; the host adds it to the panel and destroys it. */
export interface PluginActor {
    destroy(): void;
    _panelPluginId?: string;
}

/** Shell-process plugin module contract (`plugins/<id>/index.ts`). */
export interface PluginModule {
    create(parent: unknown, options: Record<string, unknown>): PluginActor;
}

/** Passed to a widget's preferences module when its settings UI is opened. */
export interface WidgetPreferencesContext {
    /** Adw dialog/window hosting this widget's preference pages. */
    window: unknown;
    /** Current per-widget options from `widgets.json` (never mutated in place). */
    options: Record<string, unknown>;
    /** Persist replacement options for this widget into `widgets.json`. */
    save(options: Record<string, unknown>): void;
}

/** Preferences-process module contract (`plugins/<id>/prefs.ts`). */
export interface PluginPreferencesModule {
    fillWidgetPreferences(context: WidgetPreferencesContext): void;
}

/**
 * One AI agent request (user prompt) surfaced by a provider. Drawn as a red
 * marker on the ai-agent-usage graph and listed in its tooltip. Providers may
 * include a `requests: AgentRequest[]` array on their normalized payload.
 */
export interface AgentRequest {
    /** ISO 8601 time the request was sent. */
    timestamp: string;
    /** Prompt text, whitespace-collapsed; may be truncated by the provider. */
    text: string;
}

/**
 * Process-independent metadata for one known plugin. Deliberately free of any
 * `gi://` or `resource://` imports so it loads in both the Shell and the
 * preferences process. Shell instantiation still goes through
 * `pluginManager.ts`; per-widget settings are loaded lazily via
 * `loadPreferences` only in the preferences process.
 */
export interface PluginDescriptor {
    id: string;
    label: string;
    description: string;
    /** Whether this widget exposes its own settings UI. */
    hasPreferences: boolean;
    /**
     * When true, the widget may appear more than once in the panel, each
     * instance with its own `options`. Such a widget stays available in the
     * "Add a widget" list even after it has already been added. Defaults to
     * false (single-instance).
     */
    multiInstance?: boolean;
    /**
     * Optional one-line summary of a configured instance's `options`, shown as
     * the row subtitle in the widget list (e.g. the selected Gnome Action). Pure
     * function, no `gi://` use. Falls back to `description` when absent.
     */
    summary?: (options: Record<string, unknown>) => string;
    /** Lazily import the widget's preferences module (Adw/Gtk). */
    loadPreferences?: () => Promise<PluginPreferencesModule>;
}

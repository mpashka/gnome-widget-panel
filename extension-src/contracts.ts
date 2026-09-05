// @tag:mechanism
//
// Stable, process-independent contracts shared by the panel host, the plugin
// registry and the preferences UI. Keep runtime-validating parsers (see
// `configStore.ts`) as the only place untrusted JSON becomes one of these
// types. See ../docs/implementation/preferences.md and ../docs/implementation/object-model.md.

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
    /**
     * Set by a widget that currently has nothing to show, so the panel leaves it
     * no space (UX: a warning is on screen only while there is something
     * to do about it). The panel — not the widget — owns `visible`, because
     * collapsing hides everything regardless; after changing this, call the
     * host's `updateWidgetVisibility()`.
     */
    selfHidden?: boolean;
}

/**
 * What a widget may call on the `parent` handed to `create`. The panel is a
 * large object; this is the part of it plugins are allowed to know about.
 */
export interface PluginHost {
    /** Re-resolve which widgets are on screen and take up the new panel size. */
    updateWidgetVisibility(): void;
    /**
     * The AI activity collector, or null when this build has none. It belongs to
     * the extension, not to any widget: it runs while the `ai-collector` setting
     * is on, whether or not an AI widget is in the panel. The AI widgets are
     * views of it — see `aiCollector.ts`.
     */
    aiCollector: AiCollector | null;
}

/**
 * One AI agent session as the collector knows it — raw event truth, with no
 * expiry or staleness policy applied. Deciding when a session stops counting as
 * open is the viewer's business (see the ai-agent-status widget), because that
 * is a display choice the user configures.
 */
export interface AgentSession {
    /** Provider's session id, unique per conversation. */
    id: string;
    /** Working directory the session was started in, when the agent reports it. */
    cwd: string | null;
    /** Display name: the working directory's basename, else a short id. */
    label: string;
    /** Which agent this session belongs to (`claude`, …). */
    provider: string;
    /** State the last event put it in: `thinking`, `waiting` or `idle`. */
    state: AgentSessionState;
    /** Unix seconds of the last event seen for this session. */
    lastEvent: number;
    /** Unix seconds at which `state` last changed. */
    lastChange: number;
}

/**
 * `thinking` — the agent is generating; `waiting` — it is asking the user
 * something; `idle` — it finished and is ready for the next prompt.
 */
export type AgentSessionState = 'thinking' | 'waiting' | 'idle';

/** One prompt the user sent, as the collector recorded it. */
export interface AgentRequestRecord {
    /** Unix seconds the prompt was sent. */
    ts: number;
    /** Prompt text, whitespace-collapsed. */
    text: string;
    /** Which agent it was sent to. */
    provider: string;
}

/**
 * The collector's surface, as the AI widgets use it. Everything it exposes is
 * read-only from a widget's point of view: a widget renders what is there and
 * re-renders when `addListener`'s callback fires.
 */
export interface AiCollector {
    /** Whether collection is switched on and running right now. */
    readonly running: boolean;
    /** Latest normalized payload per provider, keyed by provider name. */
    readonly providers: Map<string, Record<string, unknown>>;
    /** Prompts seen recently, oldest first. */
    readonly requests: AgentRequestRecord[];
    /** Open sessions, keyed by session id. */
    readonly sessions: Map<string, AgentSession>;
    /** Call `listener` whenever any of the above changes; returns a token. */
    addListener(listener: () => void): number;
    /** Stop calling the listener registered under `token`. */
    removeListener(token: number): void;
}

/** Shell-process plugin module contract (`plugins/<id>/index.ts`). */
export interface PluginModule {
    create(parent: unknown, options: Record<string, unknown>): PluginActor;
}

/**
 * The preferences host a widget's settings module talks to. It is a shim over
 * the real `Adw.PreferencesWindow` (see `prefs.ts` `_openWidgetPreferences`),
 * so these three methods are the whole surface a widget may rely on. Names
 * follow the Adw ones the shim forwards to.
 */
export interface WidgetPreferencesHost {
    /** Show this widget's own `Adw.PreferencesPage`. */
    add(page: unknown): void;
    /** Open a sub-section as an in-window subpage (an `Adw.NavigationPage`). */
    push_subpage(page: unknown): void;
    /** Return from a subpage this widget pushed. */
    pop_subpage(): void;
}

/** Passed to a widget's preferences module when its settings UI is opened. */
export interface WidgetPreferencesContext {
    /** Adw window (shim) hosting this widget's preference pages. */
    window: WidgetPreferencesHost;
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
     * When true, the widget is a tool for developing the extension itself, not
     * a feature of the panel: it is listed apart in "Add a widget" and never
     * appears in the default configuration. Defaults to false.
     */
    devOnly?: boolean;
    /**
     * Optional one-line summary of a configured instance's `options`, shown as
     * the row subtitle in the widget list (e.g. the selected Gnome Action). Pure
     * function, no `gi://` use. Falls back to `description` when absent.
     */
    summary?: (options: Record<string, unknown>) => string;
    /** Lazily import the widget's preferences module (Adw/Gtk). */
    loadPreferences?: () => Promise<PluginPreferencesModule>;
}

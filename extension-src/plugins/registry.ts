// @tag:mechanism
//
// Process-independent metadata for every known built-in widget: its label,
// description, whether it has a settings UI and how to lazily load that UI.
// This file must not statically import any `gi://` or `resource://` module so
// it can be loaded from the preferences process. Shell instantiation still uses
// the static registry in `pluginManager.ts`.

import type {PluginDescriptor, PluginPreferencesModule} from '../contracts.js';

// Human labels for the Gnome Action `action` option (mirrors gnome-action/prefs
// so the widget list can show the selected action). Kept here (gi-free) so the
// registry has no dependency on the Adw/Gtk prefs module.
const GNOME_ACTION_LABELS: Record<string, string> = {
    overview: 'Windows overview',
    apps: 'All applications',
    'show-desktop': 'Show desktop (minimize all)',
};

export const PLUGIN_DESCRIPTORS: PluginDescriptor[] = [
    {
        id: 'keyboard-layout',
        label: 'Keyboard layout',
        description: 'GNOME keyboard layout indicator.',
        hasPreferences: false,
    },
    {
        id: 'app-notifications',
        label: 'App notifications',
        description: 'Application AppIndicator/tray notification icons.',
        hasPreferences: false,
    },
    {
        id: 'cpu-load-monitor',
        label: 'CPU load monitor',
        description: 'Compact CPU load graph with temperature-aware color.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./cpu-load-monitor/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'ai-agent-usage',
        label: 'AI agent usage',
        description: 'Codex/Claude Code token usage graph and indicators.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./ai-agent-usage/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'ai-agent-status',
        label: 'AI agent status',
        description: 'Per-session Claude status dots: waiting for you, busy, idle.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./ai-agent-status/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'clock',
        label: 'Clock',
        description: 'GNOME clock/date button and calendar menu.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./clock/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'ubuntu-system-status',
        label: 'Ubuntu system status',
        description: 'Wi-Fi, sound, battery and related quick settings.',
        hasPreferences: false,
    },
    {
        id: 'gnome-menu',
        label: 'Applications menu',
        description: 'Button that opens the GNOME application grid.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./gnome-menu/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'gnome-action',
        label: 'Gnome Action',
        description:
            'Runs a GNOME shell action (overview, app grid, show desktop).',
        hasPreferences: true,
        multiInstance: true,
        summary: (options) => {
            const action = typeof options?.action === 'string'
                ? options.action
                : 'overview';
            return GNOME_ACTION_LABELS[action] ?? action;
        },
        loadPreferences: () =>
            import('./gnome-action/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'favorites',
        label: 'Places',
        description:
            'Button with a Places menu: Home, XDG user directories and GTK '
            + 'bookmarks, each opening in the default file manager.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./favorites/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'printscreen',
        label: 'Screenshot',
        description: 'Button that opens the GNOME interactive screenshot UI.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./printscreen/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'launch',
        label: 'Launch',
        description: 'Launch an application/command.',
        hasPreferences: true,
        multiInstance: true,
        loadPreferences: () =>
            import('./launch/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'caffeine',
        label: 'Caffeine',
        description:
            'Keep the screen awake (inhibit screensaver/suspend), e.g. during '
            + 'calls.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./caffeine/prefs.js') as Promise<PluginPreferencesModule>,
    },
    {
        id: 'break-timer',
        label: 'Break timer',
        description: 'Workrave-style rest reminders: micro/rest/daily activity '
            + 'timers with progress bars.',
        hasPreferences: true,
        loadPreferences: () =>
            import('./break-timer/prefs.js') as Promise<PluginPreferencesModule>,
    },
];

export const DESCRIPTORS_BY_ID: Map<string, PluginDescriptor> = new Map(
    PLUGIN_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor])
);

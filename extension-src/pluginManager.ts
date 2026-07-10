// @ts-nocheck
// @tag:mechanism
import {loadWidgetConfig} from './configStore.js';

import * as GnomeAction from './plugins/gnome-action/index.js';
import * as AiAgentUsage from './plugins/ai-agent-usage/index.js';
import * as AppNotifications from './plugins/app-notifications/index.js';
import * as Clock from './plugins/clock/index.js';
import * as CpuLoadMonitor from './plugins/cpu-load-monitor/index.js';
import * as Favorites from './plugins/favorites/index.js';
import * as GnomeMenu from './plugins/gnome-menu/index.js';
import * as KeyboardLayout from './plugins/keyboard-layout/index.js';
import * as Launch from './plugins/launch/index.js';
import * as PrintScreen from './plugins/printscreen/index.js';
import * as UbuntuSystemStatus from './plugins/ubuntu-system-status/index.js';

const REGISTRY = new Map([
    ['keyboard-layout', KeyboardLayout],
    ['app-notifications', AppNotifications],
    ['cpu-load-monitor', CpuLoadMonitor],
    ['ai-agent-usage', AiAgentUsage],
    ['clock', Clock],
    ['ubuntu-system-status', UbuntuSystemStatus],
    ['gnome-menu', GnomeMenu],
    ['gnome-action', GnomeAction],
    // Backward-compat alias: the widget was formerly `activities`.
    ['activities', GnomeAction],
    ['favorites', Favorites],
    ['printscreen', PrintScreen],
    ['launch', Launch],
]);

// Build the enabled plugin actors in config order. Returns an ARRAY of
// `{id, actor}` rather than a Map keyed by id, so the same widget id may appear
// more than once (multi-instance widgets).
//
// Robust by design: an unknown widget id or a widget whose `create` throws is
// skipped (and logged) rather than aborting the whole panel, so an incompatible
// or partially-broken config can never disable the extension.
//
// `settings` is the panel's Gio.Settings; the configuration lives in its
// `widgets` key (see configStore.ts). `extensionPath` is still passed to
// widgets that need bundled assets/helpers (e.g. ai-agent-usage).
export function createConfiguredPlugins(parent, extensionPath, settings) {
    const config = loadWidgetConfig(settings);

    const instances = [];
    for (const item of config.plugins) {
        if (!item.enabled)
            continue;
        const plugin = REGISTRY.get(item.id);
        if (!plugin) {
            log(`widget-panel: skipping unknown widget id "${item.id}"`);
            continue;
        }
        try {
            const actor = plugin.create(parent, item.options ?? {});
            actor._panelPluginId = item.id;
            instances.push({id: item.id, actor});
        } catch (error) {
            logError(error, `widget-panel: widget "${item.id}" failed to load; skipping`);
        }
    }
    return instances;
}

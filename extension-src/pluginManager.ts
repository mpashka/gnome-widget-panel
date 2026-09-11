// @ts-nocheck
// @tag:mechanism
import {loadWidgetConfig} from './configStore.js';
import {widgetInstanceKey} from './widgetConfig.js';

import * as GnomeAction from './plugins/gnome-action/index.js';
import * as AiAgentStatus from './plugins/ai-agent-status/index.js';
import * as AiAgentUsage from './plugins/ai-agent-usage/index.js';
import * as AppNotifications from './plugins/app-notifications/index.js';
import * as AppWindows from './plugins/app-windows/index.js';
import * as BreakTimer from './plugins/break-timer/index.js';
import * as Caffeine from './plugins/caffeine/index.js';
import * as Clock from './plugins/clock/index.js';
import * as CpuLoadMonitor from './plugins/cpu-load-monitor/index.js';
import * as Favorites from './plugins/favorites/index.js';
import * as GnomeMenu from './plugins/gnome-menu/index.js';
import * as KeyboardLayout from './plugins/keyboard-layout/index.js';
import * as Launch from './plugins/launch/index.js';
import * as PrintScreen from './plugins/printscreen/index.js';
import * as UbuntuSystemStatus from './plugins/ubuntu-system-status/index.js';
import * as VersionStatus from './plugins/version-status/index.js';

const REGISTRY = new Map([
    ['keyboard-layout', KeyboardLayout],
    ['app-notifications', AppNotifications],
    ['cpu-load-monitor', CpuLoadMonitor],
    ['ai-agent-usage', AiAgentUsage],
    ['ai-agent-status', AiAgentStatus],
    ['clock', Clock],
    ['ubuntu-system-status', UbuntuSystemStatus],
    ['gnome-menu', GnomeMenu],
    ['gnome-action', GnomeAction],
    // Backward-compat alias: the widget was formerly `activities`.
    ['activities', GnomeAction],
    ['favorites', Favorites],
    ['printscreen', PrintScreen],
    ['launch', Launch],
    ['caffeine', Caffeine],
    ['break-timer', BreakTimer],
    ['app-windows', AppWindows],
    ['version-status', VersionStatus],
]);

// Build the enabled plugin actors in config order. Returns an ARRAY of
// `{id, key, actor}` rather than a Map keyed by id, so the same widget id may
// appear more than once (multi-instance widgets); `key` is the signature of the
// configuration entry the actor was built from (see widgetConfig.ts).
//
// `settings` is the panel's Gio.Settings; the configuration lives in its
// `widgets` key (see configStore.ts). `extensionPath` is still passed to
// widgets that need bundled assets/helpers (e.g. ai-agent-usage).
export function createConfiguredPlugins(parent, extensionPath, settings) {
    return updateConfiguredPlugins(parent, extensionPath, settings, []);
}


// Bring the built plugin actors in line with the configuration, **keeping the
// instances the change did not touch**. `existing` is what the panel currently
// holds (the array a previous call returned); actors whose configuration entry
// still appears — same id, same options — are handed back untouched, and only
// the rest are destroyed and rebuilt.
//
// Why reuse at all: every edit in the preferences window rewrites the whole
// `widgets` key, so a full rebuild restarted *every* widget whenever *one* was
// edited. Their accumulated state went with them — counters, graph history, a
// bound port — and the panel visibly settled again over the following seconds
// while its neighbours re-measured themselves. Reuse makes an edit local to the
// widget being edited.
//
// Two guarantees the panel relies on:
//  - nothing is destroyed before the configuration has been read and matched, so
//    a caller that catches an exception from here still owns every actor it
//    passed in;
//  - actors that are NOT reused are destroyed BEFORE the replacements are built,
//    which is what lets a fixed-port widget (ai-agent-usage / ai-agent-status)
//    rebind the port its predecessor held.
//
// Robust by design: an unknown widget id or a widget whose `create` throws is
// skipped (and logged) rather than aborting the whole panel, so an incompatible
// or partially-broken config can never disable the extension.
export function updateConfiguredPlugins(parent, extensionPath, settings, existing = []) {
    const config = loadWidgetConfig(settings);
    const wanted = config.plugins
        .filter(item => item.enabled)
        .map(item => ({item, key: widgetInstanceKey(item), reuse: null}));

    // Instances offered for reuse, bucketed by signature: a multi-instance
    // widget configured twice with identical options has two interchangeable
    // actors, and each is claimed once.
    const offered = new Map();
    for (const instance of existing) {
        const bucket = offered.get(instance.key);
        if (bucket)
            bucket.push(instance);
        else
            offered.set(instance.key, [instance]);
    }
    for (const entry of wanted) {
        const bucket = offered.get(entry.key);
        if (bucket && bucket.length > 0)
            entry.reuse = bucket.shift();
    }

    // Everything nobody claimed is gone for good — before anything new is built.
    for (const bucket of offered.values()) {
        for (const instance of bucket)
            instance.actor.destroy();
    }

    const instances = [];
    for (const entry of wanted) {
        if (entry.reuse) {
            instances.push(entry.reuse);
            continue;
        }
        const {item, key} = entry;
        const plugin = REGISTRY.get(item.id);
        if (!plugin) {
            log(`widget-panel: skipping unknown widget id "${item.id}"`);
            continue;
        }
        try {
            const actor = plugin.create(parent, item.options ?? {});
            actor._panelPluginId = item.id;
            instances.push({id: item.id, key, actor});
        } catch (error) {
            logError(error, `widget-panel: widget "${item.id}" failed to load; skipping`);
        }
    }
    return instances;
}

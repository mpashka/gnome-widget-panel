import GLib from 'gi://GLib';

import * as AppNotifications from './plugins/app-notifications.js';
import * as Clock from './plugins/clock.js';
import * as CpuLoadMonitor from './plugins/cpu-load-monitor.js';
import * as KeyboardLayout from './plugins/keyboard-layout.js';
import * as UbuntuSystemStatus from './plugins/ubuntu-system-status.js';

const REGISTRY = new Map([
    ['keyboard-layout', KeyboardLayout],
    ['app-notifications', AppNotifications],
    ['cpu-load-monitor', CpuLoadMonitor],
    ['clock', Clock],
    ['ubuntu-system-status', UbuntuSystemStatus],
]);

function readConfig(extensionPath) {
    const userPath = GLib.build_filenamev([
        GLib.get_user_config_dir(),
        'gnome-widget-panel',
        'widgets.json',
    ]);
    const bundledPath = GLib.build_filenamev([
        extensionPath,
        'config',
        'widgets.json',
    ]);
    const path = GLib.file_test(userPath, GLib.FileTest.EXISTS)
        ? userPath
        : bundledPath;
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error(`Cannot read widget configuration: ${path}`);
    return JSON.parse(new TextDecoder().decode(contents));
}

export function createConfiguredPlugins(parent, extensionPath) {
    const config = readConfig(extensionPath);
    if (config.schema !== 1 || !Array.isArray(config.plugins))
        throw new Error('Unsupported widget configuration schema');

    const instances = new Map();
    for (const item of config.plugins) {
        if (!item.enabled)
            continue;
        const plugin = REGISTRY.get(item.id);
        if (!plugin)
            throw new Error(`Unknown panel plugin: ${item.id}`);
        const actor = plugin.create(parent, item.options ?? {});
        actor._panelPluginId = item.id;
        instances.set(item.id, actor);
    }
    return instances;
}

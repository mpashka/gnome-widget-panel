// @ts-nocheck
// @tag:ai-collector @tag:ui
//
// The "AI collector" preferences group: whether the panel watches what the AI
// coding agents on this machine are doing, and which of them.
//
// It is a panel-level setting rather than a widget option because collection is
// not a widget's job. The AI widgets are views of the collector — removing one
// must not stop collection, and a widget with nothing behind it must say so
// rather than show an empty result that looks exactly like a quiet day. See
// ../docs/implementation/ai-collector.md.
//
// A module of its own, and not a method on the preferences class, for one
// practical reason: `prefs.ts` cannot be imported outside the preferences
// process (it extends `ExtensionPreferences`, a Shell resource), so anything
// living there is unreachable from the settings smoke test. A page that throws
// here would take the *whole* settings window down, not just one widget's page,
// which makes it the last thing that should be untested. See
// ../tests/prefs/index.md.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {isClaudeInstalled} from './plugins/ai-agent-usage/claudeHook.js';

// Each agent, the setting that collects from it, and how to tell whether it is
// on this machine at all.
const PROVIDERS = [
    {
        key: 'ai-collector-claude',
        title: 'Claude Code',
        subtitle: 'Status line and lifecycle hooks in ~/.claude',
        installed: () => isClaudeInstalled(),
    },
    {
        key: 'ai-collector-codex',
        title: 'Codex',
        subtitle: 'Reads ~/.codex/sessions via a helper process',
        installed: () => dirExists(['.codex', 'sessions']),
    },
    {
        key: 'ai-collector-gemini',
        title: 'Gemini CLI',
        subtitle: 'Reads ~/.gemini/tmp via a helper process',
        installed: () => dirExists(['.gemini', 'tmp']),
    },
];


// Is `~/<parts>` a directory? A cheap stat in the preferences process, not file
// I/O on the Shell thread.
function dirExists(parts) {
    return GLib.file_test(
        GLib.build_filenamev([GLib.get_home_dir(), ...parts]),
        GLib.FileTest.IS_DIR
    );
}


/**
 * Add the group to `page`, editing `settings` (the panel's `Gio.Settings`)
 * directly — the running collector reacts to every one of these keys.
 */
export function addAiCollectorGroup(page, settings) {
    const group = new Adw.PreferencesGroup({
        title: 'AI collector',
        description:
            'Watch what the AI coding agents on this machine are doing. This runs '
            + 'independently of the panel: removing the AI widgets does not stop '
            + 'it, and switching it off makes them say so rather than show an '
            + 'empty graph.',
    });
    page.add(group);

    const enabled = new Adw.SwitchRow({
        title: 'Collect AI agent activity',
        subtitle: 'Claude Code hooks and the Codex / Gemini helper processes',
        active: settings.get_boolean('ai-collector'),
    });
    enabled.connect('notify::active', () =>
        settings.set_boolean('ai-collector', enabled.active)
    );
    group.add(enabled);

    // The per-agent rows and the port only mean anything while collecting, so
    // they follow the master switch instead of sitting there inert.
    const dependants = [];
    for (const provider of PROVIDERS) {
        const found = provider.installed();
        const row = new Adw.SwitchRow({
            title: provider.title,
            // An agent that is not installed says so: a switch the user turns on
            // to no effect is worse than one that explains itself.
            subtitle: found
                ? provider.subtitle
                : `${provider.subtitle} — not found on this system`,
            active: settings.get_boolean(provider.key),
        });
        row.connect('notify::active', () =>
            settings.set_boolean(provider.key, row.active)
        );
        dependants.push({row, requires: found});
        group.add(row);
    }

    const port = new Adw.SpinRow({
        title: 'Hook port',
        subtitle: 'Localhost-only port Claude Code posts to',
        adjustment: new Gtk.Adjustment({
            lower: 1024,
            upper: 65535,
            step_increment: 1,
            page_increment: 100,
            value: settings.get_int('ai-collector-port'),
        }),
    });
    port.connect('notify::value', () =>
        settings.set_int('ai-collector-port', port.value)
    );
    dependants.push({row: port, requires: true});
    group.add(port);

    const syncSensitivity = () => {
        const on = settings.get_boolean('ai-collector');
        for (const {row, requires} of dependants)
            row.sensitive = on && requires;
    };
    syncSensitivity();
    // The key can also change from outside (gsettings, a second window), and the
    // switch must not then disagree with what is collecting.
    const changedId = settings.connect('changed::ai-collector', () => {
        enabled.active = settings.get_boolean('ai-collector');
        syncSensitivity();
    });
    group.connect('destroy', () => settings.disconnect(changedId));

    return group;
}

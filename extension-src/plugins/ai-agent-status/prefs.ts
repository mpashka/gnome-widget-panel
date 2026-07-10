// @ts-nocheck
// @tag:widget-ai-agent-status
//
// Per-widget settings UI for the ai-agent-status widget. Loaded lazily by the
// panel preferences UI (see ../../prefs.ts) only when the user opens this
// widget's settings. It edits the same `options` object stored per widget in
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import * as ClaudeHook from '../ai-agent-usage/claudeHook.js';
import {colorButton} from '../../prefsColor.js';
import {addTemplateEditor} from '../../prefsTemplate.js';

const DEFAULT_PORT = 17871;
// Keep in sync with aiAgentStatus.ts DEFAULT_TOOLTIP_TEMPLATE / DEFAULT_COLORS.
const DEFAULT_TOOLTIP_TEMPLATE = '{counts}\n{sessions}';
const DEFAULT_COLORS = {
    needsInputColor: '#f03333',
    readyColor: '#3dc752',
    busyColor: '#4ca6ff',
    idleColor: '#777777',
};
// Representative coloured fragments for the live template preview.
const SAMPLE_FRAGMENTS = {
    counts: '<span foreground="#f03333">1 waiting</span> · 2 busy · 1 idle',
    sessions: '<tt><span foreground="#3dc752">●</span> my-project    ready        0:42\n'
        + '<span foreground="#4ca6ff">●</span> panel-widget  busy         3:07\n'
        + '<span foreground="#4ca6ff">●</span> experiments   busy        12:55\n'
        + '<span foreground="#777777">●</span> notes         idle        48:10</tt>',
};

function statusImage() {
    return new Gtk.Image({valign: Gtk.Align.CENTER});
}

function setStatus(image, state) {
    for (const css of ['success', 'error', 'dim-label'])
        image.remove_css_class(css);
    if (state === 'ok') {
        image.icon_name = 'emblem-ok-symbolic';
        image.add_css_class('success');
        image.tooltip_text = 'Configured';
    } else if (state === 'unconfigured') {
        image.icon_name = 'dialog-warning-symbolic';
        image.add_css_class('error');
        image.tooltip_text = 'Not configured — press Configure';
    } else {
        image.icon_name = 'action-unavailable-symbolic';
        image.add_css_class('dim-label');
        image.tooltip_text = 'Not found on this system';
    }
}

function spinRow(group, current, key, config, commit) {
    const row = new Adw.SpinRow({
        title: config.title,
        subtitle: config.subtitle,
        adjustment: new Gtk.Adjustment({
            lower: config.lower,
            upper: config.upper,
            step_increment: config.step ?? 1,
            page_increment: config.page ?? 10,
            value: Number(current[key]) || config.value,
        }),
    });
    row.connect('notify::value', () => {
        current[key] = row.value;
        commit();
    });
    group.add(row);
    return row;
}

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'AI agent status',
        icon_name: 'user-available-symbolic',
    });
    window.add(page);

    // --- Providers ----------------------------------------------------------
    const providers = new Adw.PreferencesGroup({
        title: 'Providers',
        description: 'The widget listens for Claude Code lifecycle hooks. The '
            + 'status dot is green when the hooks are configured, red when not, '
            + 'grey when Claude Code is not found on this system.',
    });
    page.add(providers);

    const claudeRow = new Adw.ActionRow({
        title: 'Claude Code hooks',
        subtitle: 'UserPromptSubmit / Stop / Notification / SessionEnd events',
    });
    const claudeStatus = statusImage();
    claudeRow.add_prefix(claudeStatus);
    const configure = new Gtk.Button({
        label: 'Configure',
        valign: Gtk.Align.CENTER,
    });
    const refreshClaude = () => setStatus(claudeStatus, ClaudeHook.eventHooksStatus());
    configure.connect('clicked', () => {
        try {
            if (!current.secret)
                current.secret = GLib.uuid_string_random();
            const port = Number(current.port) || DEFAULT_PORT;
            // Install the port-independent event hooks and register this
            // endpoint so they reach a widget that has not reloaded yet.
            ClaudeHook.installEventHooks();
            ClaudeHook.registerPort(port, current.secret);
            commit();
        } catch (error) {
            logError(error, 'Cannot configure Claude Code event hooks');
        }
        refreshClaude();
    });
    configure.sensitive = ClaudeHook.isClaudeInstalled();
    claudeRow.add_suffix(configure);
    refreshClaude();
    providers.add(claudeRow);

    // --- Sessions -----------------------------------------------------------
    const sessions = new Adw.PreferencesGroup({title: 'Sessions'});
    page.add(sessions);
    spinRow(sessions, current, 'port', {
        title: 'Hook port',
        subtitle: 'Localhost port for the Claude event endpoint',
        lower: 1024, upper: 65535, page: 100, value: DEFAULT_PORT,
    }, commit);
    spinRow(sessions, current, 'idleMinutes', {
        title: 'Idle after',
        subtitle: 'Minutes without events before a session shows as idle',
        lower: 1, upper: 720, page: 10, value: 30,
    }, commit);
    spinRow(sessions, current, 'expireMinutes', {
        title: 'Expire after',
        subtitle: 'Minutes without events before a session is dropped',
        lower: 5, upper: 1440, page: 30, value: 180,
    }, commit);
    spinRow(sessions, current, 'maxDots', {
        title: 'Maximum dots',
        subtitle: 'Further sessions collapse into a +N overflow label',
        lower: 1, upper: 16, page: 4, value: 8,
    }, commit);

    // --- Appearance ---------------------------------------------------------
    const appearance = new Adw.PreferencesGroup({
        title: 'Appearance',
        description: 'One dot per session, coloured by its state.',
    });
    page.add(appearance);
    const colorRows = [
        ['needsInputColor', 'Needs input', 'Claude is asking for permission/attention'],
        ['readyColor', 'Ready', 'Finished, waiting for you'],
        ['busyColor', 'Busy', 'Generating / working'],
        ['idleColor', 'Idle', 'No recent activity'],
    ];
    for (const [key, title, subtitle] of colorRows) {
        const row = new Adw.ActionRow({title, subtitle});
        row.add_suffix(colorButton(current, key, DEFAULT_COLORS[key], commit, 'Dot colour'));
        appearance.add(row);
    }
    const pulseReady = new Adw.SwitchRow({
        title: 'Pulse ready sessions',
        subtitle: 'Animate the dot of finished sessions (needs-input always pulses)',
        active: current.pulseReady !== false,
    });
    pulseReady.connect('notify::active', () => {
        current.pulseReady = pulseReady.active;
        commit();
    });
    appearance.add(pulseReady);

    // --- Tooltip ------------------------------------------------------------
    const tooltip = new Adw.PreferencesGroup({title: 'Tooltip'});
    page.add(tooltip);
    const showTooltip = new Adw.SwitchRow({
        title: 'Show tooltip',
        subtitle: 'Per-session details on hover',
        active: current.showTooltip !== false,
    });
    showTooltip.connect('notify::active', () => {
        current.showTooltip = showTooltip.active;
        commit();
    });
    tooltip.add(showTooltip);

    addTemplateEditor(tooltip, current, commit, {
        hint: 'Tokens: {counts}, {sessions}. Use \\n for a line break.',
        sampleFragments: SAMPLE_FRAGMENTS,
        defaultTemplate: DEFAULT_TOOLTIP_TEMPLATE,
        trim: true,
    });
}

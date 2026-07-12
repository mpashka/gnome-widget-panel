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
    waitingColor: '#f03333',
    idleColor: '#ffb82e',
    thinkingColor: '#4ca6ff',
};
// Representative coloured fragments for the live template preview.
const SAMPLE_FRAGMENTS = {
    counts: '<span foreground="#f03333">1 waiting</span> · '
        + '<span foreground="#ffb82e">1 idle</span> · 2 thinking',
    sessions: '<tt><span foreground="#f03333">●</span> my-project    waiting      0:42\n'
        + '<span foreground="#ffb82e">●</span> notes         idle         2:18\n'
        + '<span foreground="#4ca6ff">●</span> panel-widget  thinking     3:07\n'
        + '<span foreground="#4ca6ff">●</span> experiments   thinking    12:55</tt>',
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
    spinRow(sessions, current, 'expireMinutes', {
        title: 'Expire after',
        subtitle: 'Minutes without any events before a session is dropped',
        lower: 5, upper: 1440, page: 30, value: 180,
    }, commit);
    // --- Appearance ---------------------------------------------------------
    const appearance = new Adw.PreferencesGroup({
        title: 'Appearance',
        description: 'A single dot, coloured by the most-urgent session state.',
    });
    page.add(appearance);
    const colorRows = [
        ['waitingColor', 'Waiting', 'The agent is asking you something (highest priority)'],
        ['idleColor', 'Idle', 'Finished — ready for your next prompt'],
        ['thinkingColor', 'Thinking', 'Generating / working — nothing to do but wait'],
    ];
    for (const [key, title, subtitle] of colorRows) {
        const row = new Adw.ActionRow({title, subtitle});
        row.add_suffix(colorButton(current, key, DEFAULT_COLORS[key], commit, 'Dot colour'));
        appearance.add(row);
    }
    const pulseIdle = new Adw.SwitchRow({
        title: 'Pulse idle sessions',
        subtitle: 'Also pulse the idle (ready-for-prompt) dot; waiting always pulses',
        active: current.pulseIdle !== false,
    });
    pulseIdle.connect('notify::active', () => {
        current.pulseIdle = pulseIdle.active;
        commit();
    });
    appearance.add(pulseIdle);

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

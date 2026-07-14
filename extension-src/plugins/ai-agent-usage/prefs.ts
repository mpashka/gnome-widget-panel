// @ts-nocheck
// @tag:widget-ai-agent-usage
//
// Per-widget settings UI for the ai-agent-usage widget. Loaded lazily by the
// panel preferences UI (see ../../prefs.ts) only when the user opens this
// widget's settings. It edits the same `options` object stored per widget inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import * as ClaudeHook from './claudeHook.js';
import {colorButton} from '../../prefsColor.js';
import {addTemplateEditor} from '../../prefsTemplate.js';

const DEFAULT_MIN_ACTIVE_TOKENS = 10_000;
const DEFAULT_CLAUDE_PORT = 17861;
// Keep in sync with aiAgentUsageGraph.ts DEFAULT_TOOLTIP_TEMPLATE.
const DEFAULT_TOOLTIP_TEMPLATE = '{agent}: {usage}{reset}\n{requests}';
// Representative coloured fragments for the live template preview.
const SAMPLE_FRAGMENTS = {
    agent: '<span foreground="#10a37f">Codex</span>',
    usage: '<span foreground="#ffb82e">◕</span> 63%',
    reset: ' <span foreground="#4ca6ff">⧗</span> 20:15',
    requests: '<tt>Codex  20:14:05  Refactor the tooltip module\n'
        + 'Codex  20:12:33  Add a live template preview</tt>',
};
const DEFAULT_COLORS = {
    codexColor: '#10a37f',
    claudeColor: '#d97757',
    geminiColor: '#4285f4',
    usageColor: '#ffb82e',
    windowColor: '#4ca6ff',
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

function codexInstalled() {
    return GLib.file_test(
        GLib.build_filenamev([GLib.get_home_dir(), '.codex', 'sessions']),
        GLib.FileTest.IS_DIR
    );
}

function geminiInstalled() {
    return GLib.file_test(
        GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'tmp']),
        GLib.FileTest.IS_DIR
    );
}

function enableSwitch(current, key, commit) {
    const toggle = new Gtk.Switch({
        active: current[key] !== false,
        valign: Gtk.Align.CENTER,
        tooltip_text: 'Enabled',
    });
    toggle.connect('notify::active', () => {
        current[key] = toggle.active;
        commit();
    });
    return toggle;
}

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'AI agent usage',
        icon_name: 'utilities-system-monitor-symbolic',
    });
    window.add(page);

    // --- Providers --------------------------------------------------------
    const providers = new Adw.PreferencesGroup({
        title: 'Providers',
        description: 'Enable providers, pick their graph colour, and configure '
            + 'Claude Code. The status dot is green when configured, red when '
            + 'not, grey when the provider is not found on this system.',
    });
    page.add(providers);

    // Claude: status + Configure button.
    const claudeRow = new Adw.ActionRow({
        title: 'Claude Code',
        subtitle: 'Localhost hook for Claude statusLine',
    });
    const claudeStatus = statusImage();
    claudeRow.add_prefix(claudeStatus);
    claudeRow.add_suffix(colorButton(current, 'claudeColor', DEFAULT_COLORS.claudeColor, commit, 'Graph colour'));
    const configure = new Gtk.Button({
        label: 'Configure',
        valign: Gtk.Align.CENTER,
    });
    const refreshClaude = async () => setStatus(claudeStatus, await ClaudeHook.configStatus());
    configure.connect('clicked', async () => {
        try {
            if (!current.claudeSecret)
                current.claudeSecret = GLib.uuid_string_random();
            const port = Number(current.claudePort) || DEFAULT_CLAUDE_PORT;
            // Install the port-independent hook and register this endpoint so
            // Claude feeds it; a running widget re-registers on reload.
            await ClaudeHook.installHook();
            await ClaudeHook.registerPort(port, current.claudeSecret);
            commit();
        } catch (error) {
            logError(error, 'Cannot configure Claude Code hook');
        }
        refreshClaude();
    });
    configure.sensitive = ClaudeHook.isClaudeInstalled();
    claudeRow.add_suffix(configure);
    claudeRow.add_suffix(enableSwitch(current, 'enableClaude', commit));
    refreshClaude();
    providers.add(claudeRow);

    // Codex: detection only (no per-user configuration needed).
    const codexRow = new Adw.ActionRow({
        title: 'Codex',
        subtitle: 'Reads ~/.codex/sessions via a helper process',
    });
    const codexStatus = statusImage();
    setStatus(codexStatus, codexInstalled() ? 'ok' : 'not-installed');
    codexRow.add_prefix(codexStatus);
    codexRow.add_suffix(colorButton(current, 'codexColor', DEFAULT_COLORS.codexColor, commit, 'Graph colour'));
    codexRow.add_suffix(enableSwitch(current, 'enableCodex', commit));
    providers.add(codexRow);

    // Gemini: detection only (reads ~/.gemini/tmp via a helper process).
    const geminiRow = new Adw.ActionRow({
        title: 'Gemini CLI',
        subtitle: 'Reads ~/.gemini/tmp via a helper process',
    });
    const geminiStatus = statusImage();
    setStatus(geminiStatus, geminiInstalled() ? 'ok' : 'not-installed');
    geminiRow.add_prefix(geminiStatus);
    geminiRow.add_suffix(colorButton(current, 'geminiColor', DEFAULT_COLORS.geminiColor, commit, 'Graph colour'));
    geminiRow.add_suffix(enableSwitch(current, 'enableGemini', commit));
    providers.add(geminiRow);

    // --- Indicators -------------------------------------------------------
    const indicators = new Adw.PreferencesGroup({
        title: 'Indicators',
        description: 'Show/hide each vertical bar and pick its colour. The colour '
            + 'is shared by the bar and its matching tooltip icon.',
    });
    page.add(indicators);
    const usageRow = new Adw.ActionRow({title: 'Token usage (rate limit)'});
    usageRow.add_suffix(enableSwitch(current, 'showUsageBar', commit));
    usageRow.add_suffix(colorButton(current, 'usageColor', DEFAULT_COLORS.usageColor, commit, 'Graph colour'));
    indicators.add(usageRow);
    const windowRow = new Adw.ActionRow({title: 'Window (time left)'});
    windowRow.add_suffix(enableSwitch(current, 'showWindowBar', commit));
    windowRow.add_suffix(colorButton(current, 'windowColor', DEFAULT_COLORS.windowColor, commit, 'Graph colour'));
    indicators.add(windowRow);

    // --- Widget -----------------------------------------------------------
    const widget = new Adw.PreferencesGroup({title: 'Widget'});
    page.add(widget);
    const width = new Adw.SpinRow({
        title: 'Widget width',
        subtitle: 'Drawing area width in pixels',
        adjustment: new Gtk.Adjustment({
            lower: 24,
            upper: 200,
            step_increment: 1,
            page_increment: 10,
            value: Number(current.width) || 54,
        }),
    });
    width.connect('notify::value', () => {
        current.width = width.value;
        commit();
    });
    widget.add(width);
    const updateInterval = new Adw.SpinRow({
        title: 'Update interval',
        subtitle: 'Sampling period in seconds (also the graph time window)',
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 60,
            step_increment: 1,
            page_increment: 5,
            value: Number(current.updateInterval) || 5,
        }),
    });
    updateInterval.connect('notify::value', () => {
        current.updateInterval = updateInterval.value;
        commit();
    });
    widget.add(updateInterval);

    // --- Tooltip ----------------------------------------------------------
    const tooltip = new Adw.PreferencesGroup({title: 'Tooltip'});
    page.add(tooltip);
    const showTooltip = new Adw.SwitchRow({
        title: 'Show tooltip',
        subtitle: 'Agent, usage, reset time and recent requests on hover',
        active: current.showTooltip !== false,
    });
    showTooltip.connect('notify::active', () => {
        current.showTooltip = showTooltip.active;
        commit();
    });
    tooltip.add(showTooltip);
    const showRequests = new Adw.SwitchRow({
        title: 'Show recent requests',
        subtitle: 'List prompts visible on the graph',
        active: current.showRequests !== false,
    });
    showRequests.connect('notify::active', () => {
        current.showRequests = showRequests.active;
        commit();
    });
    tooltip.add(showRequests);
    const preview = new Adw.SpinRow({
        title: 'Request preview length',
        subtitle: 'Characters of each prompt shown',
        adjustment: new Gtk.Adjustment({
            lower: 5,
            upper: 200,
            step_increment: 5,
            value: Number(current.requestPreview) || 30,
        }),
    });
    preview.connect('notify::value', () => {
        current.requestPreview = preview.value;
        commit();
    });
    tooltip.add(preview);

    addTemplateEditor(tooltip, current, commit, {
        hint: 'Tokens: {agent}, {usage}, {reset}, {requests}. Use \\n for a '
            + 'line break.',
        sampleFragments: SAMPLE_FRAGMENTS,
        defaultTemplate: DEFAULT_TOOLTIP_TEMPLATE,
        trim: true,
    });

    // --- Advanced ---------------------------------------------------------
    const advanced = new Adw.PreferencesGroup({title: 'Advanced'});
    page.add(advanced);
    const idle = new Adw.SpinRow({
        title: 'Idle token threshold',
        subtitle: 'Samples below this many tokens draw as zero',
        adjustment: new Gtk.Adjustment({
            lower: 0,
            upper: 1_000_000,
            step_increment: 500,
            page_increment: 5_000,
            value: Number(current.minActiveTokens ?? DEFAULT_MIN_ACTIVE_TOKENS),
        }),
    });
    idle.connect('notify::value', () => {
        current.minActiveTokens = idle.value;
        commit();
    });
    advanced.add(idle);
    const port = new Adw.SpinRow({
        title: 'Claude hook port',
        subtitle: 'Localhost port for the Claude statusLine endpoint',
        adjustment: new Gtk.Adjustment({
            lower: 1024,
            upper: 65535,
            step_increment: 1,
            page_increment: 100,
            value: Number(current.claudePort ?? DEFAULT_CLAUDE_PORT),
        }),
    });
    port.connect('notify::value', () => {
        current.claudePort = port.value;
        commit();
    });
    advanced.add(port);
}

// @ts-nocheck
// @tag:widget-ai-agent-usage
//
// Per-widget settings UI for the ai-agent-usage widget. Loaded lazily by the
// panel preferences UI (see ../../prefs.ts) only when the user opens this
// widget's settings. It edits the same `options` object stored per widget inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {colorButton} from '../../prefsColor.js';
import {addTemplateEditor} from '../../prefsTemplate.js';

const DEFAULT_MIN_ACTIVE_TOKENS = 10_000;
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

// Show/hide toggle used by the indicator rows, whose switch sits beside the
// row's colour button rather than filling the row.
function enableSwitch(current, key, commit) {
    const toggle = new Gtk.Switch({
        active: current[key] !== false,
        valign: Gtk.Align.CENTER,
        tooltip_text: 'Shown',
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

    // --- Provider colours -------------------------------------------------
    // Colours only. *Whether* a provider is collected from, and configuring
    // Claude's hook, are the collector's settings (Settings → AI collector):
    // collection is not this widget's to switch on, since it keeps running when
    // the widget is removed. See ../../aiCollector.ts.
    const providers = new Adw.PreferencesGroup({
        title: 'Provider colours',
        description: 'The colour each agent\u2019s columns and request markers are '
            + 'drawn in. Which agents are collected from is set in the panel\u2019s '
            + 'AI collector settings.',
    });
    page.add(providers);

    for (const provider of [
        {key: 'claudeColor', title: 'Claude Code'},
        {key: 'codexColor', title: 'Codex'},
        {key: 'geminiColor', title: 'Gemini CLI'},
    ]) {
        const row = new Adw.ActionRow({title: provider.title});
        row.add_suffix(
            colorButton(current, provider.key, DEFAULT_COLORS[provider.key], commit, 'Graph colour')
        );
        providers.add(row);
    }

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
}

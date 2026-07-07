// @ts-nocheck
// @tag:widget-cpu-load-monitor
//
// Per-widget settings UI for the cpu-load-monitor widget. Loaded lazily by the
// panel preferences UI (see ../../prefs.ts). Edits the widget `options` in
// widgets.json; the widget reads them on the next GNOME Shell reload.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {renderTemplate} from '../../tooltipTemplate.js';

const DEFAULT_BANDS = [
    {name: 'green', temp: 50, color: '#3dc752'},
    {name: 'yellow', temp: 65, color: '#ffc729'},
    {name: 'red', temp: 80, color: '#f03333'},
];
const DEFAULT_WIDTH = 32;
const DEFAULT_UPDATE_INTERVAL = 2;
// Keep in sync with cpuGraph.ts DEFAULT_TOOLTIP_TEMPLATE.
const DEFAULT_TOOLTIP_TEMPLATE = 'cpu: {load}, {temp}\n°C: {legend}';
// Representative coloured fragments for the live template preview.
const SAMPLE_FRAGMENTS = {
    load: '42%',
    temp: '<span foreground="#ffc729">71°C</span>',
    legend: '<span foreground="#3dc752">50..65</span>, '
        + '<span foreground="#ffc729"><b>65..80</b></span>, '
        + '<span foreground="#f03333">&gt;80</span>',
};

function hexToRgba(hex) {
    const rgba = new Gdk.RGBA();
    rgba.parse(hex || '#000000');
    return rgba;
}

function rgbaToHex(rgba) {
    const channel = value =>
        Math.round(Math.max(0, Math.min(1, value)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(rgba.red)}${channel(rgba.green)}${channel(rgba.blue)}`;
}

// Read the configured bands, falling back to defaults. Names and count are fixed
// in the UI; they live in the configuration and are edited (temp/color) below.
function currentBands(options) {
    const bands = options.bands;
    if (!Array.isArray(bands) || bands.length === 0)
        return DEFAULT_BANDS.map(band => ({...band}));
    return bands.map(band => ({...band}));
}

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const bands = currentBands(options);
    current.bands = bands;
    const commit = () => save({...current, bands: bands.map(band => ({...band}))});

    const page = new Adw.PreferencesPage({
        title: 'CPU load monitor',
        icon_name: 'utilities-system-monitor-symbolic',
    });
    window.add(page);

    // --- Temperature bands ------------------------------------------------
    const bandsGroup = new Adw.PreferencesGroup({
        title: 'Temperature bands',
        description: 'Each band sets the temperature (°C) at which it activates '
            + 'and the colour of the graph and tooltip. Below the lowest band the '
            + 'graph uses the default foreground colour.',
    });
    page.add(bandsGroup);
    bands.forEach(band => {
        const row = new Adw.ActionRow({title: band.name});
        const spin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 120,
                step_increment: 1,
                value: Number(band.temp),
            }),
            valign: Gtk.Align.CENTER,
        });
        spin.connect('notify::value', () => {
            band.temp = spin.value;
            commit();
        });
        row.add_suffix(spin);
        const color = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            rgba: hexToRgba(band.color),
            valign: Gtk.Align.CENTER,
        });
        color.connect('notify::rgba', () => {
            band.color = rgbaToHex(color.get_rgba());
            commit();
        });
        row.add_suffix(color);
        bandsGroup.add(row);
    });

    // --- Widget -----------------------------------------------------------
    const widget = new Adw.PreferencesGroup({title: 'Widget'});
    page.add(widget);
    const width = new Adw.SpinRow({
        title: 'Width',
        subtitle: 'Graph width in pixels',
        adjustment: new Gtk.Adjustment({
            lower: 8,
            upper: 200,
            step_increment: 1,
            value: Number(current.width ?? DEFAULT_WIDTH),
        }),
    });
    width.connect('notify::value', () => {
        current.width = width.value;
        commit();
    });
    widget.add(width);
    const interval = new Adw.SpinRow({
        title: 'Update interval',
        subtitle: 'Sampling period in seconds',
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 60,
            step_increment: 1,
            value: Number(current.updateInterval ?? DEFAULT_UPDATE_INTERVAL),
        }),
    });
    interval.connect('notify::value', () => {
        current.updateInterval = interval.value;
        commit();
    });
    widget.add(interval);

    // --- Tooltip ----------------------------------------------------------
    const tooltip = new Adw.PreferencesGroup({title: 'Tooltip'});
    page.add(tooltip);
    const show = new Adw.SwitchRow({
        title: 'Show tooltip',
        subtitle: 'Load, temperature and the colour legend on hover',
        active: current.showTooltip !== false,
    });
    show.connect('notify::active', () => {
        current.showTooltip = show.active;
        commit();
    });
    tooltip.add(show);

    addTemplateEditor(tooltip, current, commit);
}

// Multi-line template editor plus a live tooltip preview. Persists the template
// to `options.template` on every change and re-renders SAMPLE_FRAGMENTS through
// the shared renderer, showing an error hint if the markup is invalid.
function addTemplateEditor(group, current, commit) {
    const initial = typeof current.template === 'string'
        ? current.template
        : DEFAULT_TOOLTIP_TEMPLATE;

    const frame = new Gtk.Frame({margin_top: 6});
    const scrolled = new Gtk.ScrolledWindow({
        min_content_height: 72,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
    });
    const textView = new Gtk.TextView({
        monospace: true,
        top_margin: 6,
        bottom_margin: 6,
        left_margin: 6,
        right_margin: 6,
        wrap_mode: Gtk.WrapMode.WORD_CHAR,
    });
    const buffer = textView.get_buffer();
    buffer.set_text(initial, -1);
    scrolled.set_child(textView);
    frame.set_child(scrolled);
    group.add(frame);

    const hint = new Gtk.Label({
        label: 'Tokens: {load}, {temp}, {legend}. Use \\n for a line break.',
        xalign: 0,
        wrap: true,
        margin_top: 4,
    });
    hint.add_css_class('dim-label');
    group.add(hint);

    const preview = new Gtk.Label({
        use_markup: true,
        xalign: 0,
        wrap: true,
        selectable: true,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 8,
        margin_end: 8,
    });
    preview.add_css_class('card');
    group.add(preview);

    const updatePreview = () => {
        const template = typeof current.template === 'string'
            ? current.template
            : DEFAULT_TOOLTIP_TEMPLATE;
        try {
            const markup = renderTemplate(template, SAMPLE_FRAGMENTS);
            Pango.parse_markup(markup, -1, 0);
            preview.remove_css_class('error');
            preview.set_markup(markup);
        } catch (error) {
            preview.add_css_class('error');
            preview.set_text(`Invalid template: ${error?.message ?? error}`);
        }
    };

    buffer.connect('changed', () => {
        const [start, end] = [buffer.get_start_iter(), buffer.get_end_iter()];
        current.template = buffer.get_text(start, end, false);
        commit();
        updatePreview();
    });
    updatePreview();
}

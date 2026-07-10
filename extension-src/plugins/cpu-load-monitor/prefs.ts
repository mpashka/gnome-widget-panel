// @ts-nocheck
// @tag:widget-cpu-load-monitor
//
// Per-widget settings UI for the cpu-load-monitor widget. Loaded lazily by the
// panel preferences UI (see ../../prefs.ts). Edits the widget `options` inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {colorButton} from '../../prefsColor.js';
import {addTemplateEditor} from '../../prefsTemplate.js';

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
        row.add_suffix(colorButton(band, 'color', undefined, commit));
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

    addTemplateEditor(tooltip, current, commit, {
        hint: 'Tokens: {load}, {temp}, {legend}. Use \\n for a line break.',
        sampleFragments: SAMPLE_FRAGMENTS,
        defaultTemplate: DEFAULT_TOOLTIP_TEMPLATE,
    });
}

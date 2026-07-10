// @ts-nocheck
// @tag:widget-break-timer
//
// Per-widget settings UI for the break-timer widget. Loaded lazily by the
// panel preferences UI (see ../../prefs.ts). Edits the widget `options` inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {colorButton} from '../../prefsColor.js';
import {addTemplateEditor} from '../../prefsTemplate.js';

const DEFAULT_TIMERS = [
    {
        name: 'micro',
        enabled: true,
        workMinutes: 10,
        breakSeconds: 30,
        color: '#4ca6ff',
        overdueColor: '#f03333',
    },
    {
        name: 'rest',
        enabled: true,
        workMinutes: 50,
        breakSeconds: 480,
        color: '#3dc752',
        overdueColor: '#f03333',
    },
    {
        name: 'daily',
        enabled: false,
        workMinutes: 360,
        breakSeconds: 0,
        color: '#ffb82e',
        overdueColor: '#f03333',
    },
];
// Per-timer UI ranges and labels; `daily` has no idle-based break so its
// break-duration row is omitted.
const TIMER_META = {
    micro: {title: 'Micro break', workRange: [1, 120], breakRange: [5, 600]},
    rest: {title: 'Rest break', workRange: [5, 240], breakRange: [30, 3600]},
    daily: {title: 'Daily limit', workRange: [30, 960], breakRange: null},
};
const DEFAULT_WIDTH = 32;
// Keep in sync with breakTimerGraph.ts DEFAULT_TOOLTIP_TEMPLATE.
const DEFAULT_TOOLTIP_TEMPLATE = '{micro}\n{rest}\n{daily}';
// Representative coloured fragments for the live template preview.
const SAMPLE_FRAGMENTS = {
    micro: '<span foreground="#4ca6ff">micro: 7:32/10:00</span>',
    rest: '<span foreground="#3dc752">rest: 41:05/50:00</span>',
    daily: '<span foreground="#f03333">daily: 6:00:00/6:00:00 — break!</span>',
};

// Read the configured timers, falling back to defaults. Names, count and
// order are fixed in the UI; only enabled/intervals/colors are edited.
function currentTimers(options) {
    const timers = options.timers;
    if (!Array.isArray(timers) || timers.length === 0)
        return DEFAULT_TIMERS.map(timer => ({...timer}));
    return DEFAULT_TIMERS.map(def => {
        const match = timers.find(t => t && t.name === def.name);
        return match ? {...def, ...match} : {...def};
    });
}

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const timers = currentTimers(options);
    current.timers = timers;
    const commit = () => save({...current, timers: timers.map(timer => ({...timer}))});

    const page = new Adw.PreferencesPage({
        title: 'Break timer',
        icon_name: 'alarm-symbolic',
    });
    window.add(page);

    // --- Timers -------------------------------------------------------------
    const timersGroup = new Adw.PreferencesGroup({
        title: 'Timers',
        description: 'Each timer counts activity time (keyboard/mouse), not '
            + 'wall-clock time. Taking a break (idling at least as long as its '
            + 'break duration) resets it; the daily limit also resets at local '
            + 'midnight.',
    });
    page.add(timersGroup);
    timers.forEach(timer => {
        const meta = TIMER_META[timer.name];
        const row = new Adw.ExpanderRow({
            title: meta.title,
            subtitle: `${timer.workMinutes} min work`
                + (meta.breakRange ? `, ${timer.breakSeconds} s break` : ''),
        });
        const updateSubtitle = () => {
            row.subtitle = `${timer.workMinutes} min work`
                + (meta.breakRange ? `, ${timer.breakSeconds} s break` : '');
        };

        const enable = new Gtk.Switch({
            active: timer.enabled,
            valign: Gtk.Align.CENTER,
        });
        enable.connect('notify::active', () => {
            timer.enabled = enable.active;
            commit();
        });
        row.add_suffix(enable);
        timersGroup.add(row);

        const workRow = new Adw.SpinRow({
            title: 'Work interval',
            subtitle: 'Minutes of activity before this timer is due',
            adjustment: new Gtk.Adjustment({
                lower: meta.workRange[0],
                upper: meta.workRange[1],
                step_increment: 1,
                value: Number(timer.workMinutes),
            }),
        });
        workRow.connect('notify::value', () => {
            timer.workMinutes = workRow.value;
            updateSubtitle();
            commit();
        });
        row.add_row(workRow);

        if (meta.breakRange) {
            const breakRow = new Adw.SpinRow({
                title: 'Break duration',
                subtitle: 'Seconds of continuous idle that counts as taking the break',
                adjustment: new Gtk.Adjustment({
                    lower: meta.breakRange[0],
                    upper: meta.breakRange[1],
                    step_increment: 5,
                    value: Number(timer.breakSeconds),
                }),
            });
            breakRow.connect('notify::value', () => {
                timer.breakSeconds = breakRow.value;
                updateSubtitle();
                commit();
            });
            row.add_row(breakRow);
        }

        const colorRow = new Adw.ActionRow({title: 'Colour'});
        colorRow.add_suffix(colorButton(timer, 'color', undefined, commit, 'Progress colour'));
        row.add_row(colorRow);

        const overdueRow = new Adw.ActionRow({title: 'Overdue colour'});
        overdueRow.add_suffix(colorButton(timer, 'overdueColor', undefined, commit, 'Colour once due for a break'));
        row.add_row(overdueRow);
    });

    // --- Widget ---------------------------------------------------------
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

    // --- Tooltip ----------------------------------------------------------
    const tooltip = new Adw.PreferencesGroup({title: 'Tooltip'});
    page.add(tooltip);
    const show = new Adw.SwitchRow({
        title: 'Show tooltip',
        subtitle: 'Per-timer elapsed/limit on hover',
        active: current.showTooltip !== false,
    });
    show.connect('notify::active', () => {
        current.showTooltip = show.active;
        commit();
    });
    tooltip.add(show);

    addTemplateEditor(tooltip, current, commit, {
        hint: 'Tokens: {micro}, {rest}, {daily}. Use \\n for a line break. '
            + 'A disabled timer renders as an empty fragment.',
        sampleFragments: SAMPLE_FRAGMENTS,
        defaultTemplate: DEFAULT_TOOLTIP_TEMPLATE,
    });
}

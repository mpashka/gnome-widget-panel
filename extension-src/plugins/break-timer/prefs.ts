// @ts-nocheck
// @tag:widget-break-timer
//
// Per-widget settings UI for the break-timer widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` inside the
// `widgets` GSettings key; the running panel live-reloads on change.
//
// Shape follows the panel's widget list: a row per timer carrying its summary
// and its enable switch, with a settings button that pushes an in-window
// subpage — the same gesture everywhere, and no long expanded page to scroll.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {colorButton} from '../../prefsColor.js';
import {addTemplateEditor} from '../../prefsTemplate.js';
import {
    DEFAULT_DAILY_IDLE_RESET_HOURS,
    MESSAGE_ANCHORS,
    TIMER_TITLES,
    normalizeAnchor,
    normalizeTimers,
} from './breakTimerState.js';

// Per-timer UI ranges and reminder choices. The daily limit is not a break one
// takes, so it has neither a break duration nor a break screen.
const TIMER_META = {
    micro: {workRange: [1, 120], breakRange: [5, 600], canInterrupt: true},
    rest: {workRange: [5, 240], breakRange: [30, 3600], canInterrupt: true},
    daily: {workRange: [30, 960], breakRange: null, canInterrupt: false},
};
const REMINDER_CHOICES = [
    {value: 'off', label: 'Off'},
    {value: 'notify', label: 'Message only'},
    {value: 'screen', label: 'Message + break screen'},
];
const DEFAULT_WIDTH = 32;
const ANCHOR_LABELS = {
    'top-left': 'Top left',
    'top-center': 'Top centre',
    'top-right': 'Top right',
    'bottom-left': 'Bottom left',
    'bottom-center': 'Bottom centre',
    'bottom-right': 'Bottom right',
};
const ANCHOR_CHOICES = MESSAGE_ANCHORS.map(value => ({
    value,
    label: ANCHOR_LABELS[value],
}));
// Keep in sync with breakTimerGraph.ts DEFAULT_TOOLTIP_TEMPLATE.
const DEFAULT_TOOLTIP_TEMPLATE = '{micro}\n{rest}\n{daily}';
// Representative coloured fragments for the live template preview.
const SAMPLE_FRAGMENTS = {
    micro: '<span foreground="#4ca6ff">micro: 7:32/10:00</span>',
    rest: '<span foreground="#3dc752">rest: 41:05/1:00:00</span>',
    daily: '<span foreground="#f03333">daily: 8:00:00/8:00:00 — break!</span>',
};


// Read the configured timers, falling back to defaults. Names, count and
// order are fixed in the UI; only enabled/intervals/reminders/colors are edited.
function currentTimers(options) {
    return normalizeTimers(options.timers);
}


function choicesFor(timer) {
    return TIMER_META[timer.name].canInterrupt
        ? REMINDER_CHOICES
        : REMINDER_CHOICES.filter(choice => choice.value !== 'screen');
}


function reminderLabel(timer) {
    return REMINDER_CHOICES.find(choice => choice.value === timer.reminder)?.label
        ?? timer.reminder;
}


// What the list row says about a timer without opening it: the whole
// configuration in one line, so three timers can be compared at a glance.
function timerSummary(timer, meta) {
    const parts = [`${timer.workMinutes} min work`];
    if (meta.breakRange) {
        // Whole minutes read better than "480 s" for the rest break.
        parts.push(timer.breakSeconds >= 60 && timer.breakSeconds % 60 === 0
            ? `${timer.breakSeconds / 60} min break`
            : `${timer.breakSeconds} s break`);
    }
    parts.push(reminderLabel(timer).toLowerCase());
    return parts.join(' · ');
}


// Adw.ComboRow over a fixed value list, reporting the chosen value.
function choiceRow(title, subtitle, choices, value, onChange) {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: new Gtk.StringList({strings: choices.map(choice => choice.label)}),
        selected: Math.max(0, choices.findIndex(choice => choice.value === value)),
    });
    row.connect('notify::selected', () => onChange(choices[row.selected].value));
    return row;
}


function spinRow(title, subtitle, range, step, value, onChange) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower: range[0],
            upper: range[1],
            step_increment: step,
            value: Number(value),
        }),
    });
    row.connect('notify::value', () => onChange(row.value));
    return row;
}


function switchRow(title, subtitle, active, onChange) {
    const row = new Adw.SwitchRow({title, subtitle, active});
    row.connect('notify::active', () => onChange(row.active));
    return row;
}


function reminderRows(group, timer, meta, commit) {
    group.add(choiceRow(
        'Reminder',
        meta.canInterrupt
            ? 'A message first, then the dimmed break screen'
            : 'A passive message; the daily limit never dims the screen',
        choicesFor(timer),
        timer.reminder,
        value => {
            timer.reminder = value;
            commit();
        }
    ));
    if (!meta.canInterrupt)
        return;

    group.add(spinRow(
        'Warn ahead by',
        'Seconds of warning before the break; 0 = half the break (5-30 s)',
        [0, 300], 5, timer.leadSeconds,
        value => {
            timer.leadSeconds = value;
            commit();
        }
    ));
    group.add(switchRow(
        'Allow postpone',
        'The break is offered again later and stays owed',
        timer.allowPostpone,
        value => {
            timer.allowPostpone = value;
            commit();
        }
    ));
    group.add(spinRow(
        'Postpone by',
        'Minutes of work before the break is offered again',
        [1, 60], 1, timer.postponeMinutes,
        value => {
            timer.postponeMinutes = value;
            commit();
        }
    ));
    group.add(switchRow(
        'Allow skip',
        'Drop this break and start the work interval over',
        timer.allowSkip,
        value => {
            timer.allowSkip = value;
            commit();
        }
    ));
}


// One timer's own page, pushed on top of the widget's settings page.
function openTimerPage(window, timer, meta, commit) {
    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({
        title: TIMER_TITLES[timer.name],
        description: meta.breakRange
            ? 'The work interval counts activity time; the break duration is '
                + 'both what the break screen counts down and the idle time that '
                + 'counts as having taken the break.'
            : 'The daily limit is reached, not taken: it has no break duration '
                + 'and never dims the screen.',
    });
    page.add(group);

    group.add(spinRow(
        'Work interval',
        'Minutes of activity before this timer is due',
        meta.workRange, 1, timer.workMinutes,
        value => {
            timer.workMinutes = value;
            commit();
        }
    ));
    if (meta.breakRange) {
        group.add(spinRow(
            'Break duration',
            'Seconds of continuous idle that counts as taking the break',
            meta.breakRange, 5, timer.breakSeconds,
            value => {
                timer.breakSeconds = value;
                commit();
            }
        ));
    }
    reminderRows(group, timer, meta, commit);

    const colors = new Adw.PreferencesGroup({title: 'Colours'});
    page.add(colors);
    const colorRow = new Adw.ActionRow({title: 'Colour'});
    colorRow.add_suffix(colorButton(timer, 'color', undefined, commit, 'Progress colour'));
    colors.add(colorRow);
    const overdueRow = new Adw.ActionRow({title: 'Overdue colour'});
    overdueRow.add_suffix(
        colorButton(timer, 'overdueColor', undefined, commit, 'Colour once due for a break')
    );
    colors.add(overdueRow);

    const toolbar = new Adw.ToolbarView();
    toolbar.add_top_bar(new Adw.HeaderBar());
    toolbar.set_content(page);
    window.push_subpage(new Adw.NavigationPage({
        title: TIMER_TITLES[timer.name],
        child: toolbar,
    }));
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
            + 'break duration) resets it; the daily limit resets when the '
            + 'computer is switched on again or after a long absence.',
    });
    page.add(timersGroup);
    timers.forEach(timer => {
        const meta = TIMER_META[timer.name];
        const row = new Adw.ActionRow({
            title: TIMER_TITLES[timer.name],
            subtitle: timerSummary(timer, meta),
        });

        const settings = new Gtk.Button({
            icon_name: 'emblem-system-symbolic',
            tooltip_text: 'Timer settings',
            valign: Gtk.Align.CENTER,
        });
        settings.connect('clicked', () => openTimerPage(window, timer, meta, () => {
            row.subtitle = timerSummary(timer, meta);
            commit();
        }));
        row.add_suffix(settings);

        const enable = new Gtk.Switch({
            active: timer.enabled,
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Enabled',
        });
        enable.connect('notify::active', () => {
            timer.enabled = enable.active;
            commit();
        });
        row.add_suffix(enable);
        row.activatable_widget = enable;
        timersGroup.add(row);
    });

    // --- Widget ---------------------------------------------------------
    const widget = new Adw.PreferencesGroup({title: 'Widget'});
    page.add(widget);
    widget.add(spinRow(
        'End the day after',
        'Hours away from the keyboard that reset the daily counter '
            + '(0 = never); switching the computer on always starts a new day',
        [0, 24], 1, current.dailyResetHours ?? DEFAULT_DAILY_IDLE_RESET_HOURS,
        value => {
            current.dailyResetHours = value;
            commit();
        }
    ));
    widget.add(spinRow(
        'Width',
        'Graph width in pixels',
        [8, 200], 1, current.width ?? DEFAULT_WIDTH,
        value => {
            current.width = value;
            commit();
        }
    ));
    widget.add(choiceRow(
        'Warning position',
        'Where the advance warning appears; it steps aside once if the pointer '
            + 'reaches it, and can be dragged anywhere',
        ANCHOR_CHOICES,
        normalizeAnchor(current.messageAnchor),
        value => {
            current.messageAnchor = value;
            commit();
        }
    ));

    // --- Tooltip ----------------------------------------------------------
    const tooltip = new Adw.PreferencesGroup({title: 'Tooltip'});
    page.add(tooltip);
    tooltip.add(switchRow(
        'Show tooltip',
        'Per-timer elapsed/limit on hover',
        current.showTooltip !== false,
        value => {
            current.showTooltip = value;
            commit();
        }
    ));

    addTemplateEditor(tooltip, current, commit, {
        hint: 'Tokens: {micro}, {rest}, {daily}. Use \\n for a line break. '
            + 'A disabled timer renders as an empty fragment.',
        sampleFragments: SAMPLE_FRAGMENTS,
        defaultTemplate: DEFAULT_TOOLTIP_TEMPLATE,
    });
}

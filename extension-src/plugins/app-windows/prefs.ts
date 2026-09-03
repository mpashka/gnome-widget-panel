// @ts-nocheck
// @tag:widget-app-windows
//
// Per-widget settings UI for the app-windows widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` inside the
// `widgets` GSettings key; the running panel live-reloads on change. The
// defaults and the allowed ranges live in `appWindowEntries.ts`, so the UI and
// the widget cannot drift apart.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {addTemplateEditor} from '../../prefsTemplate.js';
import {iconRow} from '../iconPicker.js';
import {
    DEFAULT_ICON,
    DEFAULT_TEMPLATE,
    MAX_WINDOWS_RANGE,
    MENU_WIDTH_RANGE,
    parseAppWindowsOptions,
} from './appWindowEntries.js';

// Title order first: it is the default, and the one this widget exists for — a
// list that stays put between openings.
const SORT_CHOICES = [
    {id: 'title', label: 'By title (stays put)'},
    {id: 'recent', label: 'Most recently used first'},
];

// Representative fragments for the live tooltip preview.
const SAMPLE_FRAGMENTS = {
    app: 'IntelliJ IDEA',
    count: '4 windows',
    window: 'home-infra – Main.java',
};

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const defaults = parseAppWindowsOptions(options);
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'App windows',
        icon_name: 'focus-windows-symbolic',
    });
    window.add(page);

    // --- Button -----------------------------------------------------------
    const button = new Adw.PreferencesGroup({title: 'Button'});
    page.add(button);

    const useAppIcon = new Adw.SwitchRow({
        title: "Use the application's icon",
        subtitle:
            'Off: always the icon below. On: the icon below is only used until '
            + 'an application has been focused, or when it has none of its own.',
        active: defaults.useAppIcon,
    });
    useAppIcon.connect('notify::active', () => {
        current.useAppIcon = useAppIcon.active;
        commit();
    });
    button.add(useAppIcon);

    button.add(iconRow({
        current,
        key: 'icon',
        fallback: DEFAULT_ICON,
        title: 'Icon',
        subtitle: 'The selected icon, with a searchable picker.',
        commit,
    }));

    const textRow = new Adw.EntryRow({
        title: 'Text',
        text: defaults.text,
    });
    textRow.connect('changed', () => {
        current.text = textRow.get_text();
        commit();
    });
    button.add(textRow);

    const showCount = new Adw.SwitchRow({
        title: 'Show window count',
        subtitle: 'A small badge in the corner of the icon, from two windows up',
        active: defaults.showCount,
    });
    showCount.connect('notify::active', () => {
        current.showCount = showCount.active;
        commit();
    });
    button.add(showCount);

    // --- Menu -------------------------------------------------------------
    const menu = new Adw.PreferencesGroup({
        title: 'Menu',
        description:
            'The menu lists the windows of that application by title. A title '
            + 'longer than the menu width is ellipsized.',
    });
    page.add(menu);

    const sortRow = new Adw.ComboRow({
        title: 'Order',
        subtitle: 'By title the rows keep their place, so the one you want is '
            + 'where you left it; most-recently-used reshuffles after every '
            + 'switch and always starts with the window you came from',
        model: Gtk.StringList.new(SORT_CHOICES.map((choice) => choice.label)),
        selected: Math.max(
            0,
            SORT_CHOICES.findIndex((choice) => choice.id === defaults.sort)
        ),
    });
    sortRow.connect('notify::selected', () => {
        current.sort = (SORT_CHOICES[sortRow.get_selected()] ?? SORT_CHOICES[0]).id;
        commit();
    });
    menu.add(sortRow);

    const maxWindows = new Adw.SpinRow({
        title: 'Maximum windows',
        subtitle: 'Rows the menu lists; the rest are counted as "N more"',
        adjustment: new Gtk.Adjustment({
            lower: MAX_WINDOWS_RANGE[0],
            upper: MAX_WINDOWS_RANGE[1],
            step_increment: 1,
            value: defaults.maxWindows,
        }),
    });
    maxWindows.connect('notify::value', () => {
        current.maxWindows = maxWindows.value;
        commit();
    });
    menu.add(maxWindows);

    const menuWidth = new Adw.SpinRow({
        title: 'Menu width',
        subtitle: 'Width of the popup in pixels',
        adjustment: new Gtk.Adjustment({
            lower: MENU_WIDTH_RANGE[0],
            upper: MENU_WIDTH_RANGE[1],
            step_increment: 10,
            value: defaults.menuWidth,
        }),
    });
    menuWidth.connect('notify::value', () => {
        current.menuWidth = menuWidth.value;
        commit();
    });
    menu.add(menuWidth);

    const otherWorkspaces = new Adw.SwitchRow({
        title: 'Windows on other workspaces',
        subtitle: 'List them too, marked with their workspace number',
        active: defaults.otherWorkspaces,
    });
    otherWorkspaces.connect('notify::active', () => {
        current.otherWorkspaces = otherWorkspaces.active;
        commit();
    });
    menu.add(otherWorkspaces);

    // --- Tooltip ----------------------------------------------------------
    const tooltip = new Adw.PreferencesGroup({
        title: 'Tooltip',
        description: 'Shown on hover. Leave it empty for no tooltip at all.',
    });
    page.add(tooltip);

    addTemplateEditor(tooltip, current, commit, {
        hint:
            'Tokens: {app} — application name, {count} — how many windows, '
            + '{window} — title of the window in focus. Use \\n for a line break.',
        sampleFragments: SAMPLE_FRAGMENTS,
        defaultTemplate: DEFAULT_TEMPLATE,
    });
}

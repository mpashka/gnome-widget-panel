// @ts-nocheck
// @tag:widget-gnome-action
//
// Per-widget settings UI for the "Gnome Action" widget (id `gnome-action`,
// formerly `activities`). Loaded lazily by the panel preferences UI (see ../../prefs.ts).
// Edits the widget `options` in widgets.json; the widget reads them on the next
// GNOME Shell reload.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {iconRow} from '../iconPicker.js';

const DEFAULT_ICON = 'focus-windows-symbolic';
const DEFAULT_ACTION = 'overview';

// The implemented actions and their human labels, in display order. The id
// order here maps to the Adw.ComboRow selected index.
const ACTIONS = [
    {id: 'overview', label: 'Windows overview'},
    {id: 'apps', label: 'All applications'},
    {id: 'show-desktop', label: 'Show desktop (minimize all)'},
];

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Gnome Action',
        icon_name: 'focus-windows-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Button',
        description:
            'Runs a GNOME action on click. Shown as an icon and/or a text '
            + 'label. Leave the text empty for an icon-only button. Clearing '
            + 'both is not recommended: the button then falls back to its '
            + 'default icon.',
    });
    page.add(group);

    const model = new Gtk.StringList();
    for (const action of ACTIONS)
        model.append(action.label);

    const currentAction =
        typeof current.action === 'string' && current.action.length > 0
            ? current.action
            : DEFAULT_ACTION;
    const selectedIndex = Math.max(
        0,
        ACTIONS.findIndex((action) => action.id === currentAction)
    );

    const actionRow = new Adw.ComboRow({
        title: 'Action',
        subtitle: 'Which GNOME action this button runs when clicked.',
        model,
        selected: selectedIndex,
    });
    actionRow.connect('notify::selected', () => {
        const index = actionRow.get_selected();
        const chosen = ACTIONS[index] ?? ACTIONS[0];
        current.action = chosen.id;
        commit();
    });
    group.add(actionRow);

    group.add(iconRow({
        current,
        key: 'icon',
        fallback: DEFAULT_ICON,
        title: 'Icon',
        subtitle: 'The selected icon, with a searchable picker.',
        commit,
    }));

    const textRow = new Adw.EntryRow({
        title: 'Text',
        text: typeof current.text === 'string' ? current.text : '',
    });
    textRow.connect('changed', () => {
        current.text = textRow.get_text();
        commit();
    });
    group.add(textRow);
}

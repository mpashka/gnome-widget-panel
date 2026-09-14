// @ts-nocheck
// @tag:widget-screen-keyboard
//
// Per-widget settings UI for the screen keyboard. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts).

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {iconRow} from '../iconPicker.js';
import {LAYOUTS, parseScript} from './layouts.js';

const DEFAULT_ICON = 'input-keyboard-symbolic';
const SCRIPTS = [
    {id: 'cyrillic', label: `Serbian Cyrillic (${LAYOUTS.cyrillic.shortName})`},
    {id: 'latin', label: `Serbian Latin (${LAYOUTS.latin.shortName})`},
];

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Screen keyboard',
        icon_name: DEFAULT_ICON,
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Button',
        description:
            'Shown as an icon and/or a text label. Leave the text empty for an '
            + 'icon-only button.',
    });
    page.add(group);

    group.add(iconRow({
        current,
        key: 'icon',
        fallback: DEFAULT_ICON,
        title: 'Icon',
        subtitle: 'Button icon, with a searchable picker.',
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

    const keyboardGroup = new Adw.PreferencesGroup({
        title: 'Keyboard',
    });
    page.add(keyboardGroup);

    const scriptRow = new Adw.ComboRow({
        title: 'Script when first opened',
        subtitle: 'The key in the bottom-left corner switches it at any time.',
        model: Gtk.StringList.new(SCRIPTS.map((script) => script.label)),
        selected: Math.max(0, SCRIPTS.findIndex((script) => script.id === parseScript(current.script))),
    });
    scriptRow.connect('notify::selected', () => {
        current.script = (SCRIPTS[scriptRow.get_selected()] ?? SCRIPTS[0]).id;
        commit();
    });
    keyboardGroup.add(scriptRow);
}

// @ts-nocheck
// @tag:widget-clock
//
// Per-widget settings UI for the clock widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {hasMarkup} from './clockMarkup.js';

const DEFAULT_FORMAT = '%H:%M';

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Clock',
        icon_name: 'preferences-system-time-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Time format',
        description:
            'Standard strftime/date template, e.g. %H:%M, '
            + '%a %d %b %H:%M:%S. Common specifiers: %H hour, %M minute, '
            + '%S second, %a weekday, %d day, %b month, %Y year.',
    });
    page.add(group);

    const row = new Adw.EntryRow({
        title: 'Format template',
        text:
            typeof current.format === 'string' && current.format
                ? current.format
                : DEFAULT_FORMAT,
    });
    group.add(row);

    // Font styling is expressed as markup inside the same template rather than
    // as separate bold/italic/colour switches, so a part of the time can be
    // styled differently from the rest (e.g. dim seconds, coloured weekday).
    const hint = new Gtk.Label({
        label:
            'Styling uses a small HTML-like subset: <b>bold</b>, <i>italic</i>, '
            + '<u>underline</u>, <small>/<big> size and '
            + '<span foreground="#ff8800">colour</span>. '
            + 'Example: <b>%H:%M</b><small>:%S</small>. '
            + 'Invalid markup is shown without styling instead of breaking the clock.',
        xalign: 0,
        wrap: true,
        margin_top: 4,
    });
    hint.add_css_class('dim-label');
    group.add(hint);

    // Live preview of the actual current time through the entered template —
    // the quickest way to see both the strftime result and the styling, and the
    // only place an invalid template is reported before it reaches the panel.
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

    // Mirrors the widget's own decision (see clockMarkup.js): a template with no
    // tags is literal text, so a bare `&` or `<` in it is not an error here
    // either — it only would be inside real markup.
    const updatePreview = () => {
        const format = row.get_text() || DEFAULT_FORMAT;
        const rendered =
            GLib.DateTime.new_now_local().format(format) || '';
        if (!hasMarkup(rendered)) {
            preview.remove_css_class('error');
            preview.set_text(rendered);
            return;
        }
        try {
            Pango.parse_markup(rendered, -1, '\0');
            preview.remove_css_class('error');
            preview.set_markup(rendered);
        } catch (error) {
            preview.add_css_class('error');
            preview.set_text(`Invalid markup: ${error?.message ?? error}`);
        }
    };

    row.connect('changed', () => {
        current.format = row.get_text();
        commit();
        updatePreview();
    });
    updatePreview();
}

// @ts-nocheck
// @tag:ui
//
// Shared preferences helper: a searchable icon-chooser row for the clickable
// panel-button widgets (gnome-menu, activities, favorites). It shows the
// currently selected icon as an actual image (not just its mnemonic name) and
// lets the user browse/search the display icon theme or type an arbitrary name.
//
// Runs in the preferences process (GTK/Adw/GDK), never inside GNOME Shell.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

// The icon theme lists thousands of names; never render them all at once.
const MAX_RESULTS = 300;
const MIN_QUERY_LENGTH = 2;

// Best-effort list of icon names from the current display's icon theme.
// Returns [] (never throws) when the display or theme is unavailable.
function iconThemeNames() {
    try {
        const display = Gdk.Display.get_default();
        if (!display)
            return [];
        const theme = Gtk.IconTheme.get_for_display(display);
        if (!theme)
            return [];
        const names = theme.get_icon_names();
        return Array.isArray(names) ? names : [];
    } catch (_error) {
        return [];
    }
}

// Build the ActionRow. `current[key]` is the persisted icon name; `fallback` is
// the widget default shown when nothing is set. `commit()` persists `current`.
export function iconRow({current, key, fallback, title, subtitle, commit}) {
    const selected = () =>
        typeof current[key] === 'string' && current[key].length > 0
            ? current[key]
            : fallback;

    const row = new Adw.ActionRow({
        title: title ?? 'Icon',
        subtitle: subtitle ?? '',
    });

    const preview = new Gtk.Image({
        icon_name: selected(),
        pixel_size: 24,
        valign: Gtk.Align.CENTER,
    });
    row.add_prefix(preview);

    const apply = name => {
        const value = typeof name === 'string' ? name.trim() : '';
        current[key] = value;
        preview.set_from_icon_name(value.length > 0 ? value : fallback);
        commit();
    };

    const choose = new Gtk.Button({
        label: 'Choose…',
        valign: Gtk.Align.CENTER,
    });
    choose.connect('clicked', () => {
        try {
            openChooser(row, selected(), apply);
        } catch (_error) {
            // Never let a chooser failure break the preferences page.
        }
    });
    row.add_suffix(choose);

    return row;
}

// Open a searchable icon chooser as an Adw.Dialog presented on the row's root.
function openChooser(row, initial, apply) {
    const names = iconThemeNames();

    const dialog = new Adw.Dialog({
        title: 'Choose an icon',
        content_width: 480,
        content_height: 520,
    });

    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });

    const search = new Gtk.SearchEntry({
        placeholder_text: 'Search icons…',
        hexpand: true,
    });
    box.append(search);

    const scrolled = new Gtk.ScrolledWindow({
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    });
    const flow = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE,
        homogeneous: true,
        min_children_per_line: 4,
        max_children_per_line: 8,
        row_spacing: 6,
        column_spacing: 6,
        valign: Gtk.Align.START,
    });
    scrolled.set_child(flow);
    box.append(scrolled);

    const status = new Gtk.Label({
        xalign: 0,
        wrap: true,
    });
    status.add_css_class('dim-label');
    box.append(status);

    // Custom-name entry: themes differ, so allow typing any icon name.
    const customRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
    });
    const customEntry = new Gtk.Entry({
        placeholder_text: 'Or type an icon name…',
        hexpand: true,
        text: typeof initial === 'string' ? initial : '',
    });
    const customButton = new Gtk.Button({label: 'Use name'});
    customRow.append(customEntry);
    customRow.append(customButton);
    box.append(customRow);

    const pick = name => {
        apply(name);
        dialog.close();
    };
    customEntry.connect('activate', () => pick(customEntry.get_text()));
    customButton.connect('clicked', () => pick(customEntry.get_text()));

    const clearFlow = () => {
        let child = flow.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            flow.remove(child);
            child = next;
        }
    };

    const render = () => {
        clearFlow();
        const query = search.get_text().trim().toLowerCase();
        if (query.length < MIN_QUERY_LENGTH) {
            status.set_text(
                `Type at least ${MIN_QUERY_LENGTH} characters to search `
                + `${names.length} icons.`
            );
            return;
        }
        let shown = 0;
        for (const name of names) {
            if (!name.toLowerCase().includes(query))
                continue;
            const button = new Gtk.Button({
                has_frame: false,
                tooltip_text: name,
                child: new Gtk.Image({icon_name: name, pixel_size: 32}),
            });
            button.connect('clicked', () => pick(name));
            flow.append(button);
            shown += 1;
            if (shown >= MAX_RESULTS)
                break;
        }
        if (shown === 0)
            status.set_text(`No icons match “${query}”.`);
        else if (shown >= MAX_RESULTS)
            status.set_text(`Showing the first ${MAX_RESULTS} matches; refine the search.`);
        else
            status.set_text(`${shown} match${shown === 1 ? '' : 'es'}.`);
    };

    search.connect('search-changed', render);
    render();

    dialog.set_child(box);

    const root = row.get_root();
    if (root && typeof dialog.present === 'function')
        dialog.present(root);
    else if (typeof dialog.present === 'function')
        dialog.present(null);
}

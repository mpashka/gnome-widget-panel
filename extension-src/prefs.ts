// @ts-nocheck
// @tag:ui
// @tag:mechanism
//
// Preferences UI for the widget panel. Lets the user enable, reorder (by mouse
// drag), add, remove and configure widgets. It edits `widgets.json` through
// `configStore` (the single source of truth) and never keeps a second settings
// model. Adding a widget and configuring a widget both open in-window subpages
// (`push_subpage`/`pop_subpage`) rather than dialogs or popovers.
// See ../docs/preferences.md.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {loadWidgetConfig, saveWidgetConfig} from './configStore.js';
import {DESCRIPTORS_BY_ID, PLUGIN_DESCRIPTORS} from './plugins/registry.js';
import * as SystemInfo from './systemInfo.js';

// Panel alignment bitfield, mirrored from controlButton.ts / extension.ts.
const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

// Auto-position presets offered in the position group. The first entry keeps
// the exact dragged position (no snapping); the rest mirror the six presets the
// old control-button menu had. Each value is an `aligned` bitfield.
const ALIGN_PRESETS = [
    {label: 'Floating (keep position)', value: Alignment.NONE},
    {label: 'Top - Start', value: Alignment.TOP | Alignment.LEFT},
    {label: 'Top - Center', value: Alignment.TOP | Alignment.CENTER},
    {label: 'Top - End', value: Alignment.TOP | Alignment.RIGHT},
    {label: 'Bottom - Start', value: Alignment.BOTTOM | Alignment.LEFT},
    {label: 'Bottom - Center', value: Alignment.BOTTOM | Alignment.CENTER},
    {label: 'Bottom - End', value: Alignment.BOTTOM | Alignment.RIGHT},
];

export default class WidgetPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const state = {config: loadWidgetConfig(this.path)};

        // Everything lives on a single page: the configured widgets, an add
        // affordance below them, then the panel-level position and orientation
        // settings.
        const page = new Adw.PreferencesPage({
            title: 'Widgets',
            icon_name: 'view-grid-symbolic',
        });
        window.add(page);

        const configuredGroup = new Adw.PreferencesGroup({
            title: 'Panel widgets',
            description:
                'Drag the handle to reorder, toggle to enable, configure or ' +
                'remove widgets. Changes are saved to widgets.json; reload GNOME ' +
                'Shell (log out and back in on Wayland) to apply them.',
        });
        page.add(configuredGroup);

        // The "+" add affordance now lives in its own group *below* the list
        // (instead of the group header). Activating it pushes an in-window
        // "Add a widget" subpage rather than opening a menu/popover.
        const addGroup = new Adw.PreferencesGroup();
        page.add(addGroup);

        const addRow = new Adw.ButtonRow({
            title: 'Add a widget…',
            start_icon_name: 'list-add-symbolic',
        });
        addGroup.add(addRow);

        const rebuild = () => {
            this._rebuildConfigured(window, state, configuredGroup, rebuild);
        };
        addRow.connect('activated', () =>
            this._openAddWidgetSubpage(window, state, rebuild)
        );
        rebuild();

        this._addPanelGroups(page);
        this._addAboutGroup(page);
    }

    // "About" group at the bottom of the main page: extension name + version
    // with a link to the repository, plus rows that open prefilled GitHub issue
    // forms (bug report / feature request) and the roadmap. Opening URLs and
    // building them is delegated to the shared `systemInfo` helper, which runs in
    // this preferences process too.
    _addAboutGroup(page) {
        const version = this.metadata?.version ?? 'unknown';
        const name = this.metadata?.name ?? 'GNOME Widget Panel';

        const aboutGroup = new Adw.PreferencesGroup({
            title: 'About',
            description:
                'Report bugs, suggest features and follow the roadmap on ' +
                'GitHub. Roadmap voting is via GitHub reactions.',
        });
        page.add(aboutGroup);

        // Name + version, opens the repository.
        const versionRow = new Adw.ActionRow({
            title: name,
            subtitle: `Version ${version}`,
            activatable: true,
        });
        versionRow.add_suffix(
            this._linkButton('adw-external-link-symbolic', 'Open repository', () =>
                SystemInfo.openUrl(SystemInfo.repoUrl)
            )
        );
        versionRow.connect('activated', () =>
            SystemInfo.openUrl(SystemInfo.repoUrl)
        );
        aboutGroup.add(versionRow);

        // Report a bug (prefilled with system info).
        aboutGroup.add(
            this._aboutLinkRow(
                'Report a bug',
                'Opens a prefilled GitHub issue with your system information.',
                () => SystemInfo.openUrl(SystemInfo.bugReportUrl())
            )
        );

        // Suggest a feature.
        aboutGroup.add(
            this._aboutLinkRow(
                'Suggest a feature',
                'Opens a GitHub feature-request form.',
                () => SystemInfo.openUrl(SystemInfo.featureRequestUrl())
            )
        );

        // Roadmap.
        aboutGroup.add(
            this._aboutLinkRow(
                'Roadmap',
                'Browse planned work and vote with GitHub reactions.',
                () => SystemInfo.openUrl(SystemInfo.roadmapUrl)
            )
        );
    }

    // A clickable Adw.ActionRow that opens a URL (via `onActivate`) with an
    // external-link suffix button, used for the About group's action rows.
    _aboutLinkRow(title, subtitle, onActivate) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
            activatable: true,
        });
        row.add_suffix(
            this._linkButton('adw-external-link-symbolic', title, onActivate)
        );
        row.connect('activated', () => onActivate());
        return row;
    }

    _linkButton(iconName, tooltip, onClick) {
        const button = new Gtk.Button({
            icon_name: iconName,
            tooltip_text: tooltip,
            valign: Gtk.Align.CENTER,
        });
        button.add_css_class('flat');
        button.connect('clicked', () => onClick());
        return button;
    }

    // Panel-level settings that used to live in the control button context menu
    // (auto-position preset + orientation). They are stored in the panel
    // GSettings and applied live by FloatingMiniPanel. Folded into the single
    // preferences page.
    _addPanelGroups(page) {
        const settings = this.getSettings();

        const positionGroup = new Adw.PreferencesGroup({
            title: 'Auto position',
            description:
                'Snap the floating panel to a fixed screen position. ' +
                'Applies immediately to the running panel.',
        });
        page.add(positionGroup);

        const model = new Gtk.StringList();
        for (const preset of ALIGN_PRESETS)
            model.append(preset.label);

        const alignedRow = new Adw.ComboRow({
            title: 'Position',
            subtitle: 'Where the panel snaps to on screen.',
            model,
        });

        const syncSelected = () => {
            const current = settings.get_int('aligned');
            const index = ALIGN_PRESETS.findIndex(
                (preset) => preset.value === current
            );
            // `aligned === 0` matches the Floating preset (first entry).
            // Gtk.INVALID_LIST_POSITION when the stored value is some other
            // custom drag position that matches no preset; leave it unselected.
            alignedRow.selected =
                index >= 0 ? index : Gtk.INVALID_LIST_POSITION;
        };
        syncSelected();

        alignedRow.connect('notify::selected', () => {
            const index = alignedRow.selected;
            if (index < 0 || index >= ALIGN_PRESETS.length)
                return;
            const value = ALIGN_PRESETS[index].value;
            if (settings.get_int('aligned') !== value)
                settings.set_int('aligned', value);
        });
        // Reflect external changes (e.g. dragging the panel) back into the row.
        const alignedChangedId = settings.connect(
            'changed::aligned',
            syncSelected
        );
        alignedRow.connect('destroy', () =>
            settings.disconnect(alignedChangedId)
        );
        positionGroup.add(alignedRow);

        const orientationGroup = new Adw.PreferencesGroup({
            title: 'Orientation',
        });
        page.add(orientationGroup);

        const verticalRow = new Adw.SwitchRow({
            title: 'Vertical orientation',
            subtitle: 'Lay the panel out as a vertical strip.',
        });
        settings.bind(
            'vertical',
            verticalRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        orientationGroup.add(verticalRow);
    }

    _persist(state, rebuild) {
        saveWidgetConfig(state.config);
        rebuild();
    }

    _rebuildConfigured(window, state, group, rebuild) {
        for (const row of group._rows ?? [])
            group.remove(row);
        group._rows = [];

        const plugins = state.config.plugins;
        plugins.forEach((item, index) => {
            const descriptor = DESCRIPTORS_BY_ID.get(item.id);
            const row = new Adw.ActionRow({
                title: descriptor?.label ?? item.id,
                subtitle: descriptor
                    ? descriptor.description
                    : 'Unknown widget id (kept but not loaded).',
            });

            // Drag-to-reorder: a visible handle prefix plus a DragSource that
            // carries this row's index and a DropTarget that moves the dragged
            // plugin to this row's position. Mirrors GNOME's search/extension
            // reorderable lists.
            const handle = new Gtk.Image({
                icon_name: 'list-drag-handle-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Drag to reorder',
            });
            handle.add_css_class('dim-label');
            row.add_prefix(handle);
            this._attachRowDnd(row, index, state, rebuild);

            if (descriptor?.hasPreferences) {
                const settings = this._iconButton(
                    'emblem-system-symbolic',
                    'Widget settings'
                );
                settings.connect('clicked', () =>
                    this._openWidgetPreferences(window, state, item, rebuild)
                );
                row.add_suffix(settings);
            }

            const remove = this._iconButton('user-trash-symbolic', 'Remove');
            remove.add_css_class('flat');
            remove.connect('clicked', () => {
                plugins.splice(index, 1);
                this._persist(state, rebuild);
            });
            row.add_suffix(remove);

            const enabled = new Gtk.Switch({
                active: item.enabled,
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Enabled',
            });
            enabled.connect('notify::active', () => {
                item.enabled = enabled.active;
                this._persist(state, rebuild);
            });
            row.add_suffix(enabled);
            row.activatable_widget = enabled;

            group.add(row);
            group._rows.push(row);
        });

        if (plugins.length === 0) {
            const empty = new Adw.ActionRow({
                title: 'No widgets configured',
                subtitle: 'Add one with the button below.',
            });
            group.add(empty);
            group._rows.push(empty);
        }
    }

    // Wire Gtk4 drag-and-drop reordering onto a configured-widget row.
    // The DragSource ships the source index as a boxed G_TYPE_INT value; the
    // DropTarget accepts the same type and, on drop, moves the plugin from the
    // source index to this row's index, persists and rebuilds the list.
    _attachRowDnd(row, index, state, rebuild) {
        const dragSource = new Gtk.DragSource({
            actions: Gdk.DragAction.MOVE,
        });
        dragSource.connect('prepare', () => {
            const value = new GObject.Value();
            value.init(GObject.TYPE_INT);
            value.set_int(index);
            return Gdk.ContentProvider.new_for_value(value);
        });
        // Fade the source row while it is being dragged.
        dragSource.connect('drag-begin', () => row.add_css_class('dnd-source'));
        dragSource.connect('drag-end', () => row.remove_css_class('dnd-source'));
        row.add_controller(dragSource);

        const dropTarget = Gtk.DropTarget.new(
            GObject.TYPE_INT,
            Gdk.DragAction.MOVE
        );
        dropTarget.connect('drop', (_target, sourceIndex) => {
            if (typeof sourceIndex !== 'number' || sourceIndex === index)
                return false;
            const plugins = state.config.plugins;
            if (sourceIndex < 0 || sourceIndex >= plugins.length)
                return false;
            const [moved] = plugins.splice(sourceIndex, 1);
            plugins.splice(index, 0, moved);
            this._persist(state, rebuild);
            return true;
        });
        row.add_controller(dropTarget);
    }

    // Push an in-window "Add a widget" subpage listing the widgets not yet in
    // the config. Rebuilt from the current config every time it is opened, so an
    // already-added widget can never appear. Activating a row appends the widget
    // (persisting + rebuilding the main list) and pops back to it.
    _openAddWidgetSubpage(window, state, rebuild) {
        const present = new Set(state.config.plugins.map((item) => item.id));
        const available = PLUGIN_DESCRIPTORS.filter(
            (descriptor) => !present.has(descriptor.id)
        );

        const content = new Adw.PreferencesPage();

        // "Request a widget…" opens a prefilled GitHub widget-request issue form
        // so users can ask for a widget that does not exist yet.
        const requestGroup = new Adw.PreferencesGroup();
        const requestRow = new Adw.ActionRow({
            title: 'Request a widget…',
            subtitle: "Missing a widget? Open a request on GitHub.",
            activatable: true,
        });
        requestRow.add_prefix(
            new Gtk.Image({
                icon_name: 'chat-message-new-symbolic',
                valign: Gtk.Align.CENTER,
            })
        );
        requestRow.add_suffix(
            new Gtk.Image({
                icon_name: 'adw-external-link-symbolic',
                valign: Gtk.Align.CENTER,
            })
        );
        requestRow.connect('activated', () =>
            SystemInfo.openUrl(SystemInfo.widgetRequestUrl())
        );
        requestGroup.add(requestRow);
        content.add(requestGroup);

        if (available.length === 0) {
            const group = new Adw.PreferencesGroup({title: 'Available widgets'});
            group.add(
                new Adw.ActionRow({
                    title: 'All widgets added',
                    subtitle: 'Every known widget is already in the panel.',
                })
            );
            content.add(group);
            window.push_subpage(this._subpage('Add a widget', content));
            return;
        }

        // Search field filtering the available-widget rows by name/description.
        const search = new Gtk.SearchEntry({
            placeholder_text: 'Search widgets',
            hexpand: true,
        });
        const searchGroup = new Adw.PreferencesGroup();
        searchGroup.add(search);
        content.add(searchGroup);

        const group = new Adw.PreferencesGroup({title: 'Available widgets'});
        content.add(group);

        const rows = [];
        for (const descriptor of available) {
            const row = new Adw.ActionRow({
                title: descriptor.label,
                subtitle: descriptor.description,
                activatable: true,
            });
            row.add_prefix(
                new Gtk.Image({
                    icon_name: 'list-add-symbolic',
                    valign: Gtk.Align.CENTER,
                })
            );
            row.add_suffix(
                new Gtk.Image({
                    icon_name: 'go-next-symbolic',
                    valign: Gtk.Align.CENTER,
                })
            );
            row.connect('activated', () => {
                state.config.plugins.push({id: descriptor.id, enabled: true});
                this._persist(state, rebuild);
                window.pop_subpage();
            });
            group.add(row);
            rows.push({
                row,
                haystack: `${descriptor.label} ${descriptor.description} ${descriptor.id}`.toLowerCase(),
            });
        }

        search.connect('search-changed', () => {
            const query = search.get_text().trim().toLowerCase();
            for (const {row, haystack} of rows)
                row.visible = query === '' || haystack.includes(query);
        });

        window.push_subpage(this._subpage('Add a widget', content));
    }

    // Open a widget's own settings as an in-window subpage (no dialog). A shim
    // object is passed as `context.window`: its `.add(page)` routes the widget's
    // `Adw.PreferencesPage` into the subpage's content area, keeping the widget
    // prefs contract (`context.window.add(page)` + `context.save(options)`)
    // unchanged. The lazy `descriptor.loadPreferences()` import stays.
    _openWidgetPreferences(window, state, item, rebuild) {
        const descriptor = DESCRIPTORS_BY_ID.get(item.id);
        if (!descriptor?.loadPreferences)
            return;

        descriptor
            .loadPreferences()
            .then((module) => {
                const toolbar = new Adw.ToolbarView();
                toolbar.add_top_bar(new Adw.HeaderBar());

                // Shim standing in for the Adw.PreferencesWindow/Dialog the
                // widget expects: it only needs `.add(page)`.
                const shim = {
                    add: (widgetPage) => toolbar.set_content(widgetPage),
                };

                module.fillWidgetPreferences({
                    window: shim,
                    options: {...(item.options ?? {})},
                    save: (options) => {
                        item.options = options;
                        this._persist(state, rebuild);
                    },
                });

                const navPage = new Adw.NavigationPage({
                    title: descriptor.label,
                    child: toolbar,
                });
                window.push_subpage(navPage);
            })
            .catch((error) => {
                logError(error, `Cannot open settings for widget ${item.id}`);
            });
    }

    // Wrap a content widget in an Adw.NavigationPage with a ToolbarView +
    // HeaderBar so the pushed subpage gets a title and a working back button.
    _subpage(title, content) {
        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(new Adw.HeaderBar());
        toolbar.set_content(content);
        return new Adw.NavigationPage({title, child: toolbar});
    }

    _iconButton(iconName, tooltip) {
        return new Gtk.Button({
            icon_name: iconName,
            tooltip_text: tooltip,
            valign: Gtk.Align.CENTER,
        });
    }
}

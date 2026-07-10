// @ts-nocheck
// @tag:ui
// @tag:mechanism
//
// Preferences UI for the widget panel. Lets the user enable, reorder (by mouse
// drag), add, remove and configure widgets. It edits the `widgets` GSettings
// key (a JSON document) through `configStore` (the single source of truth) and
// never keeps a second settings model. Adding a widget and configuring a widget both open in-window subpages
// (`push_subpage`/`pop_subpage`) rather than dialogs or popovers.
// See ../docs/preferences.md.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {loadWidgetConfig, saveWidgetConfig} from './configStore.js';
import {DESCRIPTORS_BY_ID, PLUGIN_DESCRIPTORS} from './plugins/registry.js';
import * as SystemInfo from './systemInfo.js';
import {RELEASE_CHANNEL} from './version.js';

// Panel alignment bitfield, mirrored from controlButton.ts / extension.ts.
const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

// UUID of the standalone "Hide Top Bar" extension. Our built-in main-panel
// control reimplements it, so the two must not run at once (see
// _addMainPanelGroup / mainPanel.ts).
const HIDE_TOP_BAR_UUID = 'hidetopbar@mathieu.bidon.ca';

// The `main-panel` enum, in nick order (index == enum value). Short labels show
// in the collapsed combo row; the long descriptions only in the open dropdown.
const MAIN_PANEL_MODES = [
    {
        nick: 'visible',
        label: 'Visible',
        long: 'Always show the GNOME top bar (do not touch it).',
    },
    {
        nick: 'autohide',
        label: 'Auto hide',
        long: 'Hide the top bar; slide it in when the pointer reaches the top edge or in the overview.',
    },
    {
        nick: 'hide',
        label: 'Hidden',
        long: 'Keep the top bar hidden.',
    },
];

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

function logPanelSettingWrite(key, value) {
    log(`widget-panel prefs: setting ${key} -> ${value}`);
}

export default class WidgetPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // All configuration lives in GSettings: the widget list/options in the
        // `widgets` JSON key (via configStore) and panel-level keys alongside.
        const settings = this.getSettings();
        const state = {settings, config: loadWidgetConfig(settings)};

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
                'remove widgets. Changes apply to the running panel immediately.',
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
        this._addMainPanelGroup(page);
        this._addAboutGroup(page);
    }

    // Detect the standalone "Hide Top Bar" extension. `enabled` means it is
    // actively controlling the top bar right now (real conflict); `installed`
    // means it is still present on disk (user should remove it). Read from the
    // shell's own GSettings + the extension directories, since the preferences
    // process has no ExtensionManager.
    _hideTopBarStatus() {
        let enabledList = [];
        let disabledList = [];
        let masterOff = false;
        try {
            const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
            enabledList = shell.get_strv('enabled-extensions');
            disabledList = shell.get_strv('disabled-extensions');
            masterOff = shell.get_boolean('disable-user-extensions');
        } catch (e) {
            // org.gnome.shell schema unavailable; treat as not present.
        }
        const onDisk = [
            GLib.build_filenamev([
                GLib.get_home_dir(),
                '.local/share/gnome-shell/extensions',
                HIDE_TOP_BAR_UUID,
            ]),
            `/usr/share/gnome-shell/extensions/${HIDE_TOP_BAR_UUID}`,
        ].some((p) => Gio.File.new_for_path(p).query_exists(null));

        const enabled =
            !masterOff &&
            enabledList.includes(HIDE_TOP_BAR_UUID) &&
            !disabledList.includes(HIDE_TOP_BAR_UUID);
        const installed =
            onDisk ||
            enabledList.includes(HIDE_TOP_BAR_UUID) ||
            disabledList.includes(HIDE_TOP_BAR_UUID);
        return {enabled, installed};
    }

    // "Main panel" group: a three-way combo (Visible / Auto hide / Hidden) for
    // the GNOME top bar, backed by the `main-panel` GSettings enum and applied
    // live by the MainPanelController. When the standalone "Hide Top Bar"
    // extension is present it shows a banner (and disables the row while that
    // extension is actively controlling the bar, to avoid two controllers
    // fighting over it).
    _addMainPanelGroup(page) {
        const settings = this.getSettings();
        const group = new Adw.PreferencesGroup({
            title: 'Main panel (top bar)',
            description:
                'Hide or auto-hide the GNOME Shell top bar. Built-in ' +
                'replacement for the “Hide Top Bar” extension; applies ' +
                'immediately to the running shell.',
        });
        page.add(group);

        const {enabled: htbEnabled, installed: htbInstalled} =
            this._hideTopBarStatus();

        if (htbInstalled) {
            const warn = new Adw.ActionRow({
                title: htbEnabled
                    ? 'Hide Top Bar is enabled'
                    : 'Hide Top Bar is still installed',
                subtitle: htbEnabled
                    ? 'It already controls the top bar. Disable or remove it ' +
                      'to use this setting — otherwise the two conflict.'
                    : 'This widget now provides the same feature. You can ' +
                      'remove the “Hide Top Bar” extension.',
            });
            warn.add_prefix(
                new Gtk.Image({
                    icon_name: 'dialog-warning-symbolic',
                    valign: Gtk.Align.CENTER,
                })
            );
            warn.add_css_class(htbEnabled ? 'error' : 'warning');
            group.add(warn);
        }

        const shortLabels = MAIN_PANEL_MODES.map((m) => m.label);
        const model = Gtk.StringList.new(shortLabels);
        const row = new Adw.ComboRow({
            title: 'Top-bar behaviour',
            model,
        });

        // Dropdown-only factory showing the long descriptions (the collapsed row
        // keeps the short StringList label). Mirrors the orientation row.
        const listFactory = new Gtk.SignalListItemFactory();
        listFactory.connect('setup', (_f, item) => {
            item.set_child(new Gtk.Label({xalign: 0}));
        });
        listFactory.connect('bind', (_f, item) => {
            const pos = item.get_position();
            item.get_child().set_label(MAIN_PANEL_MODES[pos]?.long ?? '');
        });
        row.list_factory = listFactory;

        // While Hide Top Bar is actively controlling the bar, our setting is
        // meaningless (the controller stands down), so disable the row.
        row.sensitive = !htbEnabled;

        const readIndex = () => {
            const nick = settings.get_string('main-panel');
            const index = MAIN_PANEL_MODES.findIndex((m) => m.nick === nick);
            return index >= 0 ? index : 0;
        };
        // Programmatic `selected` writes re-fire `notify::selected`; guard so
        // only a genuine user selection writes the setting.
        let syncing = false;
        const sync = () => {
            syncing = true;
            try {
                row.selected = readIndex();
            } finally {
                syncing = false;
            }
        };
        sync();

        row.connect('notify::selected', () => {
            if (syncing)
                return;
            const index = row.selected;
            if (index < 0 || index >= MAIN_PANEL_MODES.length)
                return;
            const nick = MAIN_PANEL_MODES[index].nick;
            if (settings.get_string('main-panel') !== nick) {
                logPanelSettingWrite('main-panel', nick);
                settings.set_string('main-panel', nick);
            }
        });
        const changedId = settings.connect('changed::main-panel', sync);
        row.connect('destroy', () => settings.disconnect(changedId));
        group.add(row);
    }

    // "About" group at the bottom of the main page: extension name + version
    // with a link to the repository, plus rows that open prefilled GitHub issue
    // forms (bug report / feature request) and the roadmap. Opening URLs and
    // building them is delegated to the shared `systemInfo` helper, which runs in
    // this preferences process too.
    _addAboutGroup(page) {
        const version =
            this.metadata?.['version-name'] ??
            this.metadata?.version ??
            'unknown';
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
        // Pre-release channel badge (e.g. "alpha"). Uses libadwaita's built-in
        // accent/caption style classes so it renders as a small coloured tag
        // without needing custom CSS loaded into the prefs process. Absent for a
        // stable release (RELEASE_CHANNEL === '').
        if (RELEASE_CHANNEL) {
            const badge = new Gtk.Label({
                label: RELEASE_CHANNEL,
                valign: Gtk.Align.CENTER,
            });
            badge.add_css_class('caption-heading');
            badge.add_css_class('accent');
            versionRow.add_suffix(badge);
        }
        // The version row links to *this version's* release notes page (the
        // GitHub Release for the running version; the version is in its URL).
        versionRow.add_suffix(
            this._linkButton(
                'adw-external-link-symbolic',
                'Open release notes',
                () => SystemInfo.openUrl(SystemInfo.releaseNotesUrl())
            )
        );
        versionRow.connect('activated', () =>
            SystemInfo.openUrl(SystemInfo.releaseNotesUrl())
        );
        aboutGroup.add(versionRow);

        // All releases + the GNOME Shell support matrix (which plugin version to
        // install for a given GNOME version).
        aboutGroup.add(
            this._aboutLinkRow(
                'All releases & GNOME support',
                'Every release, with a GNOME Shell version → plugin version table.',
                () => SystemInfo.openUrl(SystemInfo.changelogUrl)
            )
        );

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

        // One "Panel layout" group holds both the snap position and the
        // orientation. Applied immediately to the running panel.
        const layoutGroup = new Adw.PreferencesGroup({
            title: 'Panel layout',
            description:
                'Where the floating panel snaps to and how it is laid out. ' +
                'Applies immediately to the running panel.',
        });
        page.add(layoutGroup);

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
            if (settings.get_int('aligned') !== value) {
                logPanelSettingWrite('aligned', value);
                settings.set_int('aligned', value);
            }
        });
        // Reflect external changes (e.g. dragging the panel) back into the row.
        const alignedChangedId = settings.connect(
            'changed::aligned',
            syncSelected
        );
        alignedRow.connect('destroy', () =>
            settings.disconnect(alignedChangedId)
        );
        layoutGroup.add(alignedRow);

        // A single `orientation` enum setting with three values (index == nick):
        //   0 horizontal, 1 left, 2 right  ('left'/'right' = which way the graphs
        // rotate when the panel is a vertical strip). Short labels for the
        // collapsed row (so the value is not ellipsized); long, descriptive
        // labels only in the open dropdown.
        const ORIENTATION_NICKS = ['horizontal', 'left', 'right'];
        const orientationShort = ['Horizontal', 'Vertical left', 'Vertical right'];
        const orientationLong = [
            'Horizontal strip',
            'Vertical — graphs rotate left (time bottom→top)',
            'Vertical — graphs rotate right (time top→bottom)',
        ];
        const orientationModel = Gtk.StringList.new(orientationShort);
        const orientationRow = new Adw.ComboRow({
            title: 'Orientation',
            model: orientationModel,
        });
        // Dropdown-only factory showing the long descriptions (the selected value
        // shown in the row keeps the short StringList label).
        const orientationListFactory = new Gtk.SignalListItemFactory();
        orientationListFactory.connect('setup', (_f, item) => {
            item.set_child(new Gtk.Label({xalign: 0}));
        });
        orientationListFactory.connect('bind', (_f, item) => {
            const pos = item.get_position();
            item.get_child().set_label(orientationLong[pos] ?? '');
        });
        orientationRow.list_factory = orientationListFactory;

        const readOrientationIndex = () =>
            Math.max(0, ORIENTATION_NICKS.indexOf(settings.get_string('orientation')));
        // Programmatic `selected` writes re-fire `notify::selected`; guard so only
        // a genuine user selection writes the setting.
        this._syncingOrientation = false;
        const syncOrientation = () => {
            this._syncingOrientation = true;
            try {
                orientationRow.selected = readOrientationIndex();
            } finally {
                this._syncingOrientation = false;
            }
        };
        syncOrientation();

        orientationRow.connect('notify::selected', () => {
            if (this._syncingOrientation)
                return;
            const index = orientationRow.selected;
            if (index < 0 || index > 2)
                return;
            const nick = ORIENTATION_NICKS[index];
            if (settings.get_string('orientation') !== nick) {
                logPanelSettingWrite('orientation', nick);
                settings.set_string('orientation', nick);
            }
        });
        const orientationChangedId = settings.connect(
            'changed::orientation',
            syncOrientation
        );
        orientationRow.connect('destroy', () => {
            settings.disconnect(orientationChangedId);
        });
        layoutGroup.add(orientationRow);

        // Content padding: space (px) around the widgets' working body.
        const paddingRow = new Adw.SpinRow({
            title: 'Content padding',
            subtitle: 'Space in pixels around the widgets.',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 40,
                step_increment: 1,
                value: settings.get_int('content-padding'),
            }),
        });
        let syncingPadding = false;
        const syncPadding = () => {
            syncingPadding = true;
            try {
                paddingRow.value = settings.get_int('content-padding');
            } finally {
                syncingPadding = false;
            }
        };
        const paddingChangedId = settings.connect(
            'changed::content-padding',
            syncPadding
        );
        paddingRow.connect('notify::value', () => {
            if (syncingPadding)
                return;
            const value = Math.round(paddingRow.value);
            if (settings.get_int('content-padding') !== value) {
                logPanelSettingWrite('content-padding', value);
                settings.set_int('content-padding', value);
            }
        });
        paddingRow.connect('destroy', () =>
            settings.disconnect(paddingChangedId)
        );
        layoutGroup.add(paddingRow);
    }

    _persist(state, rebuild) {
        saveWidgetConfig(state.settings, state.config);
        rebuild();
    }

    _rebuildConfigured(window, state, group, rebuild) {
        for (const row of group._rows ?? [])
            group.remove(row);
        group._rows = [];

        const plugins = state.config.plugins;
        plugins.forEach((item, index) => {
            const descriptor = DESCRIPTORS_BY_ID.get(item.id);
            // Prefer a per-instance summary of the options (e.g. the selected
            // Gnome Action) over the generic description, so multiple instances
            // are distinguishable in the list.
            let subtitle = 'Unknown widget id (kept but not loaded).';
            if (descriptor) {
                subtitle = descriptor.description;
                if (typeof descriptor.summary === 'function') {
                    try {
                        const s = descriptor.summary(item.options ?? {});
                        if (s)
                            subtitle = s;
                    } catch (e) {
                        // fall back to description
                    }
                }
            }
            const row = new Adw.ActionRow({
                title: descriptor?.label ?? item.id,
                subtitle,
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
        // A descriptor stays available (addable) if it is not already in the
        // config, OR if it is a multi-instance widget (which may appear any
        // number of times, so it never leaves the "Add a widget" list).
        const present = new Set(state.config.plugins.map((item) => item.id));
        const available = PLUGIN_DESCRIPTORS.filter(
            (descriptor) =>
                !present.has(descriptor.id) || descriptor.multiInstance
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
                        // Persist only; do NOT rebuild the main list here. A
                        // widget's option change does not alter the list rows,
                        // and rebuilding resets the main page's scroll position
                        // (which then shows at the top when the subpage is
                        // popped). The running panel live-reloads from the file.
                        saveWidgetConfig(state.settings, state.config);
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

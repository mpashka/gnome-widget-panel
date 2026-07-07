// @ts-nocheck
// @tag:ui
// @tag:mechanism
//
// Preferences UI for the widget panel. Lets the user enable, reorder, add,
// remove and configure widgets. It edits `widgets.json` through `configStore`
// (the single source of truth) and never keeps a second settings model.
// See ../docs/preferences.md.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {loadWidgetConfig, saveWidgetConfig} from './configStore.js';
import {DESCRIPTORS_BY_ID, PLUGIN_DESCRIPTORS} from './plugins/registry.js';

// Panel alignment bitfield, mirrored from controlButton.ts / extension.ts.
const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

// Auto-position presets offered on the Panel page, mirroring the six presets
// the old control-button menu had. Each value is an `aligned` bitfield.
const ALIGN_PRESETS = [
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

        const page = new Adw.PreferencesPage({
            title: 'Widgets',
            icon_name: 'view-grid-symbolic',
        });
        window.add(page);

        const configuredGroup = new Adw.PreferencesGroup({
            title: 'Panel widgets',
            description:
                'Enable, reorder, configure or remove widgets. Changes are saved ' +
                'to widgets.json; reload GNOME Shell (log out and back in on ' +
                'Wayland) to apply them.',
        });
        page.add(configuredGroup);

        const availableGroup = new Adw.PreferencesGroup({
            title: 'Add a widget',
            description: 'Widgets that are not in the panel yet.',
        });
        page.add(availableGroup);

        const rebuild = () => {
            this._rebuildConfigured(window, state, configuredGroup, rebuild);
            this._rebuildAvailable(state, availableGroup, rebuild);
        };
        rebuild();

        this._addPanelPage(window);
    }

    // "Panel" page: panel-level settings that used to live in the control
    // button context menu (auto-position preset + orientation). They are stored
    // in the panel GSettings and applied live by FloatingMiniPanel.
    _addPanelPage(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Panel',
            icon_name: 'view-restore-symbolic',
        });
        window.add(page);

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
            // Gtk.INVALID_LIST_POSITION when the stored value is a custom drag
            // position that matches no preset; leave the combo unselected.
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

            const moveUp = this._iconButton('go-up-symbolic', 'Move up');
            moveUp.sensitive = index > 0;
            moveUp.connect('clicked', () => {
                this._swap(plugins, index, index - 1);
                this._persist(state, rebuild);
            });
            row.add_prefix(moveUp);

            const moveDown = this._iconButton('go-down-symbolic', 'Move down');
            moveDown.sensitive = index < plugins.length - 1;
            moveDown.connect('clicked', () => {
                this._swap(plugins, index, index + 1);
                this._persist(state, rebuild);
            });
            row.add_prefix(moveDown);

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
                subtitle: 'Add one from the list below.',
            });
            group.add(empty);
            group._rows.push(empty);
        }
    }

    _rebuildAvailable(state, group, rebuild) {
        for (const row of group._rows ?? [])
            group.remove(row);
        group._rows = [];

        const present = new Set(state.config.plugins.map((item) => item.id));
        const available = PLUGIN_DESCRIPTORS.filter(
            (descriptor) => !present.has(descriptor.id)
        );

        group.visible = available.length > 0;
        for (const descriptor of available) {
            const row = new Adw.ActionRow({
                title: descriptor.label,
                subtitle: descriptor.description,
            });
            const add = this._iconButton('list-add-symbolic', 'Add widget');
            add.add_css_class('flat');
            add.connect('clicked', () => {
                state.config.plugins.push({id: descriptor.id, enabled: true});
                this._persist(state, rebuild);
            });
            row.add_suffix(add);
            row.activatable_widget = add;
            group.add(row);
            group._rows.push(row);
        }
    }

    _openWidgetPreferences(window, state, item, rebuild) {
        const descriptor = DESCRIPTORS_BY_ID.get(item.id);
        if (!descriptor?.loadPreferences)
            return;

        descriptor
            .loadPreferences()
            .then((module) => {
                const dialog = new Adw.PreferencesDialog({
                    title: descriptor.label,
                });
                module.fillWidgetPreferences({
                    window: dialog,
                    options: {...(item.options ?? {})},
                    save: (options) => {
                        item.options = options;
                        this._persist(state, rebuild);
                    },
                });
                dialog.present(window);
            })
            .catch((error) => {
                logError(error, `Cannot open settings for widget ${item.id}`);
            });
    }

    _iconButton(iconName, tooltip) {
        return new Gtk.Button({
            icon_name: iconName,
            tooltip_text: tooltip,
            valign: Gtk.Align.CENTER,
        });
    }

    _swap(list, a, b) {
        if (b < 0 || b >= list.length)
            return;
        [list[a], list[b]] = [list[b], list[a]];
    }
}

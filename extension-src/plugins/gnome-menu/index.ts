// @ts-nocheck
// @tag:widget-gnome-menu
//
// Panel button owning a two-column applications menu (like the XFCE Whisker
// menu): a LEFT column of category names and a RIGHT column showing the apps of
// the currently selected category. Categories are a "Favorites" entry (from the
// org.gnome.shell favorite-apps gsetting) followed by the freedesktop top-level
// categories that actually have installed apps.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {buildButtonContent} from '../panelButtonContent.js';

// `start-here-symbolic` is the distributor "start menu" icon (the Ubuntu logo on
// Ubuntu), matching a Windows-Start-style applications button.
const DEFAULTS = {icon: 'start-here-symbolic', text: ''};

// Freedesktop top-level categories we bucket apps into, in priority order: the
// first entry whose key is present in an app's `Categories` string wins. Apps
// with no matching category fall into the "Other" bucket, which is always last.
const CATEGORY_MAP = [
    ['AudioVideo', 'Audio & Video'],
    ['Development', 'Development'],
    ['Education', 'Education'],
    ['Game', 'Games'],
    ['Graphics', 'Graphics'],
    ['Network', 'Internet'],
    ['Office', 'Office'],
    ['Science', 'Science'],
    ['Settings', 'Settings'],
    ['System', 'System'],
    ['Utility', 'Accessories'],
];

const OTHER_CATEGORY = 'Other';
const FAVORITES_CATEGORY = 'Favorites';
const FALLBACK_ICON = 'application-x-executable-symbolic';

// Resolve an app's display category from its `Categories` string (a possibly
// null, `;`-separated list). Returns the first matching mapped label by
// priority, or "Other" when nothing matches.
function categoryFor(categoriesString) {
    if (!categoriesString)
        return OTHER_CATEGORY;
    const present = new Set(
        categoriesString.split(';').filter(part => part.length > 0)
    );
    for (const [key, label] of CATEGORY_MAP) {
        if (present.has(key))
            return label;
    }
    return OTHER_CATEGORY;
}

// Read the user's favorite apps (org.gnome.shell `favorite-apps`), resolving
// each id to a launchable entry. Order is preserved (favorites are meaningful,
// not alphabetical). Guarded so a missing schema or bad id cannot throw.
function collectFavorites() {
    const entries = [];
    let ids = [];
    try {
        const settings = new Gio.Settings({schema_id: 'org.gnome.shell'});
        ids = settings.get_strv('favorite-apps');
    } catch (error) {
        logError(error, 'gnome-menu: failed to read favorite-apps');
        return entries;
    }

    const appSystem = Shell.AppSystem.get_default();
    for (const id of ids) {
        try {
            const app = appSystem.lookup_app(id);
            const appInfo = app ? app.get_app_info() : null;
            if (!appInfo)
                continue;
            const name = appInfo.get_display_name() || appInfo.get_name();
            if (!name)
                continue;
            entries.push({name, icon: appInfo.get_icon(), id, appInfo});
        } catch (error) {
            logError(error, `gnome-menu: skipping bad favorite ${id}`);
        }
    }
    return entries;
}

// Enumerate installed, visible apps and group them by display category.
// Returns a Map<categoryLabel, Array<{name, icon, id, appInfo}>>. Guarded so a
// single bad `.desktop` entry cannot abort the whole enumeration.
function collectAppsByCategory() {
    const byCategory = new Map();
    let appInfos = [];
    try {
        appInfos = Shell.AppSystem.get_default().get_installed();
    } catch (error) {
        logError(error, 'gnome-menu: failed to list installed applications');
        return byCategory;
    }

    for (const appInfo of appInfos) {
        try {
            if (!appInfo.should_show())
                continue;
            const name = appInfo.get_display_name() || appInfo.get_name();
            if (!name)
                continue;
            const category = categoryFor(appInfo.get_categories());
            const entry = {
                name,
                icon: appInfo.get_icon(),
                id: appInfo.get_id(),
                appInfo,
            };
            let list = byCategory.get(category);
            if (!list) {
                list = [];
                byCategory.set(category, list);
            }
            list.push(entry);
        } catch (error) {
            // Skip a broken desktop entry rather than failing the whole menu.
            logError(error, 'gnome-menu: skipping a broken application entry');
        }
    }
    return byCategory;
}

// Build the ordered list of categories: Favorites first (if any), then the
// freedesktop categories that have apps sorted alphabetically, "Other" last.
// Each category's apps (except Favorites) are sorted alphabetically. Fully
// guarded so nothing here can throw out of the constructor / create().
function collectCategories() {
    const categories = [];
    try {
        const favorites = collectFavorites();
        if (favorites.length > 0)
            categories.push({label: FAVORITES_CATEGORY, apps: favorites});
    } catch (error) {
        logError(error, 'gnome-menu: failed to build favorites');
    }

    let byCategory = new Map();
    try {
        byCategory = collectAppsByCategory();
    } catch (error) {
        logError(error, 'gnome-menu: failed to enumerate applications');
    }

    const names = Array.from(byCategory.keys())
        .filter(name => name !== OTHER_CATEGORY)
        .sort((a, b) => a.localeCompare(b));
    if (byCategory.has(OTHER_CATEGORY))
        names.push(OTHER_CATEGORY);

    for (const name of names) {
        const apps = byCategory.get(name);
        if (!apps || apps.length === 0)
            continue;
        apps.sort((a, b) => a.name.localeCompare(b.name));
        categories.push({label: name, apps});
    }
    return categories;
}

// Launch an app: prefer the shell's tracked app (`activate`), fall back to the
// raw AppInfo. Closes the overview if it is showing.
function launchApp(appInfo, id) {
    try {
        const app = id ? Shell.AppSystem.get_default().lookup_app(id) : null;
        if (app)
            app.activate();
        else if (appInfo)
            appInfo.launch([], null);
    } catch (error) {
        logError(error, `gnome-menu: failed to launch ${id}`);
    }
    if (Main.overview.visible)
        Main.overview.hide();
}

const GnomeMenuButton = GObject.registerClass(
    class GnomeMenuButton extends St.Button {
        _init(options) {
            super._init({
                style_class: 'button ctlBtn',
                reactive: true,
                track_hover: true,
                can_focus: true,
                child: buildButtonContent(options, DEFAULTS),
            });

            this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            Main.uiGroup.add_child(this._menu.actor);
            Main.panel.menuManager.addMenu(this._menu);
            this._menu.actor.hide();
            this._buildContent();

            this.connect('clicked', () => this._menu.toggle());
        }

        // Build the two-pane content once and add it as a single custom child
        // of the popup's box (the boxpointer provides the menu chrome). All
        // enumeration is guarded so a throw here can never disable the whole
        // extension; on failure / empty result a single label is shown.
        _buildContent() {
            let categories = [];
            try {
                categories = collectCategories();
            } catch (error) {
                logError(error, 'gnome-menu: failed to build applications menu');
            }

            if (categories.length === 0) {
                this._menu.box.add_child(
                    new St.Label({
                        text: 'No applications found',
                        style_class: 'popup-menu-item',
                    })
                );
                return;
            }

            const hbox = new St.BoxLayout({
                style_class: 'gnome-menu-content',
                style: 'spacing: 6px; min-height: 400px;',
                x_expand: true,
                y_expand: true,
            });

            // LEFT pane: vertical column of category buttons.
            this._leftBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'gnome-menu-categories',
                style: 'min-width: 150px;',
                y_expand: true,
            });

            // RIGHT pane: a vertical, scrollable column of app buttons.
            this._rightBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                y_expand: true,
            });
            const scroll = new St.ScrollView({
                style_class: 'gnome-menu-apps',
                style: 'min-width: 300px; max-height: 500px;',
                x_expand: true,
                y_expand: true,
            });
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            scroll.set_child(this._rightBox);

            hbox.add_child(this._leftBox);
            hbox.add_child(scroll);
            this._menu.box.add_child(hbox);

            // One category button per category; clicking or hovering selects it.
            this._categoryButtons = [];
            for (const category of categories) {
                const button = new St.Button({
                    style_class: 'popup-menu-item',
                    can_focus: true,
                    reactive: true,
                    track_hover: true,
                    x_expand: true,
                    x_align: Clutter.ActorAlign.FILL,
                    child: new St.Label({
                        text: category.label,
                        x_expand: true,
                        x_align: Clutter.ActorAlign.START,
                        y_align: Clutter.ActorAlign.CENTER,
                    }),
                });
                button.connect('clicked', () => this._selectCategory(category));
                button.connect('notify::hover', () => {
                    if (button.hover)
                        this._selectCategory(category);
                });
                this._categoryButtons.push({button, category});
                this._leftBox.add_child(button);
            }

            // Initial selection: the first category (Favorites when present).
            this._selectCategory(categories[0]);
        }

        // Show a category's apps in the right pane and mark its button active.
        _selectCategory(category) {
            if (this._activeCategory === category)
                return;
            this._activeCategory = category;

            for (const {button, category: cat} of this._categoryButtons) {
                if (cat === category)
                    button.add_style_pseudo_class('selected');
                else
                    button.remove_style_pseudo_class('selected');
            }

            this._rightBox.destroy_all_children();
            for (const app of category.apps)
                this._rightBox.add_child(this._buildAppButton(app));
        }

        // One launchable row: app icon (gicon) + name label.
        _buildAppButton(app) {
            const row = new St.BoxLayout({
                style: 'spacing: 8px;',
                x_expand: true,
            });
            row.add_child(
                new St.Icon(
                    app.icon
                        ? {gicon: app.icon, icon_size: 24}
                        : {icon_name: FALLBACK_ICON, icon_size: 24}
                )
            );
            row.add_child(
                new St.Label({
                    text: app.name,
                    x_expand: true,
                    x_align: Clutter.ActorAlign.START,
                    y_align: Clutter.ActorAlign.CENTER,
                })
            );

            const button = new St.Button({
                style_class: 'popup-menu-item',
                can_focus: true,
                reactive: true,
                track_hover: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                child: row,
            });
            button.connect('clicked', () => {
                launchApp(app.appInfo, app.id);
                this._menu.close();
            });
            return button;
        }

        destroy() {
            // The menu owns every child actor built above (left/right panes and
            // their buttons); destroying it disconnects the self-connected
            // signals on those actors, so no manual disconnect is needed.
            if (this._menu) {
                this._menu.destroy();
                this._menu = null;
            }
            this._leftBox = null;
            this._rightBox = null;
            this._categoryButtons = null;
            this._activeCategory = null;
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new GnomeMenuButton(options ?? {});
}

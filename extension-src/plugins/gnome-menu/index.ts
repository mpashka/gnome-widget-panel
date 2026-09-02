// @ts-nocheck
// @tag:widget-gnome-menu
//
// Panel button owning a two-column applications menu (like the XFCE Whisker
// menu): a search box above a LEFT column of category names and a RIGHT column
// showing the apps of the currently selected category — or, while something is
// typed in the search box, the apps matching it from every category.
// Categories are a "Favorites" entry (from the org.gnome.shell favorite-apps
// gsetting) followed by the freedesktop top-level categories that actually have
// installed apps.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import Shell from 'gi://Shell';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {buildButtonContent} from '../panelButtonContent.js';
import {appSearchTerms, matchApps} from './appSearch.js';

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
const SEARCH_ICON = 'edit-find-symbolic';
const SEARCH_HINT = 'Search applications';
const NO_MATCHES = 'No matching applications';

// Right-click row actions (docs/process/ux.md): one toggling favorites item
// rather than two, and an edit that opens the entry in the text editor the user
// already has instead of a `.desktop` editor of our own.
const ADD_FAVORITE = 'Add to Favorites';
const REMOVE_FAVORITE = 'Remove from Favorites';
const EDIT_APPLICATION = 'Edit Application…';

// A world change (an application installed, removed or edited, the favorites
// list changed) arrives as a burst of signals; the menu is rebuilt once, this
// long after the last of them.
const REBUILD_DELAY_MS = 300;

// Fixed popup geometry, in actor pixels: the two panes' widths, and the range
// the one height picked by _updateMenuHeight may fall in. The menu is
// deliberately the SAME size for every category. The height is what the panel's
// monitor can spare, capped at PREFERRED so a tall screen does not get a
// full-height column of applications; MIN keeps it usable on a short screen even
// though rows then scroll.
const CATEGORIES_WIDTH = 150;
const APPS_WIDTH = 320;
const PANE_SPACING = 6;
const PREFERRED_HEIGHT = 500;
const MIN_HEIGHT = 240;
// Room left for the panel itself and the boxpointer's arrow and shadow, so the
// popup never reaches the edge of the work area.
const SCREEN_MARGIN = 140;

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

// Every name one application answers to, most significant first, folded into
// the term list the search matches against (see appSearch.ts). `get_string()`
// reads the `.desktop` key WITHOUT translation while `get_display_name()` /
// `get_keywords()` return the current locale's text, which is what makes an
// application findable under both its Russian and its English name.
function searchTermsFor(appInfo) {
    const fields = [
        appInfo.get_display_name?.(),
        appInfo.get_string?.('Name'),
        appInfo.get_generic_name?.(),
        appInfo.get_string?.('GenericName'),
        appInfo.get_executable?.(),
        appInfo.get_id?.(),
    ];
    try {
        for (const keyword of appInfo.get_keywords?.() ?? [])
            fields.push(keyword);
    } catch (error) {
        logError(error, 'gnome-menu: failed to read application keywords');
    }
    fields.push(appInfo.get_string?.('Keywords'));
    return appSearchTerms(fields);
}

// One entry of the menu, both as a row to launch and as a search candidate.
function appEntry(appInfo, id, name) {
    return {
        name,
        icon: appInfo.get_icon(),
        id,
        appInfo,
        terms: searchTermsFor(appInfo),
    };
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
            entries.push(appEntry(appInfo, id, name));
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
            const entry = appEntry(appInfo, appInfo.get_id(), name);
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

// The flat list the search box looks through: every installed application
// exactly once. "Favorites" is skipped because it repeats applications that
// already live in their own category — a search must not list them twice.
function searchIndexFor(categories) {
    const apps = [];
    for (const category of categories) {
        if (category.label === FAVORITES_CATEGORY)
            continue;
        for (const app of category.apps)
            apps.push(app);
    }
    return apps;
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

// Is this application in the shell's favorites (the dash / the menu's first
// category)? Guarded: a missing schema must not break the row's menu.
function isFavoriteApp(id) {
    try {
        return id ? AppFavorites.getAppFavorites().isFavorite(id) : false;
    } catch (error) {
        logError(error, `gnome-menu: failed to read the favorite state of ${id}`);
        return false;
    }
}

// Add or remove a favorite — the one action that applies right now, never both
// (docs/process/ux.md). The shell writes the `favorite-apps` gsetting, which
// the menu watches, so the Favorites category updates itself.
function toggleFavoriteApp(id) {
    try {
        const favorites = AppFavorites.getAppFavorites();
        if (favorites.isFavorite(id))
            favorites.removeFavorite(id);
        else
            favorites.addFavorite(id);
    } catch (error) {
        logError(error, `gnome-menu: failed to toggle the favorite ${id}`);
    }
}

// The entry's own `.desktop` actions ("New Window", "New Private Window", …),
// which start what the user wants directly instead of launching the app and
// then finding the same command inside it.
function desktopActionsFor(appInfo) {
    try {
        return (appInfo.list_actions?.() ?? []).map(action => ({
            action,
            name: appInfo.get_action_name(action),
        }));
    } catch (error) {
        logError(error, 'gnome-menu: failed to list application actions');
        return [];
    }
}

// Open the file in the user's text editor. The default handler of a `.desktop`
// file would RUN it, so the editor is resolved for `text/plain` instead.
function openInTextEditor(file) {
    const editor = Gio.AppInfo.get_default_for_type('text/plain', false);
    if (!editor) {
        log('gnome-menu: no text/plain handler installed, cannot edit the entry');
        return;
    }
    editor.launch([file], null);
}

// Edit an application's `.desktop` entry. A system entry is first copied into
// ~/.local/share/applications, where it overrides the system one: the action
// prepares what it needs instead of dead-ending on "this file is not yours",
// the system's copy is left alone, and an edit already made there is opened
// as it is, never overwritten (docs/process/ux.md, rules 5 and 6).
function editApp(appInfo) {
    try {
        const id = appInfo?.get_id?.();
        const source = appInfo?.get_filename?.();
        if (!id || !source)
            return;

        const directory = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_data_dir(), 'applications'])
        );
        const target = directory.get_child(id);
        if (!target.query_exists(null)) {
            if (!directory.query_exists(null))
                directory.make_directory_with_parents(null);
            Gio.File.new_for_path(source).copy(
                target,
                Gio.FileCopyFlags.NONE,
                null,
                null
            );
        }
        openInTextEditor(target);
    } catch (error) {
        logError(error, 'gnome-menu: failed to open the application for editing');
    }
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
            this._categoryButtons = [];
            this._allApps = [];
            this._focusSourceId = 0;
            this._rebuildSourceId = 0;
            this._buildContent();

            // The menu shows a world that changes underneath it: applications
            // are installed and removed, and its own "Edit" and favorites
            // actions change that world too. Both signals rebuild it, so what
            // an action did is visible without reopening anything
            // (docs/process/ux.md, rule 7).
            this._appSystem = Shell.AppSystem.get_default();
            this._installedId = this._appSystem.connect('installed-changed', () =>
                this._scheduleRebuild()
            );
            try {
                this._shellSettings = new Gio.Settings({
                    schema_id: 'org.gnome.shell',
                });
                this._favoritesId = this._shellSettings.connect(
                    'changed::favorite-apps',
                    () => this._scheduleRebuild()
                );
            } catch (error) {
                logError(error, 'gnome-menu: cannot watch the favorites list');
            }

            // The available height depends on the monitor and on where the
            // panel was dragged, both of which change while the extension runs,
            // so the size is recomputed every time the menu opens. Each opening
            // also starts from an empty search box, with the keyboard in it so
            // the menu can be used by typing alone.
            this._menu.connect('open-state-changed', (_menu, open) => {
                if (!open) {
                    this._hideContextMenu();
                    this._clearSearch();
                    return;
                }
                this._updateMenuHeight();
                this._focusSearch();
            });

            this.connect('clicked', () => this._menu.toggle());
        }

        // Build the two-pane content once and add it as a single custom child
        // of the popup's box (the boxpointer provides the menu chrome). All
        // enumeration is guarded so a throw here can never disable the whole
        // extension; on failure / empty result a single label is shown.
        _buildContent() {
            this._categoryButtons = [];
            this._allApps = [];

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

            this._allApps = searchIndexFor(categories);

            // Both panes scroll and both have a fixed width, so the popup keeps
            // the size _updateMenuHeight gives it no matter which category is
            // selected, how many applications that category holds or what the
            // search box currently matches.
            this._content = new St.BoxLayout({
                style_class: 'gnome-menu-content',
                orientation: Clutter.Orientation.VERTICAL,
                style: 'spacing: 6px;',
                width: CATEGORIES_WIDTH + APPS_WIDTH + PANE_SPACING,
            });
            this._content.add_child(this._buildSearchEntry());

            this._panes = new St.BoxLayout({
                style_class: 'gnome-menu-panes',
                style: `spacing: ${PANE_SPACING}px;`,
                y_expand: true,
            });

            // LEFT pane: vertical column of category buttons.
            this._leftBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                y_expand: true,
            });
            const categoriesScroll = new St.ScrollView({
                style_class: 'gnome-menu-categories',
                width: CATEGORIES_WIDTH,
                y_expand: true,
            });
            categoriesScroll.set_policy(
                St.PolicyType.NEVER,
                St.PolicyType.AUTOMATIC
            );
            categoriesScroll.set_child(this._leftBox);

            // RIGHT pane: a vertical, scrollable column of app buttons.
            this._rightBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                y_expand: true,
            });
            this._appsScroll = new St.ScrollView({
                style_class: 'gnome-menu-apps',
                width: APPS_WIDTH,
                y_expand: true,
            });
            this._appsScroll.set_policy(
                St.PolicyType.NEVER,
                St.PolicyType.AUTOMATIC
            );
            this._appsScroll.set_child(this._rightBox);

            this._panes.add_child(categoriesScroll);
            this._panes.add_child(this._appsScroll);
            this._content.add_child(this._panes);

            // The content sits in a fixed-layout root so a row's context menu
            // can float over it. That overlay MUST live inside the popup's own
            // actor: the panel's menu manager closes the popup on a click
            // outside it, and a context menu parented anywhere else would be
            // exactly such a click.
            // Reactive: a non-reactive container is skipped by the event
            // chain, and the root's captured-event is what dismisses a row's
            // context menu.
            this._root = new St.Widget({
                style_class: 'gnome-menu-root',
                reactive: true,
            });
            this._root.add_child(this._content);
            this._root.connect('captured-event', (_actor, event) =>
                this._onRootEvent(event)
            );
            this._menu.box.add_child(this._root);
            this._updateMenuHeight();

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

        // Give the popup one fixed height, chosen from the space the panel's
        // monitor has. The menu MUST NOT resize when the selection changes: it
        // is anchored to the panel, so a popup that grows with the selected
        // category pushes its own category rows out from under the pointer, the
        // pointer lands on the neighbouring category, that one resizes it back —
        // and the menu shakes (worst with the panel at the bottom, where the
        // popup grows upwards and a long category such as "Internet" also ran
        // off the top of the screen).
        _updateMenuHeight() {
            if (!this._content)
                return;
            const monitor =
                Main.layoutManager.findMonitorForActor(this) ??
                Main.layoutManager.primaryMonitor;
            const workArea = monitor
                ? Main.layoutManager.getWorkAreaForMonitor(monitor.index)
                : null;
            const available = workArea
                ? workArea.height - SCREEN_MARGIN
                : PREFERRED_HEIGHT;
            this._content.height = Math.max(
                MIN_HEIGHT,
                Math.min(PREFERRED_HEIGHT, available)
            );
        }

        // The search box above both panes: typing in it takes the right pane
        // over, showing what matches across every category instead of the
        // selected one. Filtering runs on every keystroke; matching itself is
        // pure string work over a list built once (see appSearch.ts).
        _buildSearchEntry() {
            this._search = new St.Entry({
                style_class: 'gnome-menu-search',
                hint_text: SEARCH_HINT,
                can_focus: true,
                x_expand: true,
            });
            // Sized explicitly: the shell theme leaves an entry icon at the
            // default 48px, which would make the search row taller than the
            // menu's own rows.
            this._search.set_primary_icon(
                new St.Icon({icon_name: SEARCH_ICON, icon_size: 16})
            );
            this._search.clutter_text.connect('text-changed', () =>
                this._render()
            );
            this._search.clutter_text.connect('key-press-event', (_actor, event) =>
                this._onSearchKey(event)
            );
            return this._search;
        }

        // Keys the search box handles itself: Escape backs out (first the
        // query, then the menu), Enter launches the top row and Down moves the
        // keyboard into the result list.
        _onSearchKey(event) {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
                if (this._query() === '') {
                    this._menu.close();
                    return Clutter.EVENT_STOP;
                }
                this._clearSearch();
                return Clutter.EVENT_STOP;
            }

            const first = this._rightBox.get_first_child();
            if (
                symbol === Clutter.KEY_Return ||
                symbol === Clutter.KEY_KP_Enter ||
                symbol === Clutter.KEY_ISO_Enter
            ) {
                if (first?.reactive)
                    first.emit('clicked', 0);
                return Clutter.EVENT_STOP;
            }
            if (symbol === Clutter.KEY_Down && first?.can_focus) {
                first.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }

        // The current query, or '' when the menu is browsing categories.
        _query() {
            return this._search ? this._search.get_text().trim() : '';
        }

        // Put the keyboard in the search box, so the menu can be driven by
        // typing right after it opens. Deferred to an idle: the menu manager
        // takes the key focus itself while opening, after this signal runs.
        _focusSearch() {
            if (!this._search || this._focusSourceId)
                return;
            this._focusSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._focusSourceId = 0;
                if (this._search && this._menu?.isOpen)
                    global.stage.set_key_focus(this._search.clutter_text);
                return GLib.SOURCE_REMOVE;
            });
        }

        // Back to browsing the selected category. Setting the text re-renders
        // through 'text-changed'; when it is already empty nothing to do.
        _clearSearch() {
            if (this._query() !== '')
                this._search.set_text('');
        }

        // Select a category to browse. While a search is running, picking a
        // category (by click or by hover) ends the search and shows it.
        _selectCategory(category) {
            const changed = this._activeCategory !== category;
            this._activeCategory = category;
            if (this._query() !== '') {
                this._clearSearch();
                return;
            }
            if (changed || this._rightBox.get_n_children() === 0)
                this._render();
        }

        // Fill the right pane: the search matches while something is typed,
        // the selected category's apps otherwise. The only place that writes
        // the pane, so both modes cannot disagree about what it shows.
        _render() {
            if (!this._rightBox)
                return;
            const query = this._query();
            const searching = query !== '';

            for (const {button, category} of this._categoryButtons) {
                if (!searching && category === this._activeCategory)
                    button.add_style_pseudo_class('selected');
                else
                    button.remove_style_pseudo_class('selected');
            }

            const apps = searching
                ? matchApps(this._allApps, query)
                : (this._activeCategory?.apps ?? []);

            this._rightBox.destroy_all_children();
            if (apps.length === 0) {
                this._rightBox.add_child(
                    new St.Label({text: NO_MATCHES, style_class: 'popup-menu-item'})
                );
            } else {
                for (const app of apps)
                    this._rightBox.add_child(this._buildAppButton(app));
            }

            // A new list always starts at its first row, not where the previous
            // one had been scrolled to.
            this._appsScroll?.vadjustment?.set_value(0);
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
            const label = new St.Label({
                text: app.name,
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });
            // The pane has a fixed width (see _updateMenuHeight), so a long
            // application name is ellipsized instead of widening the popup.
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            row.add_child(label);

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
            // St.Button only "clicks" on the primary button, so the secondary
            // one is free for the row's own actions.
            button.connect('button-press-event', (_actor, event) => {
                if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                    return Clutter.EVENT_PROPAGATE;
                const [stageX, stageY] = event.get_coords();
                this._showContextMenu(app, stageX, stageY);
                return Clutter.EVENT_STOP;
            });
            return button;
        }

        // The row's own actions, right where the row is (docs/process/ux.md,
        // rule 2): the entry's `.desktop` actions first — they start what the
        // user wants in one go — then the favorites toggle and the editor.
        _contextActions(app) {
            const items = desktopActionsFor(app.appInfo).map(({action, name}) => ({
                label: name,
                activate: () => {
                    try {
                        app.appInfo.launch_action(action, null);
                    } catch (error) {
                        logError(error, `gnome-menu: failed action ${action}`);
                    }
                    this._menu.close();
                },
            }));

            items.push({
                label: isFavoriteApp(app.id) ? REMOVE_FAVORITE : ADD_FAVORITE,
                // The menu stays open: the favorites list is one of its own
                // categories, and the watcher rebuilds it in place, so the
                // result is visible without reopening anything.
                activate: () => toggleFavoriteApp(app.id),
            });
            items.push({
                label: EDIT_APPLICATION,
                activate: () => {
                    editApp(app.appInfo);
                    this._menu.close();
                },
            });
            return items;
        }

        // Show the row's actions at the pointer, clamped inside the popup so
        // the overlay can never enlarge it (rule 11: the layout may not move
        // under the pointer).
        _showContextMenu(app, stageX, stageY) {
            this._hideContextMenu();
            if (!this._root)
                return;

            this._contextMenu = new St.BoxLayout({
                style_class: 'popup-menu-content gnome-menu-context',
                orientation: Clutter.Orientation.VERTICAL,
                can_focus: true,
                reactive: true,
            });
            for (const {label, activate} of this._contextActions(app)) {
                const item = new St.Button({
                    style_class: 'popup-menu-item',
                    can_focus: true,
                    reactive: true,
                    track_hover: true,
                    x_expand: true,
                    x_align: Clutter.ActorAlign.FILL,
                    child: new St.Label({
                        text: label,
                        x_expand: true,
                        x_align: Clutter.ActorAlign.START,
                        y_align: Clutter.ActorAlign.CENTER,
                    }),
                });
                item.connect('clicked', () => {
                    this._hideContextMenu();
                    activate();
                });
                this._contextMenu.add_child(item);
            }
            // Escape dismisses this layer only, leaving the menu open
            // (rule 8: back out one level at a time).
            this._contextMenu.connect('key-press-event', (_actor, event) => {
                if (event.get_key_symbol() !== Clutter.KEY_Escape)
                    return Clutter.EVENT_PROPAGATE;
                this._hideContextMenu();
                return Clutter.EVENT_STOP;
            });

            this._root.add_child(this._contextMenu);

            const [, width] = this._contextMenu.get_preferred_width(-1);
            const [, height] = this._contextMenu.get_preferred_height(width);
            // transform_stage_point returns (success, x, y).
            const [, pointerX, pointerY] = this._root.transform_stage_point(
                stageX,
                stageY
            );
            this._contextMenu.set_position(
                Math.max(0, Math.min(pointerX, this._content.width - width)),
                Math.max(0, Math.min(pointerY, this._content.height - height))
            );
            this._contextMenu.grab_key_focus();
        }

        _hideContextMenu() {
            if (!this._contextMenu)
                return;
            this._contextMenu.destroy();
            this._contextMenu = null;
            if (this._search && this._menu?.isOpen)
                global.stage.set_key_focus(this._search.clutter_text);
        }

        // While a row's actions are up, a press anywhere else in the menu just
        // dismisses them — the click that closes a context menu never also
        // launches whatever it landed on. Right-clicking another row is the
        // exception: it goes through and opens that row's actions instead, so
        // comparing two rows does not cost a dismissing click each time.
        _onRootEvent(event) {
            if (!this._contextMenu)
                return Clutter.EVENT_PROPAGATE;
            if (event.type() !== Clutter.EventType.BUTTON_PRESS)
                return Clutter.EVENT_PROPAGATE;

            // `event.get_source()` is null for events the stage delivered
            // through a grab (which is every event while the popup is open);
            // the stage answers where the press actually landed.
            const source = global.stage.get_event_actor(event);
            if (!source)
                return Clutter.EVENT_PROPAGATE;
            if (this._contextMenu.contains(source))
                return Clutter.EVENT_PROPAGATE;
            if (
                event.get_button() === Clutter.BUTTON_SECONDARY &&
                this._rightBox?.contains(source)
            )
                return Clutter.EVENT_PROPAGATE;

            this._hideContextMenu();
            return Clutter.EVENT_STOP;
        }

        // Rebuild once after a burst of "the world changed" signals, keeping
        // the user's place: the same category stays selected and the typed
        // query still applies (rule 10).
        _scheduleRebuild() {
            if (this._rebuildSourceId)
                return;
            this._rebuildSourceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                REBUILD_DELAY_MS,
                () => {
                    this._rebuildSourceId = 0;
                    this._rebuild();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        _rebuild() {
            if (!this._menu)
                return;
            const label = this._activeCategory?.label;
            const query = this._query();

            this._hideContextMenu();
            this._menu.box.destroy_all_children();
            this._root = null;
            this._content = null;
            this._activeCategory = null;
            this._buildContent();

            const previous = this._categoryButtons.find(
                ({category}) => category.label === label
            );
            if (previous)
                this._selectCategory(previous.category);
            if (query !== '' && this._search)
                this._search.set_text(query);
            if (this._menu.isOpen)
                this._updateMenuHeight();
        }

        destroy() {
            for (const field of ['_focusSourceId', '_rebuildSourceId']) {
                if (this[field]) {
                    GLib.source_remove(this[field]);
                    this[field] = 0;
                }
            }
            if (this._installedId) {
                this._appSystem.disconnect(this._installedId);
                this._installedId = 0;
            }
            if (this._favoritesId) {
                this._shellSettings.disconnect(this._favoritesId);
                this._favoritesId = 0;
            }
            this._appSystem = null;
            this._shellSettings = null;
            // The menu owns every child actor built above (search box, the
            // left/right panes and their buttons); destroying it disconnects
            // the self-connected signals on those actors, so no manual
            // disconnect is needed.
            if (this._menu) {
                this._menu.destroy();
                this._menu = null;
            }
            this._root = null;
            this._contextMenu = null;
            this._content = null;
            this._panes = null;
            this._search = null;
            this._leftBox = null;
            this._rightBox = null;
            this._appsScroll = null;
            this._categoryButtons = null;
            this._activeCategory = null;
            this._allApps = null;
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new GnomeMenuButton(options ?? {});
}

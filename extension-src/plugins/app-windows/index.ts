// @ts-nocheck
// @tag:widget-app-windows
//
// Panel button listing the windows of the CURRENT application by title. The
// shell's own Alt+Esc switcher shows thumbnails, which say nothing when several
// windows of the same IDE differ only by their caption; this menu shows the
// captions and nothing else. The button itself carries the tracked
// application's icon and its window count, so it is obvious whose windows the
// menu will list before it is opened.
//
// The tracked application is the last one that really had focus: opening this
// menu takes a shell grab, which drops `focus_app` to null, so a null focus is
// ignored rather than clearing the button. See index.md.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';
import {
    DEFAULT_ICON,
    appWindowsFragments,
    parseAppWindowsOptions,
    selectWindowEntries,
} from './appWindowEntries.js';

const ROW_ICON_SIZE = 16;
// The "you are here" mark and its fixed slot width; see `_buildWindowItem`.
const FOCUS_MARK_ICON = 'media-record-symbolic';
const FOCUS_MARK_SIZE = 10;
// Dimmed suffix telling where a window is when it is not simply here: on
// another workspace, or minimised.
const SUFFIX_OPACITY = 140;

// The application icon for the button and the menu rows. Falls back to the
// configured icon name when the app has no desktop entry (a window-backed app).
function appGicon(app) {
    try {
        const gicon = app.get_app_info?.()?.get_icon?.();
        if (gicon)
            return gicon;
        if (typeof app.get_icon === 'function')
            return app.get_icon();
    } catch (error) {
        logError(error, 'app-windows: failed to read the application icon');
    }
    return null;
}


// The windows this widget lists: everything the app owns except what asked to
// stay out of switchers (splash screens, tool windows).
function listedWindows(app) {
    try {
        return app
            .get_windows()
            .filter(window => !window.is_skip_taskbar());
    } catch (error) {
        logError(error, 'app-windows: failed to list the application windows');
        return [];
    }
}


// Translate live Meta.Windows into the plain summaries the pure rules take.
// The array index is the row key: it only has to survive one menu build.
//
// `focusWindow` is the last window that really had focus, not
// `window.has_focus()`: by the time the menu is built the popup's own grab has
// already taken the focus away, and every row would claim not to be the one the
// user came from.
function summarize(windows, focusWindow) {
    const activeIndex = global.workspace_manager.get_active_workspace_index();
    return windows.map((window, index) => {
        const workspace = window.get_workspace();
        const workspaceIndex = workspace ? workspace.index() : -1;
        return {
            id: index,
            title: window.get_title() ?? '',
            workspaceIndex,
            onActiveWorkspace:
                window.is_on_all_workspaces() || workspaceIndex === activeIndex,
            isFocused: window === focusWindow,
            isMinimized: window.minimized,
            userTime: window.get_user_time(),
        };
    });
}


// Where a window is, when that is worth saying: minimised, and/or parked on
// another workspace. Empty for a plain window on the current workspace.
function locationSuffix(entry) {
    const parts = [];
    if (entry.isMinimized)
        parts.push('minimised');
    if (!entry.onActiveWorkspace && entry.workspaceIndex >= 0)
        parts.push(`workspace ${entry.workspaceIndex + 1}`);
    return parts.join(' · ');
}


const AppWindowsButton = GObject.registerClass(
    class AppWindowsButton extends St.Button {
        _init(options) {
            this._options = parseAppWindowsOptions(options);
            this._app = null;
            this._appWindowsId = null;
            this._windows = [];

            super._init({
                style_class: 'button ctlBtn',
                reactive: true,
                track_hover: true,
                can_focus: true,
            });

            this._icon = new St.Icon({
                icon_name: this._options.icon || DEFAULT_ICON,
                style_class: 'system-status-icon',
                y_align: Clutter.ActorAlign.CENTER,
            });
            // The count is a badge ON the icon, not a label beside it: a second
            // child widens the button, and in a vertical panel that width is the
            // whole strip's width.
            this._countLabel = new St.Label({
                style_class: 'app-windows-count',
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.END,
                visible: false,
            });
            const iconBox = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            iconBox.add_child(this._icon);
            iconBox.add_child(this._countLabel);
            const box = new St.BoxLayout({
                style_class: 'panel-button-content',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            box.add_child(iconBox);
            if (this._options.text) {
                box.add_child(
                    new St.Label({
                        text: this._options.text,
                        y_align: Clutter.ActorAlign.CENTER,
                    })
                );
            }
            this.set_child(box);

            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            Main.uiGroup.add_child(this._tooltip);

            this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            Main.uiGroup.add_child(this._menu.actor);
            Main.panel.menuManager.addMenu(this._menu);
            this._menu.actor.hide();
            this._tracker = Shell.WindowTracker.get_default();
            this._trackerId = this._tracker.connect('notify::focus-app', () =>
                this._onFocusAppChanged()
            );
            this._focusWindow = global.display.focus_window;
            this._displayId = global.display.connect('notify::focus-window', () => {
                const window = global.display.focus_window;
                if (window)
                    this._focusWindow = window;
            });
            this._onFocusAppChanged();
            this._rebuildMenu();

            // Titles change constantly (an editor retitles on every file), so
            // the rows are rebuilt for every opening — BEFORE `open()`, never
            // from `open-state-changed`. Rebuilding while the menu opens
            // destroys the items the shell has just taken as active, and every
            // later click then trips over a disposed menu item (the menu stops
            // closing on activation). Building ahead of the toggle also keeps
            // the menu non-empty, which `PopupMenu.open()` requires: it
            // silently refuses to open an empty menu.
            this.connect('clicked', () => {
                if (!this._menu.isOpen)
                    this._rebuildMenu();
                this._menu.toggle();
            });
            this.connect('notify::hover', () => this._onHoverChanged());
        }

        // --- Tracked application ----------------------------------------------

        // A null focus app means the focus is on shell chrome — this very menu,
        // the overview, a notification — not that the user left the app. Keep
        // the last real one; `windows-changed` clears it when the app is gone.
        _onFocusAppChanged() {
            const app = this._tracker.focus_app;
            if (!app || app === this._app)
                return;
            this._setApp(app);
        }

        _setApp(app) {
            if (this._app && this._appWindowsId) {
                this._app.disconnect(this._appWindowsId);
                this._appWindowsId = null;
            }
            this._app = app;
            if (app) {
                this._appWindowsId = app.connect('windows-changed', () =>
                    this._onWindowsChanged()
                );
            }
            this._updateButton();
        }

        // Only the button is refreshed here, never the open menu. `Shell.App`
        // emits `windows-changed` when a window's user time changes too, i.e.
        // from inside the very activation a menu row started: rebuilding there
        // destroys the item being activated, and the shell then trips over the
        // disposed item and leaves the menu open for good. The open menu is a
        // snapshot of the moment it was opened; `_activate` re-checks that the
        // chosen window still exists.
        _onWindowsChanged() {
            // The tracked app closed its last window: nothing to list any more,
            // and no focus change is guaranteed to follow.
            if (this._app && listedWindows(this._app).length === 0) {
                this._setApp(null);
                return;
            }
            this._updateButton();
        }

        // --- Button ------------------------------------------------------------

        _updateButton() {
            const gicon = this._options.useAppIcon && this._app
                ? appGicon(this._app)
                : null;
            if (gicon)
                this._icon.gicon = gicon;
            else
                this._icon.icon_name = this._options.icon || DEFAULT_ICON;

            const count = this._app ? listedWindows(this._app).length : 0;
            // One window needs no count: the badge would only cover the icon.
            const showCount = this._options.showCount && count > 1;
            this._countLabel.visible = showCount;
            if (showCount)
                this._countLabel.text = `${count}`;
            this._updateTooltip();
        }

        // What the tooltip template gets to talk about.
        _status() {
            return {
                app: this._app ? this._app.get_name() ?? '' : '',
                count: this._app ? listedWindows(this._app).length : 0,
                window: this._focusWindow ? this._focusWindow.get_title() ?? '' : '',
            };
        }

        _tooltipMarkup() {
            return renderTemplate(
                this._options.template,
                appWindowsFragments(this._status())
            );
        }

        _updateTooltip() {
            if (!this._tooltip)
                return;
            const markup = this._tooltipMarkup();
            // An empty template is how the tooltip is turned off; no separate
            // switch for it.
            if (!markup.trim()) {
                this._tooltip.visible = false;
                return;
            }
            try {
                this._tooltip.clutter_text.set_markup(markup);
            } catch (error) {
                // Invalid user markup must not blank the tooltip.
                this._tooltip.text = markup;
            }
            if (this._tooltip.visible)
                positionTooltip(this);
        }

        _onHoverChanged() {
            if (this.hover) {
                this._updateTooltip();
                if (!this._tooltipMarkup().trim())
                    return;
                positionTooltip(this);
                animateTooltipVisibility(this, true);
                return;
            }
            animateTooltipVisibility(this, false);
        }

        // --- Menu --------------------------------------------------------------

        _rebuildMenu() {
            this._menu.removeAll();
            this._windows = this._app ? listedWindows(this._app) : [];
            const {entries, hiddenCount} = selectWindowEntries(
                summarize(this._windows, this._focusWindow),
                this._options
            );

            if (entries.length === 0) {
                this._addNotice('No windows');
                return;
            }

            for (const entry of entries)
                this._menu.addMenuItem(this._buildWindowItem(entry));

            if (hiddenCount > 0) {
                this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this._addNotice(`${hiddenCount} more not shown`);
            }
        }

        // A row the menu shows but nobody can activate (empty state, overflow).
        _addNotice(text) {
            const item = new PopupMenu.PopupMenuItem(text, {reactive: false});
            item.label.opacity = SUFFIX_OPACITY;
            // No ornament slot, like the window rows (they carry their own mark).
            item.setOrnament(PopupMenu.Ornament.HIDDEN);
            this._menu.addMenuItem(item);
        }

        // One window row: the app icon, the title (ellipsized to the fixed menu
        // width — a caption may be a whole path) and where the window is.
        _buildWindowItem(entry) {
            const item = new PopupMenu.PopupBaseMenuItem();
            item.actor.width = this._options.menuWidth;

            // The mark for "this is where you are". Drawn as our own child of a
            // fixed size, with the shell's own ornament slot hidden: the built-in
            // ornament is an icon whose width differs between the dot and the
            // empty state, which left the unmarked titles a few pixels to the
            // left of the marked one. Unmarked rows keep the same actor at zero
            // opacity, so every title starts at exactly the same x.
            item.setOrnament(PopupMenu.Ornament.HIDDEN);
            item.actor.add_child(
                new St.Icon({
                    icon_name: FOCUS_MARK_ICON,
                    icon_size: FOCUS_MARK_SIZE,
                    width: FOCUS_MARK_SIZE,
                    opacity: entry.isFocused ? 255 : 0,
                    y_align: Clutter.ActorAlign.CENTER,
                })
            );

            const gicon = this._options.useAppIcon && this._app
                ? appGicon(this._app)
                : null;
            item.actor.add_child(
                new St.Icon(
                    gicon
                        ? {gicon, icon_size: ROW_ICON_SIZE}
                        : {
                              icon_name: this._options.icon || DEFAULT_ICON,
                              icon_size: ROW_ICON_SIZE,
                          }
                )
            );

            const label = new St.Label({
                text: entry.label,
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            item.actor.add_child(label);

            const suffix = locationSuffix(entry);
            if (suffix) {
                item.actor.add_child(
                    new St.Label({
                        text: suffix,
                        opacity: SUFFIX_OPACITY,
                        y_align: Clutter.ActorAlign.CENTER,
                    })
                );
            }

            item.connect('activate', () => this._activate(entry.id));
            return item;
        }

        // Main.activateWindow switches workspace and unminimizes as needed, and
        // closes the overview if it happens to be up.
        _activate(id) {
            const window = this._windows[id];
            // The rows are a snapshot: the window may have been closed while
            // the menu was open, and activating a destroyed one throws.
            if (!window || !this._app || !listedWindows(this._app).includes(window))
                return;
            try {
                Main.activateWindow(window);
            } catch (error) {
                logError(error, 'app-windows: failed to activate a window');
            }
        }

        destroy() {
            if (this._trackerId) {
                this._tracker.disconnect(this._trackerId);
                this._trackerId = null;
            }
            if (this._displayId) {
                global.display.disconnect(this._displayId);
                this._displayId = null;
            }
            this._focusWindow = null;
            if (this._app && this._appWindowsId) {
                this._app.disconnect(this._appWindowsId);
                this._appWindowsId = null;
            }
            this._app = null;
            this._windows = [];
            if (this._menu) {
                this._menu.destroy();
                this._menu = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            super.destroy();
        }
    }
);



export function create(parent, options) {
    return new AppWindowsButton(options ?? {});
}

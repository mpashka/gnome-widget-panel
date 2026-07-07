// @ts-nocheck
// @tag:widget-favorites
//
// Panel button opening a "Places" popup menu: Home, the existing XDG user
// directories and any GTK bookmarks. Each entry opens its location in the
// default file manager.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {buildButtonContent} from '../panelButtonContent.js';

const DEFAULTS = {icon: 'folder-symbolic', text: 'Places'};

// XDG user directories to list when they exist, in display order.
const XDG_DIRS = [
    GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    GLib.UserDirectory.DIRECTORY_MUSIC,
    GLib.UserDirectory.DIRECTORY_PICTURES,
    GLib.UserDirectory.DIRECTORY_VIDEOS,
    GLib.UserDirectory.DIRECTORY_DESKTOP,
    GLib.UserDirectory.DIRECTORY_PUBLIC_SHARE,
    GLib.UserDirectory.DIRECTORY_TEMPLATES,
];

function openUri(uri) {
    try {
        Gio.AppInfo.launch_default_for_uri(uri, null);
    } catch (error) {
        logError(error, `favorites: failed to open ${uri}`);
    }
}

function basename(path) {
    const parts = path.split('/').filter(part => part.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : path;
}

// Parse the GTK bookmarks file: each line is a `file://` URI optionally
// followed by a whitespace-separated display label.
function readBookmarks() {
    const bookmarks = [];
    const file = GLib.build_filenamev([
        GLib.get_user_config_dir(),
        'gtk-3.0',
        'bookmarks',
    ]);
    if (!GLib.file_test(file, GLib.FileTest.EXISTS))
        return bookmarks;
    let contents;
    try {
        const [ok, bytes] = GLib.file_get_contents(file);
        if (!ok)
            return bookmarks;
        contents = new TextDecoder().decode(bytes);
    } catch (error) {
        logError(error, 'favorites: failed to read GTK bookmarks');
        return bookmarks;
    }
    for (const raw of contents.split('\n')) {
        const line = raw.trim();
        if (!line || !line.startsWith('file://'))
            continue;
        const spaceIndex = line.indexOf(' ');
        const uri = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
        const label =
            spaceIndex === -1
                ? decodeURIComponent(basename(uri))
                : line.slice(spaceIndex + 1).trim();
        bookmarks.push({uri, label});
    }
    return bookmarks;
}

const FavoritesButton = GObject.registerClass(
    class FavoritesButton extends St.Button {
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
            this._populateMenu();

            this.connect('clicked', () => this._menu.toggle());
        }

        _addPlace(label, uri) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => openUri(uri));
            this._menu.addMenuItem(item);
        }

        _populateMenu() {
            const home = GLib.get_home_dir();
            this._addPlace('Home', `file://${home}`);

            let addedXdg = false;
            for (const dir of XDG_DIRS) {
                const path = GLib.get_user_special_dir(dir);
                if (!path || path === home)
                    continue;
                if (!GLib.file_test(path, GLib.FileTest.IS_DIR))
                    continue;
                this._addPlace(basename(path), `file://${path}`);
                addedXdg = true;
            }

            const bookmarks = readBookmarks();
            if (bookmarks.length > 0) {
                if (addedXdg)
                    this._menu.addMenuItem(
                        new PopupMenu.PopupSeparatorMenuItem()
                    );
                for (const {uri, label} of bookmarks)
                    this._addPlace(label, uri);
            }
        }

        destroy() {
            if (this._menu) {
                this._menu.destroy();
                this._menu = null;
            }
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new FavoritesButton(options ?? {});
}

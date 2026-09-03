#!/usr/bin/env bash
# @tag:widget-gnome-menu @tag:ui-testing @tag:ux
# The applications menu's per-row actions (docs/process/ux.md): a REAL
# right-click on an application row opens its actions at the pointer, the
# favorites item toggles and the Favorites category updates itself without the
# menu being reopened, "Edit Application…" puts a user copy of the `.desktop`
# entry in ~/.local/share/applications, and a click elsewhere in the menu only
# dismisses the actions.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[{"id":"gnome-menu","enabled":true}]}'

ui_wait_js "plugin('gnome-menu') !== null && plugin('gnome-menu')._root !== null" \
    || fail "gnome-menu did not appear"

ui_click "plugin('gnome-menu')" >/dev/null
ui_wait_js "plugin('gnome-menu')._menu.isOpen" || fail "the menu did not open"
ui_park_pointer

# The subject: an application that is NOT already a favorite, found through the
# search box so its row is the one on top. `pick()` re-finds that row after a
# rebuild; it also proves the rebuild kept the typed query (UX rule 10).
ui_eval "(() => {
    const menu = plugin('gnome-menu');
    const favorites = () => new Gio.Settings({schema_id: 'org.gnome.shell'})
        .get_strv('favorite-apps');
    const app = menu._allApps.find(candidate => !favorites().includes(candidate.id));
    if (!app)
        throw new Error('every installed application is already a favorite');
    globalThis.gwpRow = {
        menu,
        app,
        favorites,
        pick: () => {
            menu._search.set_text(app.name);
            return menu._rightBox.get_children().find(
                row => row.get_child?.()?.get_children?.()[1]?.text === app.name
            );
        },
        labels: () => (menu._contextMenu?.get_children() ?? [])
            .map(item => item.get_child().text),
        item: label => menu._contextMenu.get_children()
            .find(child => child.get_child().text === label),
    };
    globalThis.gwpRow.row = globalThis.gwpRow.pick();
    if (!globalThis.gwpRow.row)
        throw new Error('the search did not list the picked application');
    return app.id;
})()" >/dev/null || fail "could not pick an application row"

assert_true "!globalThis.gwpRow.favorites().includes(globalThis.gwpRow.app.id)" \
    "the subject application starts out of the favorites"

ui_click_button "globalThis.gwpRow.row" Clutter.BUTTON_SECONDARY >/dev/null
ui_wait_js "plugin('gnome-menu')._contextMenu !== null" \
    || fail "a right-click on an application row opened no actions"
ui_park_pointer
_ui_log "ok - right-clicking a row opens its actions"

assert_true "globalThis.gwpRow.labels().includes('Add to Favorites')" \
    "the actions offer adding to the favorites"
assert_true "globalThis.gwpRow.labels().includes('Edit Application…')" \
    "the actions offer editing the application"
assert_true "!globalThis.gwpRow.labels().includes('Remove from Favorites')" \
    "only the favorites action that applies is listed, not both"

# The actions must stay inside the popup: an overlay hanging outside it would
# enlarge the menu, which is the shake t-17 pins down.
assert_true "(() => {
    const {menu} = globalThis.gwpRow;
    const box = menu._contextMenu;
    return box.x >= 0 && box.y >= 0 &&
        box.x + box.width <= menu._content.width + 1 &&
        box.y + box.height <= menu._content.height + 1;
})()" "the actions stay inside the popup"

ui_eval "globalThis.gwpRow.item('Add to Favorites').emit('clicked', 0)" >/dev/null
ui_wait_js "globalThis.gwpRow.favorites().includes(globalThis.gwpRow.app.id)" \
    || fail "the favorites item did not add the application"
assert_true "plugin('gnome-menu')._contextMenu === null" \
    "acting on an item closes the actions"

# ... and the menu shows the new state itself, without being reopened.
ui_wait_js "(() => {
    const menu = plugin('gnome-menu');
    const favorites = menu._categoryButtons[0]?.category;
    return menu._menu.isOpen && favorites?.label === 'Favorites' &&
        favorites.apps.some(app => app.id === globalThis.gwpRow.app.id);
})()" 10 || fail "the Favorites category did not pick up the new favorite"
_ui_log "ok - the Favorites category updated in the open menu"

# The same item now offers the other half of the toggle.
ui_eval "globalThis.gwpRow.row = globalThis.gwpRow.pick()" >/dev/null
ui_click_button "globalThis.gwpRow.row" Clutter.BUTTON_SECONDARY >/dev/null
ui_wait_js "plugin('gnome-menu')._contextMenu !== null" \
    || fail "the row's actions did not open the second time"
ui_park_pointer
assert_true "globalThis.gwpRow.labels().includes('Remove from Favorites')" \
    "a favorite offers removal instead of addition"

ui_eval "globalThis.gwpRow.item('Remove from Favorites').emit('clicked', 0)" \
    >/dev/null
ui_wait_js "!globalThis.gwpRow.favorites().includes(globalThis.gwpRow.app.id)" \
    || fail "the favorites item did not remove the application"
# Wait for the removal to reach the open menu too, so the rows below are the
# rebuilt ones and not actors about to be destroyed.
ui_wait_js "(() => {
    const first = plugin('gnome-menu')._categoryButtons[0]?.category;
    return first?.label !== 'Favorites' ||
        !first.apps.some(app => app.id === globalThis.gwpRow.app.id);
})()" 10 || fail "the Favorites category kept the removed application"
_ui_log "ok - the favorites item toggles both ways, in the settings and in the menu"

# A press elsewhere in the menu dismisses the actions and nothing else: the
# menu itself stays open.
ui_eval "globalThis.gwpRow.row = globalThis.gwpRow.pick()" >/dev/null
ui_click_button "globalThis.gwpRow.row" Clutter.BUTTON_SECONDARY >/dev/null
ui_wait_js "plugin('gnome-menu')._contextMenu !== null" \
    || fail "the row's actions did not open the third time"
ui_park_pointer
ui_click "plugin('gnome-menu')._leftBox.get_children()[0]" >/dev/null
ui_wait_js "plugin('gnome-menu')._contextMenu === null" \
    || fail "a click elsewhere did not dismiss the row's actions"
assert_true "plugin('gnome-menu')._menu.isOpen" \
    "dismissing the actions leaves the menu open"
ui_park_pointer

# "Edit Application…" copies a system entry into the user's own applications
# directory (XDG_DATA_HOME is isolated for the test session) and opens that.
ui_eval "(() => {
    const {menu, app} = globalThis.gwpRow;
    menu._showContextMenu(app, 0, 0);
    globalThis.gwpRow.item('Edit Application…').emit('clicked', 0);
    return app.id;
})()" >/dev/null || fail "the edit action could not be triggered"

user_entry="$XDG_DATA_HOME/applications/$(ui_eval "globalThis.gwpRow.app.id" | tr -d '"')"
for _ in $(seq 20); do
    [[ -s "$user_entry" ]] && break
    sleep 0.3
done
[[ -s "$user_entry" ]] || fail "editing did not create the user copy: $user_entry"
grep -q '^\[Desktop Entry\]' "$user_entry" \
    || fail "the user copy is not a desktop entry: $user_entry"
_ui_log "ok - editing put a user copy of the entry in ~/.local/share/applications"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"

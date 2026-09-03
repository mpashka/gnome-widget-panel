#!/usr/bin/env bash
# @tag:widget-gnome-menu @tag:ui-testing
# The applications menu's search box: typing filters the right pane across every
# category, an application is found by its untranslated name as well as the one
# shown, clearing the box returns to the browsed category, picking a category
# ends the search — and none of it may change the popup's size (see
# t-17-menu-size-stable.sh for why a resizing popup shakes).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[{"id":"gnome-menu","enabled":true}]}'

ui_wait_js "plugin('gnome-menu') !== null && plugin('gnome-menu')._search !== null" \
    || fail "gnome-menu did not appear with a search box"

# One installed application is the subject of the whole test; kept on globalThis
# so its name never has to survive a trip through the shell's quoting.
ui_eval "(() => {
    const menu = plugin('gnome-menu');
    menu._menu.open();
    globalThis.gwpSearch = {
        menu,
        app: menu._allApps[0],
        names: () => menu._rightBox.get_children()
            .map(row => row.get_child?.()?.get_children?.()[1]?.text ?? row.text),
        size: () => [
            menu._menu.box.get_preferred_width(-1)[1],
            menu._menu.box.get_preferred_height(-1)[1],
        ].join('x'),
    };
    globalThis.gwpSearch.browsedSize = globalThis.gwpSearch.size();
    return globalThis.gwpSearch.app.name;
})()" >/dev/null || fail "could not open the menu and pick an application"

assert_true "globalThis.gwpSearch.app.terms.length > 0" \
    "the picked application has searchable terms"

assert_true "(() => {
    const {menu, app, names} = globalThis.gwpSearch;
    menu._search.set_text(app.name);
    return names().includes(app.name);
})()" "typing the shown name finds the application"

# The untranslated `.desktop` name / executable / id are terms too, which is
# what makes a Russian menu searchable in English (and the other way round).
assert_true "(() => {
    const {menu, app, names} = globalThis.gwpSearch;
    const other = app.terms[app.terms.length - 1];
    menu._search.set_text(other);
    return names().includes(app.name);
})()" "the application is also found by its untranslated name"

assert_true "(() => {
    const {menu, names} = globalThis.gwpSearch;
    return names().length <= menu._allApps.length;
})()" "the search lists fewer applications than the whole catalogue"

assert_true "(() => {
    const {menu} = globalThis.gwpSearch;
    return menu._categoryButtons.every(
        ({button}) => !button.has_style_pseudo_class('selected')
    );
})()" "no category is marked selected while searching"

assert_eq "$(ui_eval "globalThis.gwpSearch.size()")" \
    "$(ui_eval "globalThis.gwpSearch.browsedSize")" \
    "the popup keeps its size while searching"

assert_true "(() => {
    const {menu, names} = globalThis.gwpSearch;
    menu._search.set_text('zzz-no-such-application-zzz');
    return names().length === 1 && names()[0].startsWith('No matching');
})()" "a query matching nothing says so"

assert_true "(() => {
    const {menu, names} = globalThis.gwpSearch;
    menu._search.set_text('');
    const category = menu._activeCategory;
    return names().length === category.apps.length &&
        menu._categoryButtons.some(
            ({button, category: cat}) =>
                cat === category && button.has_style_pseudo_class('selected')
        );
})()" "clearing the box returns to the browsed category"

assert_true "(() => {
    const {menu} = globalThis.gwpSearch;
    menu._search.set_text('a');
    const other = menu._categoryButtons[menu._categoryButtons.length - 1].category;
    menu._selectCategory(other);
    return menu._search.get_text() === '' && menu._activeCategory === other;
})()" "picking a category ends the search"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"

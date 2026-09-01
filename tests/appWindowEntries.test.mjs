// Unit tests for the gi-free app-windows rules (option parsing, ordering,
// limiting, labels). Run with `npm test` (which builds first).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_ICON,
    DEFAULT_TEMPLATE,
    UNTITLED,
    appWindowsFragments,
    parseAppWindowsOptions,
    selectWindowEntries,
} from '../extension/plugins/app-windows/appWindowEntries.js';
import {renderTemplate} from '../extension/tooltipTemplate.js';

// A window on the active workspace, not focused, not minimised.
function win(id, title, extra = {}) {
    return {
        id,
        title,
        workspaceIndex: 0,
        onActiveWorkspace: true,
        isFocused: false,
        isMinimized: false,
        userTime: id,
        ...extra,
    };
}

const defaults = parseAppWindowsOptions({});

test('empty options give the documented defaults', () => {
    assert.equal(defaults.useAppIcon, true);
    assert.equal(defaults.icon, DEFAULT_ICON);
    assert.equal(defaults.text, '');
    assert.equal(defaults.showCount, true);
    assert.equal(defaults.template, DEFAULT_TEMPLATE);
    assert.equal(defaults.maxWindows, 15);
    assert.equal(defaults.menuWidth, 420);
    assert.equal(defaults.sort, 'title');
    assert.equal(defaults.otherWorkspaces, true);
});

test('malformed options fall back instead of breaking the widget', () => {
    const options = parseAppWindowsOptions({
        icon: 42,
        showCount: 'yes',
        maxWindows: 'many',
        sort: 'random',
    });
    assert.equal(options.icon, DEFAULT_ICON);
    assert.equal(options.showCount, true);
    assert.equal(options.maxWindows, 15);
    assert.equal(options.sort, 'title');
});

test('out-of-range numbers are clamped and rounded', () => {
    assert.equal(parseAppWindowsOptions({maxWindows: 0}).maxWindows, 1);
    assert.equal(parseAppWindowsOptions({maxWindows: 999}).maxWindows, 50);
    assert.equal(parseAppWindowsOptions({menuWidth: 10}).menuWidth, 180);
    assert.equal(parseAppWindowsOptions({menuWidth: 5000}).menuWidth, 900);
    assert.equal(parseAppWindowsOptions({menuWidth: 300.6}).menuWidth, 301);
});

test('numeric strings from a hand-edited config are accepted', () => {
    assert.equal(parseAppWindowsOptions({maxWindows: '7'}).maxWindows, 7);
});

const recent = parseAppWindowsOptions({sort: 'recent'});

test('recent order lists the most recently used window first', () => {
    const {entries} = selectWindowEntries(
        [win(1, 'old'), win(3, 'newest'), win(2, 'middle')],
        recent
    );
    assert.deepEqual(
        entries.map((entry) => entry.label),
        ['newest', 'middle', 'old']
    );
});

test('the focused window leads recent order even with an older user time', () => {
    const {entries} = selectWindowEntries(
        [win(9, 'newest'), win(1, 'in use', {isFocused: true})],
        recent
    );
    assert.equal(entries[0].label, 'in use');
    assert.equal(entries[0].isFocused, true);
});

// The point of title order: the same window is in the same place every time,
// so the list can be learned. Hoisting the focused window would take that away —
// and would make the focus mark say what the order already said.
test('title order is purely alphabetical, the focused window is not hoisted', () => {
    const {entries} = selectWindowEntries(
        [win(1, 'zeta'), win(2, 'alpha'), win(3, 'mid', {isFocused: true})],
        defaults
    );
    assert.deepEqual(
        entries.map((entry) => entry.label),
        ['alpha', 'mid', 'zeta']
    );
});

test('title order does not move a window when the focus moves', () => {
    const windows = [win(1, 'zeta'), win(2, 'alpha'), win(3, 'mid')];
    const before = selectWindowEntries(windows, defaults).entries.map(e => e.label);
    const after = selectWindowEntries(
        windows.map(w => ({...w, isFocused: w.title === 'zeta', userTime: 99})),
        defaults
    ).entries.map(e => e.label);
    assert.deepEqual(after, before);
});

test('titles are whitespace-collapsed and never empty', () => {
    const {entries} = selectWindowEntries(
        [win(2, '  home-infra   –   Main.java \n'), win(1, '   ')],
        recent
    );
    assert.equal(entries[0].label, 'home-infra – Main.java');
    assert.equal(entries[1].label, UNTITLED);
});

test('maxWindows limits the rows and reports the remainder', () => {
    const options = parseAppWindowsOptions({maxWindows: 2});
    const {entries, hiddenCount} = selectWindowEntries(
        [win(1, 'a'), win(2, 'b'), win(3, 'c'), win(4, 'd')],
        options
    );
    assert.equal(entries.length, 2);
    assert.equal(hiddenCount, 2);
});

test('in recent order the focused window survives a limit of one', () => {
    const options = parseAppWindowsOptions({maxWindows: 1, sort: 'recent'});
    const {entries, hiddenCount} = selectWindowEntries(
        [win(9, 'newest'), win(1, 'in use', {isFocused: true})],
        options
    );
    assert.deepEqual(entries.map((entry) => entry.label), ['in use']);
    assert.equal(hiddenCount, 1);
});

test('other workspaces are listed with their workspace index', () => {
    const {entries} = selectWindowEntries(
        [
            win(1, 'here'),
            win(2, 'there', {onActiveWorkspace: false, workspaceIndex: 2}),
        ],
        defaults
    );
    const there = entries.find((entry) => entry.label === 'there');
    assert.equal(there.onActiveWorkspace, false);
    assert.equal(there.workspaceIndex, 2);
});

test('otherWorkspaces off hides them and does not count them as hidden rows', () => {
    const options = parseAppWindowsOptions({otherWorkspaces: false});
    const {entries, hiddenCount} = selectWindowEntries(
        [
            win(1, 'here'),
            win(2, 'there', {onActiveWorkspace: false, workspaceIndex: 2}),
        ],
        options
    );
    assert.deepEqual(entries.map((entry) => entry.label), ['here']);
    assert.equal(hiddenCount, 0);
});

test('minimised state reaches the row unchanged', () => {
    const {entries} = selectWindowEntries(
        [win(1, 'hidden away', {isMinimized: true})],
        defaults
    );
    assert.equal(entries[0].isMinimized, true);
});

test('no windows gives no rows', () => {
    const {entries, hiddenCount} = selectWindowEntries([], defaults);
    assert.deepEqual(entries, []);
    assert.equal(hiddenCount, 0);
});

test('the caller key is returned unchanged for mapping back to a window', () => {
    const {entries} = selectWindowEntries([win(7, 'seven')], defaults);
    assert.equal(entries[0].id, 7);
});

// --- Tooltip fragments -------------------------------------------------------

test('the default template renders application and window count', () => {
    const markup = renderTemplate(
        DEFAULT_TEMPLATE,
        appWindowsFragments({app: 'IntelliJ IDEA', count: 4, window: 'Main.java'})
    );
    assert.equal(markup, 'IntelliJ IDEA — 4 windows');
});

test('the count fragment is singular for one window and empty-safe', () => {
    assert.equal(appWindowsFragments({app: 'x', count: 1, window: 'w'}).count, '1 window');
    assert.equal(appWindowsFragments({app: '', count: 0, window: ''}).count, 'no windows');
    assert.equal(appWindowsFragments({app: '', count: 0, window: ''}).app, 'No application');
});

test('an untitled focused window still names itself in the tooltip', () => {
    assert.equal(appWindowsFragments({app: 'a', count: 2, window: '  '}).window, UNTITLED);
    assert.equal(appWindowsFragments({app: 'a', count: 0, window: ''}).window, '');
});

test('fragments are Pango-escaped: a title cannot inject markup', () => {
    const fragments = appWindowsFragments({
        app: 'Rock & Roll',
        count: 1,
        window: '<b>not bold</b>',
    });
    assert.equal(fragments.app, 'Rock &amp; Roll');
    assert.equal(fragments.window, '&lt;b&gt;not bold&lt;/b&gt;');
});

test('the tooltip template is taken verbatim, empty included', () => {
    assert.equal(parseAppWindowsOptions({template: ''}).template, '');
    assert.equal(parseAppWindowsOptions({template: '{window}'}).template, '{window}');
    assert.equal(parseAppWindowsOptions({template: 7}).template, DEFAULT_TEMPLATE);
});

test('useAppIcon can be turned off for a fixed icon', () => {
    assert.equal(parseAppWindowsOptions({useAppIcon: false}).useAppIcon, false);
    assert.equal(parseAppWindowsOptions({useAppIcon: 'no'}).useAppIcon, true);
});

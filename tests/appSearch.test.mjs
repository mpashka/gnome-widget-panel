// Unit tests for the gi-free applications-menu search rules (term building,
// matching in either language, ranking). Run with `npm test` (which builds first).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_SEARCH_RESULTS,
    appSearchTerms,
    matchApps,
    normalizeSearchText,
    searchWords,
} from '../extension/plugins/gnome-menu/appSearch.js';

// An application the way index.ts builds it: the name shown in the menu plus
// every other name it answers to, most significant first.
function app(name, ...otherNames) {
    return {name, terms: appSearchTerms([name, ...otherNames])};
}

const settings = app('Настройки', 'Settings', 'gnome-control-center', 'org.gnome.Settings.desktop');
const files = app('Файлы', 'Files', 'Менеджер файлов', 'File Manager', 'nautilus');
const firefox = app('Firefox', 'Firefox Web Browser', 'firefox', 'browser');
const catalogue = [settings, files, firefox];

test('normalization folds case, accents and ё', () => {
    assert.equal(normalizeSearchText('  Café  '), 'cafe');
    assert.equal(normalizeSearchText('Ёжик'), 'ежик');
    // Decomposition also merges Cyrillic й into и; queries are folded the same
    // way, so matching only gets more forgiving of that typo.
    assert.equal(normalizeSearchText('Файлы'), 'фаилы');
    assert.equal(normalizeSearchText(null), '');
    assert.equal(normalizeSearchText(undefined), '');
});

test('terms drop empty fields and duplicates, keeping significance order', () => {
    assert.deepEqual(appSearchTerms(['Files', null, 'files', '', 'nautilus']), [
        'files',
        'nautilus',
    ]);
});

test('an application is found by its translated and its untranslated name', () => {
    assert.deepEqual(matchApps(catalogue, 'настрой'), [settings]);
    assert.deepEqual(matchApps(catalogue, 'settings'), [settings]);
    assert.deepEqual(matchApps(catalogue, 'файл'), [files]);
    assert.deepEqual(matchApps(catalogue, 'files'), [files]);
});

test('an application is also found by executable and desktop id', () => {
    assert.deepEqual(matchApps(catalogue, 'nautilus'), [files]);
    assert.deepEqual(matchApps(catalogue, 'org.gnome.settings'), [settings]);
});

test('every word of the query must match, in any order', () => {
    assert.deepEqual(matchApps(catalogue, 'firefox browser'), [firefox]);
    assert.deepEqual(matchApps(catalogue, 'browser firefox'), [firefox]);
    assert.deepEqual(matchApps(catalogue, 'firefox файлы'), []);
    assert.deepEqual(searchWords(' Firefox   web '), ['firefox', 'web']);
});

test('an empty query matches nothing (the menu shows the category instead)', () => {
    assert.deepEqual(matchApps(catalogue, ''), []);
    assert.deepEqual(matchApps(catalogue, '   '), []);
});

test('a hit on the shown name outranks the same hit on a lesser name', () => {
    const browser = app('Browser', 'browser');
    const helper = app('Zzz Helper', 'Helper', 'browser plugin helper');
    assert.deepEqual(matchApps([helper, browser], 'browser'), [browser, helper]);
});

test('a name starting with the query outranks one merely containing it', () => {
    const boxes = app('Boxes');
    const toolbox = app('Toolbox');
    assert.deepEqual(matchApps([toolbox, boxes], 'box'), [boxes, toolbox]);
});

test('a word inside a name outranks a match in the middle of a word', () => {
    const manager = app('File Manager');
    const salesman = app('Zsalesman');
    assert.deepEqual(matchApps([salesman, manager], 'man'), [manager, salesman]);
});

test('equally ranked applications stay in alphabetical order', () => {
    const beta = app('Beta Tool');
    const alpha = app('Alpha Tool');
    assert.deepEqual(matchApps([beta, alpha], 'tool'), [alpha, beta]);
});

test('the result list is capped', () => {
    const many = Array.from({length: MAX_SEARCH_RESULTS + 10}, (_unused, index) =>
        app(`Tool ${String(index).padStart(3, '0')}`)
    );
    const found = matchApps(many, 'tool');
    assert.equal(found.length, MAX_SEARCH_RESULTS);
    assert.equal(found[0].name, 'Tool 000');
    assert.deepEqual(matchApps(many, 'tool', 3).length, 3);
});

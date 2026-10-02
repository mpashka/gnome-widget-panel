// @tag:presets
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    NO_PRESET,
    activePresetName,
    createPreset,
    emptyPresetStore,
    parsePresetStore,
    removePreset,
    renamePreset,
    serializePresetStore,
    switchPreset,
} from '../extension/presets.js';

const snapshot = (widgets, aligned = 5) => ({
    widgets,
    aligned,
    orientation: 'horizontal',
    'content-padding': 0,
    'main-panel': 'visible',
});

const HOME = snapshot('home');
const OFFICE = snapshot('office', 9);


test('an empty key is an empty store on the unnamed slot', () => {
    assert.deepEqual(parsePresetStore(''), emptyPresetStore());
});

test('a store survives a round trip', () => {
    const store = createPreset(emptyPresetStore(), HOME, 'Home');
    assert.deepEqual(parsePresetStore(serializePresetStore(store)), store);
});

test('an unknown schema throws, a malformed preset is skipped', () => {
    assert.throws(() => parsePresetStore('{"schema":2,"presets":[]}'));
    const store = parsePresetStore(JSON.stringify({
        schema: 1,
        active: 'bad',
        presets: [{id: 'bad', name: 'x', snapshot: {widgets: 1}}, {id: 'p1', snapshot: HOME}],
    }));
    assert.deepEqual(store.presets.map(p => p.id), ['p1']);
    assert.equal(store.active, NO_PRESET, 'active pointing at a dropped preset falls back');
    assert.equal(store.presets[0].name, 'p1');
});

test('saving as new copies the live settings and activates the copy', () => {
    const store = createPreset(emptyPresetStore(), HOME);
    assert.equal(store.active, 'p1');
    assert.equal(activePresetName(store), 'Preset 1');
    assert.deepEqual(store.presets[0].snapshot, HOME);
    assert.deepEqual(store.noPreset, HOME, 'the unnamed slot keeps what it had');
});

test('a new preset made after an edit takes the edit into the old one too', () => {
    let store = createPreset(emptyPresetStore(), HOME, 'Home');
    store = createPreset(store, OFFICE, 'Office');
    assert.deepEqual(store.presets[0].snapshot, OFFICE);
});

test('switching stores the live settings into the slot being left', () => {
    let store = createPreset(emptyPresetStore(), HOME, 'Home');
    store = createPreset(store, HOME, 'Office');
    store = switchPreset(store, 'p1', OFFICE).store;
    store = switchPreset(store, 'p2', HOME).store;
    const edited = snapshot('office-edited', 9);

    const toHome = switchPreset(store, 'p1', edited);
    assert.deepEqual(toHome.apply, HOME);
    assert.equal(toHome.store.active, 'p1');
    assert.deepEqual(toHome.store.presets[1].snapshot, edited);

    const back = switchPreset(toHome.store, 'p2', HOME);
    assert.deepEqual(back.apply, edited, 'the edit made in Office came back with it');
});

test('the unnamed slot restores its own settings', () => {
    const before = snapshot('before-presets');
    let store = createPreset(emptyPresetStore(), before, 'Home');
    const toNone = switchPreset(store, NO_PRESET, HOME);
    assert.deepEqual(toNone.apply, before);
    assert.equal(toNone.store.active, NO_PRESET);
});

test('switching to the active slot changes nothing', () => {
    const store = createPreset(emptyPresetStore(), HOME);
    assert.deepEqual(switchPreset(store, 'p1', OFFICE), {store, apply: null});
});

test('switching to an unknown preset throws', () => {
    assert.throws(() => switchPreset(emptyPresetStore(), 'nope', HOME));
});

test('new names and ids do not collide after a removal', () => {
    let store = createPreset(emptyPresetStore(), HOME);
    store = createPreset(store, HOME);
    store = removePreset(store, 'p1', HOME);
    store = createPreset(store, HOME);
    assert.deepEqual(store.presets.map(p => [p.id, p.name]), [
        ['p2', 'Preset 2'],
        ['p1', 'Preset 3'],
    ]);
});

test('renaming changes only the name', () => {
    const store = renamePreset(createPreset(emptyPresetStore(), HOME), 'p1', 'Home');
    assert.equal(store.presets[0].name, 'Home');
    assert.deepEqual(store.presets[0].snapshot, HOME);
});

test('removing the active preset keeps the panel as it is', () => {
    let store = createPreset(emptyPresetStore(), HOME, 'Home');
    store = removePreset(store, 'p1', OFFICE);
    assert.equal(store.active, NO_PRESET);
    assert.deepEqual(store.noPreset, OFFICE);
    assert.equal(store.presets.length, 0);
});

test('removing another preset leaves the active one alone', () => {
    let store = createPreset(emptyPresetStore(), HOME, 'Home');
    store = createPreset(store, OFFICE, 'Office');
    const after = removePreset(store, 'p1', OFFICE);
    assert.equal(after.active, 'p2');
    assert.deepEqual(after.noPreset, store.noPreset);
});

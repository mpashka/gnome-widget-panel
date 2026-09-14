// @tag:widget-screen-keyboard
// Pure logic of the screen keyboard: the Serbian layouts and where the floating
// keyboard goes next to its button. Run with npm test.
import test from 'node:test';
import assert from 'node:assert/strict';

import {LAYOUTS, keyText, otherScript, parseScript} from '../extension/plugins/screen-keyboard/layouts.js';
import {placeBeside} from '../extension/plugins/screen-keyboard/placement.js';

const SERBIAN_CYRILLIC = 'абвгдђежзијклљмнњопрстћуфхцчџш';
const SERBIAN_LATIN = ['a', 'b', 'c', 'č', 'ć', 'd', 'đ', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 'š', 't', 'u', 'v', 'z', 'ž'];

test('the Cyrillic layout has every letter of the Serbian alphabet, once', () => {
    const letters = LAYOUTS.cyrillic.rows.flat();
    for (const letter of SERBIAN_CYRILLIC)
        assert.ok(letters.includes(letter), `missing ${letter}`);
    assert.equal(new Set(letters).size, letters.length);
});

test('the Latin layout has every single-letter of Serbian Latin, once', () => {
    const letters = LAYOUTS.latin.rows.flat();
    for (const letter of SERBIAN_LATIN)
        assert.ok(letters.includes(letter), `missing ${letter}`);
    assert.equal(new Set(letters).size, letters.length);
});

test('both scripts put their letters on the same keys', () => {
    assert.deepEqual(
        LAYOUTS.latin.rows.map(row => row.length),
        LAYOUTS.cyrillic.rows.map(row => row.length)
    );
    const pairs = {љ: 'q', њ: 'w', ш: 'š', ћ: 'ć', ч: 'č', ђ: 'đ', ж: 'ž', ј: 'j', ц: 'c'};
    for (const [cyrillic, latin] of Object.entries(pairs)) {
        const row = LAYOUTS.cyrillic.rows.findIndex(r => r.includes(cyrillic));
        const index = LAYOUTS.cyrillic.rows[row].indexOf(cyrillic);
        assert.equal(LAYOUTS.latin.rows[row][index], latin, `${cyrillic} ↔ ${latin}`);
    }
});

test('capitals', () => {
    assert.equal(keyText('љ', true), 'Љ');
    assert.equal(keyText('џ', true), 'Џ');
    assert.equal(keyText('đ', true), 'Đ');
    assert.equal(keyText('ž', false), 'ž');
});

test('script option: unknown values fall back to Cyrillic', () => {
    assert.equal(parseScript('latin'), 'latin');
    assert.equal(parseScript('cyrillic'), 'cyrillic');
    assert.equal(parseScript(undefined), 'cyrillic');
    assert.equal(parseScript('klingon'), 'cyrillic');
    assert.equal(otherScript('latin'), 'cyrillic');
    assert.equal(otherScript('cyrillic'), 'latin');
});

const SCREEN = {x: 0, y: 0, width: 1920, height: 1080};
const KEYBOARD = {width: 570, height: 200};

test('a button at the bottom of the screen gets the keyboard above it', () => {
    const button = {x: 900, y: 1040, width: 40, height: 40};
    assert.deepEqual(placeBeside(button, KEYBOARD, SCREEN, 6), {x: 635, y: 834});
});

test('a button at the top of the screen gets the keyboard below it', () => {
    const button = {x: 900, y: 0, width: 40, height: 40};
    assert.deepEqual(placeBeside(button, KEYBOARD, SCREEN, 6), {x: 635, y: 46});
});

test('near a screen edge the keyboard is clamped onto the screen', () => {
    const button = {x: 1900, y: 1040, width: 20, height: 40};
    assert.deepEqual(placeBeside(button, KEYBOARD, SCREEN, 6), {x: 1350, y: 834});
});

test('when neither above nor below fits, it goes to the side with more room', () => {
    const shortScreen = {x: 0, y: 0, width: 1920, height: 300};
    const button = {x: 0, y: 100, width: 40, height: 100};
    assert.deepEqual(placeBeside(button, KEYBOARD, shortScreen, 6), {x: 46, y: 50});
});

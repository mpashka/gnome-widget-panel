// @tag:widget-screen-keyboard
//
// gi-free letter layouts of the screen keyboard, so they are unit tested in
// plain Node (tests/screenKeyboardLayouts.test.mjs).
//
// The rows follow GNOME Shell's own Serbian on-screen layout (osk-layouts/rs.json)
// — the phone arrangement — and the Latin rows sit on exactly the same keys, so
// switching script never moves a letter from under the pointer: љ↔q, њ↔w, ѕ↔y,
// џ↔x, ђ↔đ, ж↔ž.

export type ScriptId = 'cyrillic' | 'latin';

export interface ScriptLayout {
    id: ScriptId;
    /** Name of the layout, written in it; shown on the space bar. */
    name: string;
    /** Short name, written in it; shown on the key that switches TO this script. */
    shortName: string;
    rows: string[][];
}

export const DEFAULT_SCRIPT: ScriptId = 'cyrillic';

export const LAYOUTS: Record<ScriptId, ScriptLayout> = {
    cyrillic: {
        id: 'cyrillic',
        name: 'Српски',
        shortName: 'Ћир',
        rows: [
            ['љ', 'њ', 'е', 'р', 'т', 'з', 'у', 'и', 'о', 'п', 'ш'],
            ['а', 'с', 'д', 'ф', 'г', 'х', 'ј', 'к', 'л', 'ч', 'ћ'],
            ['ѕ', 'џ', 'ц', 'в', 'б', 'н', 'м', 'ђ', 'ж'],
        ],
    },
    latin: {
        id: 'latin',
        name: 'Srpski',
        shortName: 'Lat',
        rows: [
            ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'š'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'č', 'ć'],
            ['y', 'x', 'c', 'v', 'b', 'n', 'm', 'đ', 'ž'],
        ],
    },
};

export function parseScript(value: unknown): ScriptId {
    return value === 'latin' || value === 'cyrillic' ? value : DEFAULT_SCRIPT;
}

export function otherScript(script: ScriptId): ScriptId {
    return script === 'cyrillic' ? 'latin' : 'cyrillic';
}

export function keyText(letter: string, capital: boolean): string {
    return capital ? letter.toLocaleUpperCase('sr') : letter;
}

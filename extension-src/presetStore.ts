// @ts-nocheck
// @tag:presets
//
// GSettings side of the presets: reads the live panel snapshot, applies one,
// and persists the store in the `presets` key. Shared by the drag handle's
// menu (Shell process) and the preferences window.

import Gio from 'gi://Gio';

import {
    NO_PRESET,
    createPreset,
    emptyPresetStore,
    parsePresetStore,
    removePreset,
    renamePreset,
    serializePresetStore,
    switchPreset,
    type PanelSnapshot,
    type PresetStore,
} from './presets.js';

export {NO_PRESET};

export const PRESETS_KEY = 'presets';


export function loadPresetStore(settings): PresetStore {
    try {
        return parsePresetStore(settings.get_string(PRESETS_KEY));
    } catch (error) {
        logError(error, 'widget-panel: invalid presets key, starting without presets');
        return emptyPresetStore();
    }
}


function savePresetStore(settings, store: PresetStore): void {
    settings.set_string(PRESETS_KEY, serializePresetStore(store));
}


export function readLiveSnapshot(settings): PanelSnapshot {
    return {
        widgets: settings.get_string('widgets'),
        aligned: settings.get_int('aligned'),
        orientation: settings.get_string('orientation'),
        'content-padding': settings.get_int('content-padding'),
        'main-panel': settings.get_string('main-panel'),
    };
}


// One delayed batch, so the panel sees the whole preset arrive at once instead
// of relaying out for each key. On a private object: delay() never leaves
// delay-apply mode, and the shared one would then hold back every later edit.
function applySnapshot(settings, snapshot: PanelSnapshot): void {
    const batch = new Gio.Settings({
        settings_schema: settings.settings_schema,
        path: settings.path,
    });
    batch.delay();
    batch.set_string('widgets', snapshot.widgets);
    batch.set_int('aligned', snapshot.aligned);
    batch.set_string('orientation', snapshot.orientation);
    batch.set_int('content-padding', snapshot['content-padding']);
    batch.set_string('main-panel', snapshot['main-panel']);
    batch.apply();
}


export function activatePreset(settings, id: string): void {
    const {store, apply} = switchPreset(
        loadPresetStore(settings),
        id,
        readLiveSnapshot(settings)
    );
    savePresetStore(settings, store);
    if (apply)
        applySnapshot(settings, apply);
}


export function saveAsNewPreset(settings): void {
    savePresetStore(
        settings,
        createPreset(loadPresetStore(settings), readLiveSnapshot(settings))
    );
}


export function renameStoredPreset(settings, id: string, name: string): void {
    savePresetStore(settings, renamePreset(loadPresetStore(settings), id, name));
}


/** Returns the raw value before the removal, for an Undo. */
export function deleteStoredPreset(settings, id: string): string {
    const before = settings.get_string(PRESETS_KEY);
    savePresetStore(
        settings,
        removePreset(loadPresetStore(settings), id, readLiveSnapshot(settings))
    );
    return before;
}


export function restorePresetStore(settings, raw: string): void {
    settings.set_string(PRESETS_KEY, raw);
}

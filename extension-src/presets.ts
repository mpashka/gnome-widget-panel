// @tag:presets
//
// Named snapshots of how the panel looks, and the operations on them. Free of
// any `gi://` import so it is unit-tested in plain Node; GSettings I/O lives in
// `presetStore.ts`. See ../docs/implementation/presets.md.

export const PRESETS_SCHEMA = 1;

export const PRESET_KEYS = [
    'widgets',
    'aligned',
    'orientation',
    'content-padding',
    'main-panel',
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

export interface PanelSnapshot {
    widgets: string;
    aligned: number;
    orientation: string;
    'content-padding': number;
    'main-panel': string;
}

export interface Preset {
    id: string;
    name: string;
    snapshot: PanelSnapshot;
}

/**
 * `active` is the id of the preset the live settings belong to, or
 * `NO_PRESET` when they belong to the unnamed slot `noPreset`. The snapshot of
 * whichever slot is active is stale by design: the live GSettings keys are its
 * truth until the user switches away.
 */
export interface PresetStore {
    schema: typeof PRESETS_SCHEMA;
    active: string;
    presets: Preset[];
    noPreset: PanelSnapshot | null;
}

export const NO_PRESET = '';

export interface Switch {
    store: PresetStore;
    apply: PanelSnapshot | null;
}


export function emptyPresetStore(): PresetStore {
    return {schema: PRESETS_SCHEMA, active: NO_PRESET, presets: [], noPreset: null};
}


function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}


function parseSnapshot(value: unknown): PanelSnapshot | null {
    if (!isRecord(value))
        return null;
    const {widgets, aligned, orientation} = value;
    const padding = value['content-padding'];
    const mainPanel = value['main-panel'];
    if (
        typeof widgets !== 'string' ||
        !Number.isInteger(aligned) ||
        typeof orientation !== 'string' ||
        !Number.isInteger(padding) ||
        typeof mainPanel !== 'string'
    )
        return null;
    return {
        widgets,
        aligned: aligned as number,
        orientation,
        'content-padding': padding as number,
        'main-panel': mainPanel,
    };
}


/**
 * Lenient like `parseWidgetConfig`: an empty value is an empty store, a
 * malformed preset entry is skipped, and only an unreadable document or an
 * unknown schema throws.
 */
export function parsePresetStore(raw: string): PresetStore {
    if (!raw)
        return emptyPresetStore();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.schema !== PRESETS_SCHEMA || !Array.isArray(data.presets))
        throw new Error('Unsupported presets schema');

    const presets: Preset[] = [];
    for (const entry of data.presets) {
        if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id)
            continue;
        const snapshot = parseSnapshot(entry.snapshot);
        if (!snapshot || presets.some(p => p.id === entry.id))
            continue;
        presets.push({
            id: entry.id,
            name: typeof entry.name === 'string' ? entry.name : entry.id,
            snapshot,
        });
    }
    const active =
        typeof data.active === 'string' && presets.some(p => p.id === data.active)
            ? data.active
            : NO_PRESET;
    return {
        schema: PRESETS_SCHEMA,
        active,
        presets,
        noPreset: parseSnapshot(data.noPreset),
    };
}


export function serializePresetStore(store: PresetStore): string {
    return JSON.stringify(store);
}


function withActiveSnapshot(store: PresetStore, live: PanelSnapshot): PresetStore {
    if (store.active === NO_PRESET)
        return {...store, noPreset: live};
    return {
        ...store,
        presets: store.presets.map(p =>
            p.id === store.active ? {...p, snapshot: live} : p
        ),
    };
}


/**
 * Moves the live settings into the slot being left and returns the snapshot
 * to apply. `apply` is null when there is nothing to change: the target is
 * already active, or it is the unnamed slot that has never been left.
 */
export function switchPreset(
    store: PresetStore,
    target: string,
    live: PanelSnapshot
): Switch {
    if (target === store.active)
        return {store, apply: null};
    if (target !== NO_PRESET && !store.presets.some(p => p.id === target))
        throw new Error(`No preset with id ${target}`);

    const saved = withActiveSnapshot(store, live);
    const apply =
        target === NO_PRESET
            ? saved.noPreset
            : saved.presets.find(p => p.id === target)!.snapshot;
    return {store: {...saved, active: target}, apply};
}


export function nextPresetName(store: PresetStore): string {
    const taken = new Set(store.presets.map(p => p.name));
    for (let n = store.presets.length + 1; ; n++) {
        const name = `Preset ${n}`;
        if (!taken.has(name))
            return name;
    }
}


function nextPresetId(store: PresetStore): string {
    const taken = new Set(store.presets.map(p => p.id));
    for (let n = 1; ; n++) {
        const id = `p${n}`;
        if (!taken.has(id))
            return id;
    }
}


/** The new preset starts as a copy of the live settings and becomes active. */
export function createPreset(
    store: PresetStore,
    live: PanelSnapshot,
    name = nextPresetName(store)
): PresetStore {
    const saved = withActiveSnapshot(store, live);
    const id = nextPresetId(saved);
    return {
        ...saved,
        active: id,
        presets: [...saved.presets, {id, name, snapshot: live}],
    };
}


export function renamePreset(store: PresetStore, id: string, name: string): PresetStore {
    return {
        ...store,
        presets: store.presets.map(p => (p.id === id ? {...p, name} : p)),
    };
}


/**
 * Removing the active preset keeps the panel as it is: the live settings stay
 * on screen and become the unnamed slot's.
 */
export function removePreset(
    store: PresetStore,
    id: string,
    live: PanelSnapshot
): PresetStore {
    const presets = store.presets.filter(p => p.id !== id);
    if (store.active !== id)
        return {...store, presets};
    return {...store, presets, active: NO_PRESET, noPreset: live};
}


export function activePresetName(store: PresetStore): string | null {
    return store.presets.find(p => p.id === store.active)?.name ?? null;
}

# Presets

`@tag:presets`

Back to [implementation](index.md). What the user sees:
[`specification/use-cases/setup/presets.md`](../specification/use-cases/setup/presets.md).

## Storage

One GSettings key, `presets`, holding a JSON document:

```json
{"schema": 1, "active": "p2",
 "presets": [{"id": "p1", "name": "Home", "snapshot": {…}}, …],
 "noPreset": {…}}
```

A snapshot is the values of five panel keys: `widgets` (the raw JSON string),
`aligned`, `orientation`, `content-padding`, `main-panel`. `pos-x`/`pos-y` are
deliberately absent — a preset carries the snap position, not a dragged spot.
`active` is `""` for the unnamed slot `noPreset`.

## The live keys are the active preset

Nothing listens for edits. The five live keys *are* the active slot; its stored
snapshot is stale until the user switches away, when `switchPreset` writes the
live values into the slot being left and returns the target's snapshot. So every
existing writer — preferences rows, dragging, widget settings — feeds the active
preset without knowing presets exist.

The same rule makes "New preset from current" a copy taken *now*: creating a
preset after an edit stores that edit in the preset that was active too. The
user-facing consequence is spelled out in the use case.

## Modules

- [`presets.ts`](../../extension-src/presets.ts) — gi-free types and pure
  operations (parse, serialize, switch, create, rename, remove), unit-tested in
  [`tests/presets.test.mjs`](../../tests/presets.test.mjs).
- [`presetStore.ts`](../../extension-src/presetStore.ts) — GSettings side:
  reads the live snapshot and applies one inside `delay()` / `apply()` on a
  private `Gio.Settings`, so the panel receives the five keys as one change.
  Never on the shared object: `delay()` does not end with `apply()`, and every
  later write through that object would be held back (`t-29` pins this).
- [`controlButton.ts`](../../extension-src/controlButton.ts) — the handle menu's
  preset section, rebuilt on every open and empty while there are no presets.
  Creating, renaming and deleting live in preferences only: they are
  configuration, which does not earn a menu row (`docs/process/ux.md`).
- [`prefs.ts`](../../extension-src/prefs.ts) — the **Preset** group, first on
  the page; deletion returns the previous raw value for the toast's Undo. The
  widget list re-reads `widgets` on `changed::widgets`, since a switch from the
  menu rewrites it under an open window.

UI regression: [`tests/ui/t-29-presets.sh`](../../tests/ui/t-29-presets.sh).

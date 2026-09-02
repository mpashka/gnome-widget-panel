# ubuntu-system-status widget

`@tag:widget-ubuntu-system-status`

Back to [plugins index](../index.md).

## Purpose

Shows standard Ubuntu/GNOME system indicators such as network, volume, battery
and related quick settings state inside the floating panel.

## Source files

- `index.ts` — plugin entrypoint.
- `quickButton.ts` — wraps GNOME Shell `quickSettings`, clones visible
  indicators and redirects menu source actor while mapped.

## Behavior notes

- Icon indicators are cloned as `St.Icon` bound to the original's `gicon`;
  **text** indicators (the battery percentage, a net-speed readout) are cloned
  as a drawn [`PanelText`](../../panelText.ts) instead of an `St.Label`. An
  upright "100%" needs 40px, and in the 20px vertical strip Pango ellipsized it
  to a bare `…` — three dots at the end of the button and no reading at all.
  The drawn text turns with the strip (`setPanelLayout`, forwarded to every
  clone; the layout is remembered because the clones are rebuilt whenever the
  shell adds or removes an indicator) and is a notch smaller there
  (`.quick-status-text`), so the turned glyphs fit the strip's width. Pinned by
  [`t-23-vertical-strip.sh`](../../../tests/ui/index.md).
- The clones are **destroyed**, not just removed, when they are rebuilt: each
  drawn label owns the handler that feeds it.

## Related docs

- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)

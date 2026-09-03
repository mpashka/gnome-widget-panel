# clock widget

`@tag:widget-clock`

Back to [plugins index](../index.md).

## Purpose

Shows a clock/date button inside the floating panel and opens the standard
GNOME date menu from that location. The label text is rendered from a
configurable strftime/`date` template.

## Options

- `format` — strftime-style template rendered by
  `GLib.DateTime.get_now_local().format(...)`, e.g. `%H:%M` or
  `%a %d %b %H:%M:%S`. Defaults to `%H:%M`. Edited in `prefs.ts`.
  The same string also carries the **font styling**: a small HTML-like subset
  (Pango markup) — `<b>`, `<i>`, `<u>`, `<s>`, `<big>`, `<small>`, `<tt>` and
  `<span foreground="#rrggbb">` — so one part of the time can be styled
  differently from another (`<b>%H:%M</b><small>:%S</small>`). Styling lives in
  the template rather than in separate bold/italic/colour switches for exactly
  that reason. Markup Pango rejects is drawn with its tags stripped: a typo
  costs the styling, never the clock.
  The **default weight is plain**: the clock paints with the font of its own
  theme node, and the shell theme puts `font-weight: bold` on `.button` (the
  style class of every panel widget button), so
  [`../../stylesheet.css`](../../stylesheet.css) resets it for `.clock-time`.
  Bold is something the template asks for with `<b>`, not something the clock
  starts with.

## Source files

- `index.ts` — plugin entrypoint; passes `options` to the button.
- `dateButton.ts` — wraps GNOME Shell `dateMenu` (redirects menu source actor
  while mapped, restores it on unmap/destroy) and renders the `format` label on
  a one-second timer released in `destroy()`. Implements
  `setPanelLayout({vertical, rotation})` by handing it to the shared
  [`panelText.ts`](../../panelText.ts): the time is *drawn* with PangoCairo, so
  in a vertical panel it turns 90° (`rotation` `left`/`right` picks the
  direction) and asks for the swapped size instead of widening the strip.
  `layoutClockText()` feeds the Pango layout as markup when the template uses
  the supported subset — for the **size request as well as the drawing**, since
  measuring plain text while drawing bold/big markup clips the time.
- `clockMarkup.ts` — gi-free helpers (`hasMarkup`, `stripMarkup`) deciding
  whether a formatted time should go through Pango's markup parser and how to
  salvage it when it does not parse. Unit-tested in
  [`tests/clockMarkup.test.mjs`](../../../tests/index.md).
- `prefs.ts` — per-widget settings UI: an `Adw.EntryRow` editing `format`, the
  supported-markup hint, and a live preview of the current time through the
  entered template that reports invalid markup before it reaches the panel.

## Related docs

- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)

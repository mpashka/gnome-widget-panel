# Launch — starting things and reaching windows

`@tag:use-case`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals that make the panel worth its screen space: start an application, get
to a folder, land on the right window. The bar for each of them is the number of
gestures counted **from the desktop you are already looking at** — see
[`ux.md`](../../../process/ux.md).

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1), [P2](../steps.md#p2) — the panel is on screen with its
  widgets showing.
- [P3](../steps.md#p3) — the widget the case uses is on the panel. Applications
  is there by default; Places, Launch, App windows and Screenshot are
  [added](../configure/add-widget.md) first.
- A menu opens with [S3](../steps.md#s3) and closes with the same click or with
  [S7](../steps.md#s7).

## After

- Nothing here changes the panel's configuration; these are everyday actions.
- Where a menu can change state (favorites, an edited entry), the change is
  visible in the menu that is still open — you never reopen anything to check.

## Cases

- [`start-application.md`](start-application.md) — "Start this program", by
  pointing at it.
- [`find-application.md`](find-application.md) — "I know its name, not its
  category."
- [`favorites.md`](favorites.md) — "Keep the ones I use to hand."
- [`edit-application.md`](edit-application.md) — "Its name, icon or command is
  wrong."
- [`open-place.md`](open-place.md) — "Open my Downloads folder."
- [`switch-window.md`](switch-window.md) — "Which of my six terminals is the
  right one?"
- [`run-command.md`](run-command.md) — "One click for a command line I run all
  day."
- [`open-overview.md`](open-overview.md) — "Show me everything / clear the
  desktop."
- [`screenshot.md`](screenshot.md) — "Grab a picture of this."

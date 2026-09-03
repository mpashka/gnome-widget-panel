# "Show me everything / clear the desktop"

`@tag:use-case` `@tag:widget-gnome-action`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** I want GNOME's own Overview or application grid, or a clear desktop —
and the corner or the keyboard shortcut is not where my hand is.

## Also assumes

A **Gnome Action** widget on the panel ([add it](../configure/add-widget.md))
with its action chosen.

## Steps

1. **Click the button.** It performs its one action:
   - **Overview** (the default) — GNOME's window overview;
   - **Apps** — the application grid;
   - **Show desktop** — minimise every window.

**Cost.** One click.

## Variants

- **All three.** The widget is multi-instance: add it three times, one action
  each, with distinct [icons](../steps.md#s10) —
  [`../configure/several-instances.md`](../configure/several-instances.md).
- **I hid the top bar and lost Activities.** This is the replacement —
  [`../setup/replace-top-bar.md`](../setup/replace-top-bar.md).
- **I want to browse or search applications**, not see windows: the panel's own
  [applications menu](start-application.md) is two clicks and never leaves the
  desktop.

## Result

GNOME does what it always does — this is a button on the panel for an action
that was already there, and the choice of which action
[survives a restart](../steps.md#r2).

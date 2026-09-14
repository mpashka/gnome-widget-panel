# Write — typing what the physical keyboard has no keys for

`@tag:use-case`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals where the text is being written somewhere else — a messenger, a
browser, an editor — and the panel only supplies what the physical keyboard
cannot. The panel must never take the text away from where it is being written:
every case here keeps the application focused.

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1), [P2](../steps.md#p2).
- [P3](../steps.md#p3) — **Screen keyboard** is optional, so
  [add](../configure/add-widget.md) it first.
- The cursor is already in the application's text field.

## After

- Nothing is saved: the text lives in the application. The keyboard remembers
  its script and its place until the panel is rebuilt or the shell restarts.

## Cases

- [`serbian-letters.md`](serbian-letters.md) — "I am writing a message in
  Serbian, and my keyboard has no Serbian letters."

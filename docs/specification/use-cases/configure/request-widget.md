# "The widget I need doesn't exist"

`@tag:use-case` `@tag:process`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** I want something the panel does not host — a weather reading, a disk
monitor, a timer of my own — and I would rather ask than fork.

## Steps

1. [S2](../steps.md#s2) → **Add a widget…**.
2. The top row of that page is **Request a widget…**. It opens a **prefilled
   widget-request form** on GitHub in your browser.
3. Describe the widget: what it shows, where the data comes from, and — the part
   that decides whether it gets built — **the goal it serves and the gestures it
   saves you**.

**Cost.** Two clicks to the form, then as much text as you care to write.

## Variants

- **Someone may have asked already.** Check the existing issues, open **and**
  closed, and add a comment or a reaction to the matching one instead of filing
  a second — demand for one issue is readable, demand split across five is not.
- **It exists but is not built yet.** The **Roadmap** row in the About group
  lists the planned ones; voting is by GitHub reaction. Background ideas that
  nothing serves yet live in
  [`../../../roadmap/widget-ideas.md`](../../../roadmap/widget-ideas.md).
- **It is not a widget but a bug.** [`../support/report-bug.md`](../support/report-bug.md).
- **I would rather write it.** A widget is one directory with one entry point;
  the contract is in
  [`../../../implementation/architecture.md`](../../../implementation/architecture.md).

## Result

An issue that can be prioritised, commented on and voted for. Use cases are how
this project decides what to build — a request phrased as one
([`ux.md`](../../../process/ux.md)) is the one that gets designed.

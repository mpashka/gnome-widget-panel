# app-notifications widget

`@tag:widget-app-notifications`

Back to [plugins index](../index.md).

## Purpose

Shows application AppIndicator/tray notification icons inside the floating
panel.

## Source files

- `index.ts` — creates an `IndicatorsDrawer` filtered to roles beginning with
  `appindicator`.

## Behavior notes

- Every cloned indicator is its own button (`#extBtn`), which is why this widget
  needs a spacing rule of its own in a vertical strip: the button's padding
  stacks on the icon's own and pushed neighbouring tray icons 44px apart, while
  the quick-settings icons in the same strip — all inside a single button — sit
  28px apart. `stylesheet.css` gives the vertical `#extBtn` a 20px icon (the
  strip's width) with 4px of button padding, so both icon strips keep the same
  rhythm. Pinned by [`t-23-vertical-strip.sh`](../../../tests/ui/index.md).

## Related docs

- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)

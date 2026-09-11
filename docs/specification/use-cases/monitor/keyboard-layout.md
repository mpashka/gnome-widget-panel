# "Which layout am I about to type in?"

`@tag:use-case` `@tag:widget-keyboard-layout`

Back to [monitor](index.md) · [use cases](../index.md).

**Goal.** I type in two or three languages and want to know which one is active
*before* typing a password into a field that shows dots.

## Steps

1. **Glance at the Keyboard layout widget** — it mirrors GNOME's input-source
   indicator (`us`, `ru`, …).
2. Switch layouts as you always do; the widget follows, and it also inherits the
   shell indicator's own layout-switch behaviour.

**Cost.** Zero clicks — the answer is on the panel.

## Variants

- **The list of layouts.** It is GNOME's — set in **Settings → Keyboard**; the
  widget shows what the session has, it does not manage them.
- **This widget has no settings.** By design: it mirrors the shell indicator.
- **Nothing shows.** With a single input source GNOME has nothing to indicate;
  the widget follows the session.
- **I hid the top bar and lost the indicator.** This widget is the replacement —
  [`../setup/replace-top-bar.md`](../setup/replace-top-bar.md).

## Result

Nothing changes. This is the cheapest widget on the panel and it exists to
prevent one specific waste of time: discovering the layout after typing.

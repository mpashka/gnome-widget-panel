# "I want this panel on my desktop"

`@tag:use-case`

Back to [setup](index.md) · [use cases](../index.md).

**Goal.** I have a GNOME desktop and no panel; I want the floating widget strip
running, with something useful already on it.

## Also assumes

Nothing — this is the one case that starts from an empty desktop, so
[P1](../steps.md#p1) is what it *produces*.

## Steps

1. Open the extension's store page —
   **https://extensions.gnome.org/extension/10381/gnome-widget-panel/** — in a
   browser with the GNOME Shell integration, or find **GNOME Widget Panel** in
   the **Extensions** / **Extension Manager** app.
2. Switch it on. The panel appears with the **default widgets** already on it:
   Applications, Keyboard layout, App notifications, CPU load, AI agent usage,
   Clock and System status.
3. Drag it where you want it ([S8](../steps.md#s8)).

**Cost.** Two clicks and a drag; no configuration to do before it is useful.

## Variants

- **Picking the right version for an older GNOME.** The support matrix — which
  panel version runs on which GNOME Shell — is in
  [`CHANGELOG.md`](../../../../CHANGELOG.md); the store serves the matching one
  automatically.
- **Installing from source** (to get an unreleased fix, or to develop): see the
  [README](../../../../README.md) and, for the reload-without-logout workflow,
  [`development.md`](../../../process/development.md).
- **The panel is not where you expect after a login.** It comes back where you
  left it ([R2](../steps.md#r2)); if it comes back *collapsed*, that state
  persists too — [expand it](collapse-panel.md).

## Result

A floating strip on the desktop that keeps its position and its widget list
across restarts. What is on it next is [`configure/`](../configure/index.md);
what each of the default widgets does is the
[widgets catalog](../../widgets.md).

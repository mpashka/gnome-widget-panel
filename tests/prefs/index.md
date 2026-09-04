# Preferences smoke tests

`@tag:ui-testing`

Back to [`../index.md`](../index.md) · the headless Shell suite is
[`../ui/index.md`](../ui/index.md).

The third kind of test in this repository, and the only one that runs the
**preferences process**:

| Suite | What it runs | Command |
| --- | --- | --- |
| [`../`](../index.md) | gi-free pure logic, Node's runner | `npm test` |
| [`../ui/`](../ui/index.md) | the panel inside a headless GNOME Shell | `npm run test:ui` |
| here | the GTK4/libadwaita settings pages | `npm run test:prefs` |

## Why it exists

A widget's settings button failing is **invisible**. `prefs.ts`'s
`_openWidgetPreferences` catches whatever the widget's module throws, logs it
and returns — so a broken settings page is indistinguishable from a button that
does nothing, and the only evidence is a line in the journal nobody reads.

Two regressions have shipped this way, both the same defect: a GObject
initializer handed `undefined` for an optional property, which GJS rejects
outright.

- `colorButton` passed `tooltip_text: undefined` → the CPU widget's settings
  would not open. Fixed with `definedProps` (see [`props.test.mjs`](../props.test.mjs)).
- `durationRow` passed `subtitle: undefined` for the break timer's three
  `Pause N` rows → the break timer's settings would not open.

Neither is visible to `tsc` (both files are `// @ts-nocheck`), and neither is
reachable from the gi-free unit tests, because both need real Adw widgets.

## Files

- `widget-prefs-open.js` — walks `PLUGIN_DESCRIPTORS`, and for every widget that
  declares `hasPreferences`: loads its prefs module, builds its page, then
  **presses every control on it** — buttons and activatable rows — and repeats
  on any subpage a press opened (the break timer's per-timer pages), to a depth
  of 3. Controls that only open a modal chooser (the colour rows) are built but
  not pressed: mapping a real dialog is not what this checks, and its pending
  cancellable aborts GTK at finalize.
- `run.sh` — builds, then runs the above with **`HOME` redirected to a throwaway
  directory**. This matters: clicking through the AI widgets presses their
  *Configure* button, which installs Claude hook scripts into `~/.claude`.

## Running it

```bash
npm run test:prefs            # build + run
SKIP_BUILD=1 npm run test:prefs
```

It needs a display, because these are real GTK widgets — any desktop session
will do (nothing is ever shown on screen). Headless CI runs it under the same
`gnome-shell --headless` the UI suite boots.

## What it does not cover

Layout, focus order, whether a row's value is *right*, and anything that only
happens after the settings window is shown. It answers one question — does this
page open and survive being clicked through — which is exactly the question the
two shipped regressions failed.

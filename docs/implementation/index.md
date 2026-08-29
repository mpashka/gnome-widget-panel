# Implementation

`@tag:mechanism`

How GNOME Widget Panel is built inside: the host that owns the floating panel,
the plugin registry that fills it, the runtime objects they create and the
settings plumbing behind them. The user-visible side of the same features is in
[`../specification/index.md`](../specification/index.md).

## Files

- [`architecture.md`](architecture.md) — host/plugin architecture, configuration
  as the source of truth, the plugin contract and the `ai-agent-usage`
  out-of-process collector design (`@tag:mechanism`).
- [`object-model.md`](object-model.md) — runtime object map: which object owns
  which actor, signal and timer (`@tag:ui`).
- [`preferences.md`](preferences.md) — the widget-management preferences window,
  the per-widget settings mechanism, the icon picker and the About group
  (`@tag:ui`, `@tag:mechanism`).
- [`upstream.md`](upstream.md) — Floating Mini Panel origin and license
  obligations of the derived code.

## Related

- Per-widget implementation notes live next to the code, in
  [`../../extension-src/plugins/<id>/index.md`](../../extension-src/plugins/index.md).
- Build and install mechanics: [`../process/development.md`](../process/development.md).

Back to the [documentation index](../index.md).

# caffeine widget

`@tag:widget-caffeine`

Back to [plugins index](../index.md).

## Purpose

A toggle panel button that manually keeps the session awake: while active it
inhibits both the screensaver and automatic suspend. Meant for calls (e.g.
Zoom) on Wayland — native meeting clients frequently fail to inhibit idle
themselves, so GNOME's screensaver/lock can still kick in mid-meeting, unlike
browser-based/web clients which usually inhibit idle through the
`org.freedesktop.portal.Inhibit` portal. This widget is a manual fallback for
that gap: click it before a call, click it again (or close the panel) when
done.

## Options

- `icon` — symbolic icon name shown on the button while **inactive**.
  Defaults to `preferences-desktop-screensaver-symbolic`. Edited in `prefs.ts`
  via the shared searchable icon picker
  ([`../iconPicker.ts`](../iconPicker.ts)).
- `text` — optional text label shown next to (or instead of) the icon, in
  both states. Defaults to empty (icon only).
- `inhibitSuspend` — boolean, default `true`. When active, also inhibits
  automatic suspend in addition to the screensaver/idle lock. Set to `false`
  to only block the screensaver while still allowing the system to suspend.

While **active** the button always shows the fixed "awake" icon
(`display-brightness-symbolic`), regardless of the configured `icon`, so the
state is unmistakable at a glance; a custom `text` label stays visible in both
states. The button also gets the `checked` style pseudo-class while active.

## D-Bus mechanism

Uses `org.gnome.SessionManager`'s inhibitor API directly (no portal, since
this needs to work for the shell panel itself, not a sandboxed app):

- On activation: async `Inhibit(app_id, toplevel_xid, reason, flags)` on
  `org.gnome.SessionManager` at `/org/gnome/SessionManager`, with
  `app_id = 'gnome-widget-panel'`, `toplevel_xid = 0`, `reason = 'Manual
  caffeine: keep screen awake during a call'`. `flags` is `4` (inhibit the
  session being marked idle) alone when `inhibitSuspend` is `false`, or
  `4 | 8 = 12` (also inhibit suspend) by default. The returned cookie is
  stored; the button only switches to the active visual state once a cookie is
  actually received, and reverts to inactive if the call fails.
- On deactivation (including `destroy()`): async `Uninhibit(cookie)`, then the
  cookie is cleared. The call from `destroy()` is fire-and-forget (guarded, no
  visual update since the actor is going away).
- All D-Bus calls and the click handler are wrapped in try/catch so a failure
  (e.g. no session manager, call error) can never throw out of `create()` or
  disable the panel.

## Source files

- `index.ts` — plugin entrypoint; `CaffeineButton` (`St.Button` subclass)
  owning the Inhibit/Uninhibit D-Bus calls and the active/inactive visual
  state.
- `prefs.ts` — per-widget settings UI: an icon-picker row for `icon`
  (inactive state), an `Adw.EntryRow` for `text`, and an `Adw.SwitchRow` for
  `inhibitSuspend`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

Not added to the default widget config; add it manually from preferences.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)

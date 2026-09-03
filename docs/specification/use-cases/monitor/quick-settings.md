# "Which network, is the VPN up, turn the volume down"

`@tag:use-case` `@tag:widget-ubuntu-system-status`

Back to [monitor](index.md) · [use cases](../index.md).

**Goal.** Everything the top-right corner of GNOME gave me — network, volume,
battery, VPN — read from the panel, and changed without a detour.

## Steps

1. **Glance at the System status widget.** It mirrors GNOME's Quick Settings
   indicators live, labels included, so the state is on the panel.
2. [S3](../steps.md#s3) — a left click opens the **real Quick Settings menu**,
   not a copy of it.
3. **Scroll** over the volume (or caffeine) indicator to adjust it without
   opening anything.

**Cost.** Zero clicks to read, one to open the menu, a scroll for the volume.

## Variants

- **Straight to power / log out / restart.** [S6](../steps.md#s6) — right-click
  opens Quick Settings with the **system/power submenu already expanded**, which
  is one click fewer than opening it and clicking down into it.
- **This widget has no settings.** Correct — it shows GNOME's own indicators and
  inherits their behaviour, so there is nothing here to configure. If you want
  it gone, [switch it off](../configure/disable-widget.md).
- **I hid the top bar.** Then this widget *is* your indicator area —
  [`../setup/replace-top-bar.md`](../setup/replace-top-bar.md).
- **Application tray icons** are a different widget:
  [`background-apps.md`](background-apps.md).

## Result

Whatever you change is changed in GNOME itself — the panel is a place to reach
the real menu, not a second copy of these settings.

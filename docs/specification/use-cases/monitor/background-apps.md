# "Is my sync client still running?"

`@tag:use-case` `@tag:widget-app-notifications`

Back to [monitor](index.md) · [use cases](../index.md).

**Goal.** The applications that live in a tray icon — sync clients, messengers,
VPN GUIs, password managers — should be visible and reachable, the way they were
before GNOME dropped the tray.

## Steps

1. **Glance at the App notifications widget.** It shows each running
   application's own AppIndicator/tray icon.
2. **Click** an icon — it keeps that application's own click and menu behaviour;
   the panel does not intervene.

**Cost.** Zero clicks to see what is running, one for the application's own
menu.

## Variants

- **It takes too much width when many apps are running.** [Toggle the indicator
  drawer](../steps.md#s9) — middle-click the panel handle — to get the
  indicators out of the strip and back.
- **An icon is missing.** The application has to publish an AppIndicator/tray
  icon for anything to show; some publish only a notification instead, which
  appears in [the clock's](read-clock.md) notification list.
- **This widget has no settings.** By design: the icons and menus belong to the
  applications. Switch the widget off if you do not want them
  ([`../configure/disable-widget.md`](../configure/disable-widget.md)).
- **System indicators** (network, volume, battery) are a different widget:
  [`quick-settings.md`](quick-settings.md).

## Result

Nothing changes on the panel's side; you either learned that the application is
alive or acted through its own menu.

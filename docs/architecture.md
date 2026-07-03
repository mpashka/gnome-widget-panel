# Architecture

```text
widget repositories → reviewed installer/registry → GNOME Shell host
                              ↑                         ↓
                     user collectors              cache reads
```

The host owns positioning, order, lifecycle and error isolation. A repository
provides `gnome-widget.json`, a GJS `createWidget(context)` entrypoint and
optional out-of-process collectors. Installations pin a revision and display
permissions before activation. Broken widgets are disabled independently.

Installed widgets live below
`~/.local/share/gnome-widget-panel/widgets/<id>/`.

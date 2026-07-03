# GNOME Widget Panel

Compact floating panel for Ubuntu/GNOME, inspired by XFCE panel widgets.
Independent widget repositories provide a manifest and GJS renderer. The first
integration target is `ai-agent-usage-widget`.

The repository now contains the working Floating Mini Panel based implementation
under `extension/`, split into configured built-in plugins.

## Current plugins

- `keyboard-layout`: GNOME keyboard layout indicator;
- `app-notifications`: application AppIndicator/tray notifications;
- `cpu-load-monitor`: compact CPU graph with temperature colors;
- `clock`: GNOME clock/calendar button;
- `ubuntu-system-status`: Ubuntu Quick Settings indicators for Wi-Fi, sound,
  battery and related standard system state.

Plugin order and enabled state are configured in
`~/.config/gnome-widget-panel/widgets.json`. The bundled default is
`extension/config/widgets.json`. Edit the user file and reload GNOME Shell
(logout/login on Wayland) to apply changes.

## Install development build

```bash
./install.sh
```

The new extension uses UUID `gnome-widget-panel@mpashka.github.com`; it can be
tested without overwriting the previously installed Floating Mini Panel.

# XFCE-inspired widget ideas

`@tag:reference`

Research notes: which additional panel widgets are worth adding to GNOME Widget
Panel, derived from surveying the XFCE panel plugin ecosystem (xfce4-panel
built-ins, the `xfce4-*-plugin` / xfce4-goodies family, and popular third-party
plugins). This is a planning reference only — no code is prescribed here.

Each candidate is assessed against **this project's architecture**: a plugin is
`extension-src/plugins/<id>/index.ts` exporting `create(parent, options)` that
returns an St/Clutter actor with `destroy()`, registered in
[`../extension-src/plugins/registry.ts`](../extension-src/plugins/registry.ts);
menus use `PopupMenu`; anything heavy or blocking runs **out of process** like
the Codex helper (see [`architecture.md`](architecture.md)). GNOME/Ubuntu data
comes from D-Bus, `/proc`/`/sys`, GLib/Gio, or GSettings.

See the current widgets in
[`../extension-src/plugins/index.md`](../extension-src/plugins/index.md).

## Already covered (do not duplicate)

These XFCE plugins already have an equivalent here, so they are out of scope:

| XFCE plugin | Covered by |
| --- | --- |
| Applications menu / Whisker menu | [`gnome-menu`](../extension-src/plugins/gnome-menu/index.md) |
| Places | [`favorites`](../extension-src/plugins/favorites/index.md) |
| Keyboard layouts | [`keyboard-layout`](../extension-src/plugins/keyboard-layout/index.md) |
| Notification area / systray | [`app-notifications`](../extension-src/plugins/app-notifications/index.md) |
| CPU graph / system-load (CPU) | [`cpu-load-monitor`](../extension-src/plugins/cpu-load-monitor/index.md) |
| Clock / Orage / DateTime | [`clock`](../extension-src/plugins/clock/index.md) |
| PulseAudio/volume, battery/power, brightness, netload (status) | [`ubuntu-system-status`](../extension-src/plugins/ubuntu-system-status/index.md) |
| Show desktop / overview | partly [`activities`](../extension-src/plugins/activities/index.md) |
| Screenshooter | planned `printscreen` |
| Launcher | planned `launch` |

## Candidate widgets

Effort is a rough GJS/Shell-50 estimate: **low** = a few hours (pure St + one
GSettings/Gio call), **medium** = a day-ish (parsing, a menu, or a poller),
**high** = multi-day or needs an out-of-process collector plus protocol.

| Candidate | What it does | GNOME/Ubuntu data source | Effort | Verdict |
| --- | --- | --- | --- | --- |
| **Workspace switcher / pager** | Shows workspaces as clickable cells; click to switch, indicates active/occupied | `global.workspace_manager` (Meta), `switch_to` API; no D-Bus needed | low–medium | **Add.** High value, all in-process Shell API |
| **Window buttons / tasklist** | Buttons for open windows on the current workspace; click to focus/minimise | `global.get_window_actors()` / `Meta.Window`, `Shell.WindowTracker` for app+icon | medium–high | Add later. Layout-heavy on a floating panel; valuable but fiddly |
| **Window menu** | Dropdown listing all open windows to jump to one | same Meta window enumeration + `PopupMenu` | low–medium | Good cheap alternative to a full tasklist |
| **Generic monitor (genmon)** | Runs a user command on an interval and shows its stdout (label/icon), optional click action | `Gio.Subprocess` out-of-process, GLib interval; template like `tooltipTemplate.ts` | medium | **Add.** Extremely versatile; unlocks many custom monitors with one widget |
| **Sensors / temperature** | Temperature/fan/voltage readouts beyond CPU | `/sys/class/hwmon/*`, or `lm-sensors` via `Gio.Subprocess` | medium | Add. Reuses cpu-load band/tooltip patterns |
| **Netload (throughput graph)** | Live up/down network rate, per-interface | `/proc/net/dev` polled, or `/sys/class/net/*/statistics` | medium | Add. Complements cpu-load-monitor as a second graph |
| **Memory/swap monitor** | RAM/swap usage bar or graph | `/proc/meminfo` (or GTop) | low–medium | Add. Cheap, pairs with CPU/net graphs |
| **Disk performance (diskperf)** | Read/write throughput or I/O | `/proc/diskstats` polled | medium | Optional; niche |
| **Clipboard manager (clipman)** | History of copied text/images; menu to re-paste | `St.Clipboard` for get/set; needs a background poller for history | medium–high | **Add.** Popular daily-use tool; polling clipboard is the main cost |
| **Weather** | Current conditions + forecast in a menu | GNOME Weather via `libgweather` (GI) or a REST API through an out-of-process helper | medium–high | **Add.** High user value; `libgweather` avoids API keys |
| **Action buttons (log out / lock / suspend)** | One-click session actions | `org.gnome.ScreenSaver`, `org.freedesktop.login1`, `org.gnome.SessionManager` D-Bus | low | **Add.** Low effort, high utility; menu or button row |
| **Show desktop** | Toggle minimise-all / peek desktop | Meta window minimise, or `org.gnome.Shell` overview API | low | Small; overlaps `activities` conceptually |
| **Trash** | Trash icon with fill state + empty/open actions | `Gio.File` on `trash://`, `FileMonitor` for count | low–medium | Add. Self-contained, no daemon |
| **Mount / eject** | List removable volumes, mount/unmount/eject | `Gio.VolumeMonitor`, `GVolume`/`GMount` | medium | Add. Clean Gio API, useful on laptops |
| **CPUfreq** | Shows CPU governor/frequency; optional governor switch | `/sys/devices/system/cpu/*/cpufreq/*` (switching needs privilege) | low read / high switch | Add read-only; skip the privileged switch initially |
| **Verve (command line)** | Inline command/URL entry that launches commands or web searches | `St.Entry` + `Gio.Subprocess` / `Gio.AppInfo` | medium | Optional; overlaps planned `launch` |
| **Timer / countdown** | Countdown with notification on expiry | GLib timers + `Main.notify` / notifications D-Bus | low | Nice low-effort extra |
| **Mail watcher** | Unread-count indicator for IMAP/local mail | out-of-process IMAP helper (`Gio.Subprocess`), or Evolution D-Bus | high | Skip for now; secret handling + protocol |
| **Separator / spacer** | Fixed or expanding spacing between widgets | pure St layout, no data source | trivial | **Add.** Layout primitive that improves every panel arrangement |
| **Dictionary / smartbookmark** | Word lookup / parametric web bookmark | `Gio.AppInfo.launch_default_for_uri` with a query template | low | Low value on a compact panel; skip |

## Prioritized shortlist (add next)

1. **Separator / spacer** — trivial layout primitive; makes ordering the other
   widgets on a floating panel actually usable.
2. **Workspace switcher / pager** — high value, entirely in-process Meta API,
   low–medium effort; a classic panel staple with no equivalent yet.
3. **Generic monitor (genmon)** — one configurable "run a command, show output"
   widget replaces a whole class of bespoke monitors; reuses the existing
   `Gio.Subprocess` and tooltip-template patterns.
4. **Action buttons (log out / lock / suspend)** — very low effort over
   `login1`/`ScreenSaver` D-Bus, immediately useful.
5. **Weather** — high user demand; `libgweather` gives data without API keys,
   rendered into a `PopupMenu`.
6. **Clipboard manager** — popular daily tool; `St.Clipboard` + a lightweight
   history poller (watch out-of-process if it proves heavy).
7. **Netload + memory monitors** — second/third graphs alongside
   `cpu-load-monitor`, sharing its band/tooltip design; `/proc` sources only.
8. **Trash / Mount** — small, self-contained Gio-based widgets (`trash://`
   FileMonitor and `Gio.VolumeMonitor`) with clear utility on laptops.

Overlaps to note: **screenshooter** is the planned `printscreen`; **launcher**
(and much of **verve**) is the planned `launch`; volume/battery/brightness live
in `ubuntu-system-status`; applications menu, places and keyboard layouts are
already `gnome-menu`, `favorites` and `keyboard-layout`.

Back to the [documentation index](index.md) and working rules in
[`../AGENTS.md`](../AGENTS.md).
</content>
</invoke>

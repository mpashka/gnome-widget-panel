# Widgets catalog

`@tag:widget-ai-agent-usage`

Back to the [user guide](index.md).

Every item on the panel is a **widget**. You add, remove, reorder and configure
them in the preferences UI (`gnome-extensions prefs
gnome-widget-panel@mpashka.github.com`, or the gear button in the Extensions
app). Changes apply live.

**Common settings.** Most button-style widgets share two options:

- **Icon** — pick any symbolic icon from the built-in icon picker.
- **Label** — an optional text label shown next to (or instead of) the icon.

Graph and indicator widgets add their own options (colours, width, update
interval, tooltip template), listed per widget below. Icon names shown below in
`code font` are the built-in defaults; you can change them.

The **default panel** ships with: Applications menu, Keyboard layout, App
notifications, CPU load, AI agent usage, Clock and System status. The other
widgets are optional — add them from preferences.

---

## Menus & launchers

### Applications — `gnome-menu`
- **Icon:** `start-here-symbolic` (the distributor "start" icon — the Ubuntu logo
  on Ubuntu). Each entry inside the menu shows its own app icon.
- **What it does:** opens a two-column categorised application menu (like the
  XFCE/Whisker menu): categories on the left, that category's apps on the right.
- **Interactions:** click toggles the menu; hovering a category previews its apps;
  clicking an app launches it.
- **Settings:** icon, label.

### Gnome Action — `gnome-action`
- **Icon:** depends on the chosen action — `focus-windows-symbolic` (Overview),
  `view-app-grid-symbolic` (Apps), `user-desktop-symbolic` (Show desktop).
- **What it does:** a button that runs one GNOME action on click: open the
  **Overview** (default), open the **application grid**, or **show the desktop**
  (minimise all windows).
- **Interactions:** single click runs the action.
- **Settings:** **action** (Overview / Apps / Show desktop), icon, label.

### Places — `favorites`
- **Icon:** a folder / file-manager icon (`folder-symbolic`).
- **What it does:** opens a **Places** menu — Home, your XDG folders (Documents,
  Downloads, Pictures…) and your file-manager bookmarks.
- **Interactions:** click opens the menu; selecting an entry opens it in your file
  manager.
- **Settings:** icon, label (default `Places`).

### Launch — `launch`  *(optional)*
- **Icon:** `application-x-executable-symbolic`.
- **What it does:** a custom launcher that runs a command line you specify. Add it
  several times to build a row of your own launch buttons.
- **Interactions:** click runs the command (nothing happens if it is empty).
- **Settings:** **command** (e.g. `gnome-terminal -- htop`), icon, label.

### Screenshot — `printscreen`  *(optional)*
- **Icon:** `camera-photo-symbolic`.
- **What it does:** opens the GNOME interactive screenshot overlay (the same one
  the PrtSc key shows — area/window/screen capture and screen recording).
- **Interactions:** click opens the screenshot overlay.
- **Settings:** icon, label.

---

## Monitors & system indicators

### Clock — `clock`
- **Icon:** none — shows the date/time as **text**; also mirrors the GNOME
  notifications indicator.
- **What it does:** shows a configurable clock and opens the GNOME
  calendar/notifications menu when clicked.
- **Interactions:** click toggles the calendar popup.
- **Settings:** **format** — a strftime-style string, default `%H:%M` (e.g.
  `%a %d %b %H:%M`).

### CPU Load — `cpu-load-monitor`
- **Icon:** a self-drawn **bar graph** (no icon). Each column is coloured by CPU
  temperature bands — green `#3dc752`, yellow `#ffc729`, red `#f03333`.
- **What it does:** a compact scrolling CPU-load graph whose colour reflects CPU
  temperature.
- **Interactions:** hover shows a tooltip with current load, temperature and the
  colour-band legend.
- **Settings:** **bands** (temperature thresholds + colours), **width**,
  **update interval** (default 2 s), show/hide tooltip, tooltip template.

### System Status — `ubuntu-system-status`
- **Icon:** **dynamic** — mirrors GNOME's Quick Settings indicators (network,
  volume, battery, VPN…) live, including their labels.
- **What it does:** shows the standard quick-settings indicators in the panel and
  opens the real Quick Settings menu.
- **Interactions:** left-click opens Quick Settings; right-click opens it with the
  system/power submenu expanded; scrolling over volume/caffeine adjusts them.
- **Settings:** none.

### App Notifications — `app-notifications`
- **Icon:** **dynamic** — shows each running app's own AppIndicator/tray icon.
- **What it does:** displays application tray/AppIndicator icons in the panel.
- **Interactions:** each icon keeps its app's own click/menu behaviour.
- **Settings:** none.

### Keyboard Layout — `keyboard-layout`
- **Icon:** **dynamic** — mirrors GNOME's keyboard-layout indicator (e.g. `us`).
- **What it does:** shows the current input source (keyboard layout) in the panel.
- **Interactions:** inherits the shell indicator's layout-switch behaviour.
- **Settings:** none.

---

## AI agents

### AI Agent Usage — `ai-agent-usage`
- **Icon:** a self-drawn **token graph** (no icon) — scrolling columns plus two
  small indicator bars. Provider colours: Codex teal `#10a37f`, Claude clay
  `#d97757`, Gemini blue `#4285f4`.
- **What it does:** one compact graph of AI-agent token usage across Claude Code,
  Codex and Gemini CLI — token-load history coloured by the busiest provider, a
  marker per prompt (in that agent's colour), and two bars showing the active
  agent's rate-limit and context-window levels.
- **Interactions:** hover shows a tooltip with the agent, usage %, reset time and
  recent prompts.
- **Settings:** per-provider enable + colour, show/hide the two bars + their
  colours, **width** (default 54), **update interval** (default 5 s), tooltip
  options, and a **Configure** button that wires up the Claude Code hook.
- **Full walkthrough:** [Reading the graph](ai-agent-usage.md) with an interactive
  demo.

### AI Agent Status — `ai-agent-status`  *(optional)*
- **Icon:** a single self-drawn **status dot** (no icon), coloured by the
  most-urgent state across all your Claude Code sessions:
  - **waiting** — the agent is asking you something → **pulsing red** `#f03333`;
  - **idle** — finished, ready for your next prompt → **pulsing amber** `#ffb82e`;
  - **thinking** — generating, just wait → **solid blue** `#4ca6ff`;
  - no open sessions → a dim grey placeholder.

  A **pulsing** dot means there's a session you can type into right now.
- **What it does:** you start one or more agents and switch away with the
  conversation hidden; this one dot is your **"an agent needs me"** light. It
  flags — without opening anything — when an agent is **asking you something**
  (pulsing red) or has **finished and is ready for your next prompt** (pulsing
  amber), versus just **thinking** (solid blue), so you go back exactly when
  there's something to do instead of babysitting the terminal. Several sessions
  collapse into one dot showing the loudest state (priority waiting > idle >
  thinking); if any session is waiting the dot is red even while others think.
- **Interactions:** hover shows a summary (e.g. "1 waiting · 1 idle · 2 thinking")
  and a per-session table — that's where you see *which* agent is in which state.
- **Settings:** colour per state, whether "idle" pulses, the expiry timer,
  tooltip options, and a **Configure** button for the session hook.
- **Use case:** the widget exists to make the human + AI-agent loop faster while
  taking almost no panel space. You delegate a task and stop watching; the dot
  pulls you back only when your input unblocks the agent (a permission prompt) or
  when a turn is done to check — turning "keep glancing at the terminal" into
  "glance at one dot", so several agents can run in parallel while you do other
  work.

---

## Wellbeing & session

### Caffeine — `caffeine`  *(optional)*
- **Icon:** `preferences-desktop-screensaver-symbolic` when off; switches to
  `display-brightness-symbolic` while active.
- **What it does:** a toggle that keeps your session awake — inhibits the
  screensaver (and, by default, automatic suspend). Useful as a manual fallback
  for video calls that fail to keep the screen on.
- **Interactions:** click toggles it on/off (the button looks "pressed" when on).
- **Settings:** off-state **icon**, optional **label**, and **inhibit suspend**
  (default on — also blocks auto-suspend, not just the screensaver).

### Break Timer — `break-timer`  *(optional)*
- **Icon:** a self-drawn set of up to three **progress bars** (no icon) — micro
  break `#4ca6ff`, rest break `#3dc752`, daily limit `#ffb82e`, turning red
  `#f03333` when overdue.
- **What it does:** Workrave-style rest reminders. Three activity-based timers
  (micro / rest / daily) fill as you type and move, and reset when you step away
  long enough.
- **Interactions:** hover shows each timer as `name: elapsed/limit`; overdue
  timers say `— break!`.
- **Settings:** per-timer enable, work minutes, break seconds and colours
  (defaults: micro 10 min/30 s, rest 50 min/8 min, daily off); graph width,
  tooltip options.

---

Back to the [user guide](index.md) · developer notes live under
[`../docs/`](../docs/index.md).

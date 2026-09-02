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
  XFCE/Whisker menu): a search box above categories on the left and that
  category's apps on the right.
- **Interactions:** click toggles the menu; hovering a category previews its apps;
  clicking an app launches it. The search box has the keyboard as soon as the
  menu opens, so an application can be found by typing: matching applications
  from **every** category replace the right pane, ranked best first. An
  application is found under **either language** — the name shown in the menu,
  the untranslated name from its `.desktop` file, its generic name, keywords,
  executable or id — so a Russian desktop still finds "Settings" and an English
  one "Настройки". `Enter` launches the top match, `↓` moves into the list,
  `Escape` clears the search and then closes the menu; picking a category also
  ends the search.
  **Right-clicking an application** opens its actions where it sits: the entry's
  own `.desktop` actions ("New Window", "New Document", …), one favorites item
  (*Add to Favorites* / *Remove from Favorites*, whichever applies) and
  *Edit Application…*, which copies a system entry into
  `~/.local/share/applications` and opens it in the text editor. The Favorites
  category updates in the open menu; a click elsewhere only dismisses the
  actions. Newly installed or edited applications appear on their own.
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

### App windows — `app-windows`  *(optional)*
- **Icon:** the icon of the application currently in focus, with the window count
  as a small badge in its corner. `focus-windows-symbolic` until an application
  has been focused, or always your own icon if you turn the application icon off.
- **What it does:** lists the windows of **that application** by **title**. Made
  for several windows of the same program — a few IDE projects, a few terminals —
  where Alt+Esc shows you thumbnails that all look alike and a switcher that no
  longer fits on screen.
- **Interactions:** click opens the menu; the window you came from is marked with
  a dot; selecting a row switches to that window (changing workspace and
  unminimising it if needed). A window on another workspace, or a minimised one,
  says so on the right of its title.
- **Order:** by **title** out of the box — the list stays the same between
  openings, so the window you want ends up in a place you remember. Switch it to
  **most recently used** for switcher-style order, where the window you came from
  is always the first row.
- **Settings:** **use the application's icon** (off = always your own icon),
  **order** (by title / most recently used), **maximum windows** (the rest are
  counted as "N more"), **menu width** (a longer title is ellipsized), **windows
  on other workspaces**, **window count** (a badge in the corner of the icon),
  **tooltip template** (`{app}`, `{count}`, `{window}` — empty means no
  tooltip), icon, label.

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
- **Font styling:** the same format field accepts a small HTML-like subset for
  styling, so part of the time can look different from the rest:
  `<b>bold</b>`, `<i>italic</i>`, `<u>underline</u>`, `<small>`/`<big>` and
  `<span foreground="#ff8800">colour</span>`. Example:
  `<b>%H:%M</b><small>:%S</small>`. The settings page previews the result live
  and reports invalid markup; if invalid markup reaches the panel anyway, the
  time is shown unstyled rather than disappearing.

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
- **Interactions:** click toggles it on/off indefinitely (the button looks
  "pressed" when on). **Right-click** picks a duration instead — 15 min, 30 min,
  1 h, 2 h, or until turned off — and it switches itself off when the time is
  up. Hovering shows what it is doing and how long is left. While it is on, the
  [Break Timer](break-timer.md) widget stays silent, so one click before a
  meeting keeps the screen on *and* the reminders away. It works the other way
  round too: pausing the Break Timer keeps the screen awake for as long as the
  pause lasts, so either widget alone covers a meeting.
- **Settings:** off-state **icon**, optional **label**, and **inhibit suspend**
  (default on — also blocks auto-suspend, not just the screensaver).

### Break Timer — `break-timer`  *(optional)*
- **Icon:** a self-drawn set of three **progress bars** (no icon) — micro
  break `#4ca6ff`, rest break `#3dc752`, daily limit `#ffb82e`, turning red
  `#f03333` when overdue. A disabled timer drops its bar.
- **What it does:** Workrave-style rest reminders. Three activity-based timers
  (micro / rest / daily) fill as you type and move, and reset when you step away
  long enough. The daily one can also watch the **clock**: switch on *end of the
  working day* (21:30 by default) and its bar shows whichever comes first —
  the hours worked, or the hour itself. When one comes due it warns you with a message that never steals
  focus, then dims the screen for the break itself (Postpone / Skip / `Esc`).
  The counters survive a shell restart.
- **Interactions:** hover shows each timer as `name: elapsed/limit`; overdue
  timers say `— break!`. **Right-click** postpones or skips the reminder that is
  up and pauses the timers for 15 min, 1 h or 2 h (or resumes them). **A pause
  also keeps the screen awake** — the meeting a pause covers is exactly when a
  lock screen is unwelcome — and while it lasts the widget shows a **coffee cup
  and one bar** counting the pause down instead of the three timer bars. The
  warning message steps aside once if the pointer comes for it, and can be
  dragged anywhere.
- **Settings:** per-timer enable, work interval, break length, reminder mode,
  warning lead, postpone/skip and colours (defaults: micro 10 min/30 s,
  rest 1:00/8 min, daily 8:00) — each timer on its own settings page; the end of
  the working day (off by default, 21:30), the three pause lengths, the idle that
  ends the day, warning position, graph width, tooltip options. **Every duration
  is edited the same way:** it is written as `30 s`, `45 min` or `1:30`, and the
  `±` buttons step by more the larger the value is — a minute at a time under ten
  minutes, half an hour at eight.
- **Full behaviour:** [`break-timer.md`](break-timer.md) — the three timers,
  when each resets (including the daily counter's own rules) and the two-stage
  reminder.

---

Back to the [user guide](index.md) · developer notes live under
[`../index.md`](../index.md).

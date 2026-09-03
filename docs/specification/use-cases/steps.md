# Shared steps, preconditions and outcomes

`@tag:use-case`

Back to the [use cases](index.md) · [widgets catalog](../widgets.md).

The pieces that recur **across** areas of the [use-case tree](index.md), each
owned here once and cited from the case pages by its anchor —
`[S3](../steps.md#s3)`. Preconditions shared by one area only live in that
area's `index.md` `## Context` instead.

Find every case that uses one:

```bash
grep -rln "steps.md#s3" docs/specification/use-cases
```

## Preconditions

### <a id="p1"></a>P1 — the extension is installed and enabled

GNOME Widget Panel is installed and switched on, so the panel exists at all. See
[getting it onto the screen](setup/install.md).

### <a id="p2"></a>P2 — the panel is on screen and expanded

The panel is visible and not [collapsed](setup/collapse-panel.md): its widgets
are drawn, not just the six-dot handle.

### <a id="p3"></a>P3 — the widget is on the panel

The widget this case is about is in the panel's widget list and enabled — the
default panel ships with Applications, Keyboard layout, App notifications, CPU
load, AI agent usage, Clock and System status; everything else is
[added](configure/add-widget.md) first.

### <a id="p4"></a>P4 — the preferences window is open

The extension's preferences window is open on its **Widgets** page, reached by
[S2](#s2).

### <a id="p5"></a>P5 — the widget's own settings page is open

The settings subpage of one widget is open, reached by [S5](#s5).

### <a id="p6"></a>P6 — the agent CLI is installed

The AI agent the case is about — Claude Code, Codex or Gemini CLI — is installed
and used from this user account, since the panel reads what that CLI reports.

## Steps

### <a id="s1"></a>S1 — open the panel's own menu

**Right-click the six-dot handle** at the start of the panel. The menu holds
Collapse/Expand, *Settings…*, *Release notes*, the extensions.gnome.org page,
*Report a bug* and *Suggest a feature*.

### <a id="s2"></a>S2 — open the preferences window

[S1](#s1) → **Settings…**. Equivalent routes: the gear button next to **GNOME
Widget Panel** in the Extensions / Extension Manager app, or

```bash
gnome-extensions prefs gnome-widget-panel@mpashka.github.com
```

### <a id="s3"></a>S3 — open a widget's menu

**Left-click the widget.** Clicking it again closes the menu. Which menu appears
is the widget's business — the applications menu, Places, the GNOME calendar,
Quick Settings.

### <a id="s4"></a>S4 — read a widget's tooltip

**Hover the widget** and wait. Graph and indicator widgets put their numbers
here — load, temperature, timers, token usage — so the panel stays one strip
wide and detail costs a hover, not a click. Most tooltips can be reshaped or
turned off in the widget's settings ([P5](#p5)).

### <a id="s5"></a>S5 — open a widget's own settings

[P4](#p4) → the **gear button** on that widget's row in **Panel widgets**. It
opens in the same window as a subpage; the header bar's back button returns to
the list. Only widgets that have settings show the button.

### <a id="s6"></a>S6 — open a widget's own right-click actions

**Right-click the widget itself.** Widgets that can act on their current state
put it here — the Caffeine durations, the Break timer's postpone/skip/pause, the
System status power submenu.

### <a id="s7"></a>S7 — back out one layer

**`Escape`** dismisses exactly the layer you are in — the context menu on a row,
then the typed search, then the popup itself — one press per layer, never more.

### <a id="s8"></a>S8 — move the panel

**Drag the six-dot handle.** It starts moving on the first pointer movement and
stays where it is dropped. Snapping it to a screen edge instead is
[a setting](setup/place-panel.md).

### <a id="s9"></a>S9 — toggle the indicator drawer

**Middle-click the six-dot handle.** Ignored while the panel is collapsed, since
the drawer's contents are hidden with everything else.

### <a id="s10"></a>S10 — choose an icon

On an **Icon** row, open the built-in picker and **type part of the name** to
filter the symbolic icons; pick one. Every button-style widget takes its own
icon, so two instances of the same widget can be told apart.

### <a id="s11"></a>S11 — set a duration

Type it the way you say it — `30 s`, `45 min`, `1:30` — or use the **±**
buttons, whose step follows the value: a minute at a time under ten minutes,
half an hour up at eight. Every duration in every widget is edited this way.

## Outcomes

### <a id="r1"></a>R1 — it applies live

The running panel picks the change up at once: no logout, no GNOME Shell
restart, nothing to press. This holds for the whole widget list (add, remove,
reorder, enable) and for every panel and widget setting.

### <a id="r2"></a>R2 — it survives a restart

The state is stored in GSettings (or, for the break timers, a state file), so a
shell restart, a logout or a reboot brings it back as it was.

### <a id="r3"></a>R3 — nothing to save, nothing to confirm

There is no *Apply* and no "are you sure": the change is written when you make
it, and the same gesture undoes it.

---

Back to the [use cases](index.md).

# What the panel costs an idle GNOME Shell

`@tag:cpu-cost` `@tag:ui-testing`

Back to the [testing index](index.md). Harness:
[`../../tests/ui/cpu-bench.sh`](../../tests/ui/cpu-bench.sh).

A floating panel is drawn by `gnome-shell` itself, so every timer and every
animation a widget keeps running is CPU the whole desktop pays for, forever.
This page is how that is measured and what the measurements said.

## How to measure it

```bash
tests/ui/cpu-bench.sh <scenario> [settle_s] [measure_s]
```

The scenario boots a **throwaway headless shell** — own D-Bus bus, own
extensions dir, own dconf profile, as in [`ui-testing.md`](ui-testing.md) — lets
it settle, then samples `utime+stime` of that shell's own PID over a window and
prints one `RESULT` line in percent of one core. Scenarios: `bare` (no
extensions), `empty` (the panel with no widgets), `w:<id>[,<id>…]` (exactly those
widgets), `real` (a full widget set, override with `GWP_REAL_WIDGETS`), `others`
(the other extensions a real session runs), `all`, and `pulse` / `nopulse` /
`notick` (the agent-status widget with its pulse forced on, or its timers
released).

Three things make this the right tool rather than a profiler:

- **It needs nobody's desktop.** Switching the extension off in a real session is
  visible to whoever is sitting in front of it; the stand switches it off in a
  session nobody is looking at. That is the whole comparison the question needs.
- **A profiler is not available** on a stock Ubuntu desktop anyway:
  `kernel.perf_event_paranoid = 4` and `yama/ptrace_scope = 1` mean `perf`,
  `sysprof-cli` and `gdb` on somebody else's `gnome-shell` want root, and asking
  for a password is itself a thing on the user's screen.
- **Attribution is by subtraction**, which is why the scenarios are small: one
  widget per run, and the difference from `empty` is that widget's price.

Two limits to keep in mind. The stand rasterizes with **llvmpipe** against a
virtual monitor, so its absolute percentages are its own — compare scenarios with
each other, do not carry a number over to a real machine. And the stand turns the
**AI collector off** (`ai-collector false`): a real session's collector owns port
17861 and the `statusLine` slot in `~/.claude`, and a second one must not fight
it. The `pulse` scenario therefore forces the pulsing state through the test
driver instead of waiting for a real session to become promptable.

## What it cost, and what it costs now (gwp-231, 2026-10-05)

Nine widgets: `gnome-menu`, `keyboard-layout`, `app-notifications`,
`ai-agent-status`, `clock`, `printscreen`, `ubuntu-system-status`, `break-timer`,
`version-status`. Windows of 40 s, 1280×720.

| Scenario | Before | After |
| --- | --- | --- |
| `bare` — no extensions | 0,30 % | — |
| `empty` — panel, no widgets | 0,25–0,40 % | 0,35 % |
| `real` — all nine widgets | **0,85 %** | **0,47 %** |
| `w:break-timer` | 0,53 % | 0,40 % |
| `w:ai-agent-status` | 0,47–0,57 % | 0,40 % |
| `pulse` — one promptable session | **3,52 %** | **1,27–1,32 %** |
| `others` — the nine other extensions | 0,45 % | — |

The panel **host** is free: `empty` and `bare` are the same number. Only widgets
with sub-minute timers showed up at all; `clock`, `gnome-menu`,
`ubuntu-system-status`, `keyboard-layout`, `app-notifications` and `printscreen`
were each within the noise of `empty`.

The one large cost was not a timer but an **animation**: one 12 px dot breathing
at the monitor's frame rate cost ~3 % of a core — six times the entire rest of
the panel — for as long as any AI session was promptable, which for its author is
most of the working day.

## The two rules that came out of it

- **A panel widget does not keep a permanent eased animation.** `actor.ease()`
  interpolates at the frame rate and holds Clutter's frame clock awake for as
  long as it runs, so a pulse, a breath or a spinner that never ends costs full
  frames forever. Step the property on a timer instead
  ([`pulse.ts`](../../extension-src/plugins/ai-agent-status/pulse.ts)): the price
  then follows the step, not the refresh rate. And where an animation is bound to
  a state, its **timer exists only while that state does** — not for the life of
  the widget, easing a property nothing is using.
- **A tick repaints only when the picture would differ.** A countdown must
  recompute every second; its bars are tens of pixels wide, so the pixels change
  every twentieth tick at best. Let the draw record a short signature of what it
  drew and let the tick compare against it
  ([`breakTimerGraph.ts`](../../extension-src/plugins/break-timer/breakTimerGraph.ts),
  `_paintSignature`).

Both are the same mistake twice: periodic *work* confused with periodic *change*.

## What it is not

`gnome-shell` on this machine averaged 10,9 % of a core over five days
(48 317 s of CPU in 444 855 s of uptime, 91 % of it on the main thread), and was
reported at 27–34 % in two 5-second `top` samples. Neither number is the panel:
the whole widget set measures under 1 % here, and the high samples were taken
while a forgotten browser window was still running — compositing a window that
is actively drawing is the shell's ordinary job. At GUI-idle the same shell
sampled 1,3–4,2 % of a core over nine minutes, with the step between those two
levels matching the pulse going on and off.

## Related

- [`ui-testing.md`](ui-testing.md) — the harness the stand is built on.
- [`../process/code-quality.md`](../process/code-quality.md) — where these rules
  sit among the others.
- [`../../extension-src/plugins/ai-agent-status/index.md`](../../extension-src/plugins/ai-agent-status/index.md),
  [`../../extension-src/plugins/break-timer/index.md`](../../extension-src/plugins/break-timer/index.md)
  — the two widgets the numbers above changed.

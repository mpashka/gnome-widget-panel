# Monitor — seeing the machine's state without opening anything

`@tag:use-case`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals where the *answer* is the whole interaction: is the machine hot, what
time is it, am I on the VPN, which layout am I typing in. A monitor widget is
worth its width only if it answers at a glance, so these cases mostly cost
**zero clicks** — the panel already shows it — and one hover
([S4](../steps.md#s4)) for the numbers behind the picture.

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1), [P2](../steps.md#p2), [P3](../steps.md#p3) — the panel
  is on screen, expanded, with the widget on it. All the widgets in this area
  except the graphs' optional siblings are on the **default panel**.
- Reading happens **on the panel**: the glance is the main path, the hover is
  the detail, the click is the exception.

## After

- Nothing is changed by looking. Where a case does change something (the volume,
  the layout), it hands off to GNOME's own control.
- Every widget here can be [tuned](../configure/tune-widget.md) — colours,
  width, update interval, tooltip — or [switched off](../configure/disable-widget.md).

## Cases

- [`watch-cpu.md`](watch-cpu.md) — "Is something eating the CPU, and is the
  machine getting hot?"
- [`read-clock.md`](read-clock.md) — "What time is it, and what is next in my
  calendar?"
- [`quick-settings.md`](quick-settings.md) — "Am I on the VPN / which network /
  turn the volume down."
- [`background-apps.md`](background-apps.md) — "Is my sync client still
  running?"
- [`keyboard-layout.md`](keyboard-layout.md) — "Which layout am I about to type
  in?"

AI-agent monitoring has its own area: [`../ai-agents/`](../ai-agents/index.md).

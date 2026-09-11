# "Is something eating the CPU — and is it getting hot?"

`@tag:use-case` `@tag:widget-cpu-load-monitor`

Back to [monitor](index.md) · [use cases](../index.md).

**Goal.** The fan is up, or a build feels slow, and I want to know whether the
machine is busy, throttling-hot, or fine — without opening a system monitor.

## Steps

1. **Glance at the CPU load widget.** It is a scrolling bar graph: each column
   is one sample of load, and its **colour is the CPU temperature band** — green,
   yellow, red.
2. If you need the numbers, [S4](../steps.md#s4) — hover it. The tooltip gives
   the current load, the temperature and the legend for the colour bands.

**Cost.** Zero clicks for "busy or not", one hover for the figures.

## Variants

- **Load and heat at once.** That is the point of the colouring: a tall green
  graph is a machine working comfortably; a short red one is a machine in
  trouble even though it is not busy.
- **The bands are wrong for my hardware.** The **bands** setting takes your own
  temperature thresholds and colours
  ([`../configure/tune-widget.md`](../configure/tune-widget.md)).
- **Longer or shorter history.** **Width** decides how many samples are on
  screen; **update interval** (2 s by default) how fast they arrive. A wider,
  slower graph shows the last few minutes; a narrow, fast one shows now.
- **No tooltip, please.** It can be switched off or its template rewritten.
- **Which process is it?** Not this widget's job — start a system monitor from
  the [applications menu](../launch/find-application.md) or a
  [Launch button](../launch/run-command.md) running `htop`.

## Result

Nothing changes; you know whether to wait, kill something or ignore it. The
graph's history is in memory only — it starts empty after a shell restart.

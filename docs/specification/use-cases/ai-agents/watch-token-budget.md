# "How close am I to the limit, and when does it reset?"

`@tag:use-case` `@tag:widget-ai-agent-usage`

Back to [AI agents](index.md) · [use cases](../index.md).

**Goal.** I am working through an agent and do not want to discover the
rate limit by being cut off mid-task — or to burn a fresh window on something
trivial.

## Steps

1. **Glance at the AI agent usage graph.** It draws three things at once:
   scrolling **token-load history** coloured by whichever provider is busiest, a
   **marker per prompt** in that agent's colour, and **two bars** for the active
   agent's **rate-limit** and **context-window** levels.
2. [S4](../steps.md#s4) — hover it. The tooltip names the agent, the usage
   percentages, the **reset time** and the recent prompts.

**Cost.** Zero clicks for "how busy", one hover for the numbers and the reset
time.

## Variants

- **Reading it properly.** Every column, bar and marker is explained in
  [`../../ai-agent-usage.md`](../../ai-agent-usage.md), with an
  [interactive demo](../../ai-agent-usage-preview.html) to compare against what
  you see.
- **Two agents at once.** The history keeps each provider separately and the
  drawn segment keeps the identity of the provider that won that sample — so a
  segment's **colour tells you who spent it** (Codex teal, Claude clay, Gemini
  blue by default).
- **Nothing for one of my agents.** Its provider may be switched off in the
  settings, or Claude may need its [hook](connect-claude.md).
- **The graph is too small / too fast.** **Width** (54 by default) and **update
  interval** (5 s) are settings, as are the two bars' visibility and every
  colour ([`../configure/tune-widget.md`](../configure/tune-widget.md)).
- **Empty after a restart.** Expected: history is in memory only.

## Result

Nothing changes; you decide whether to keep going, switch models or wait for the
reset. The reading is local — the widget only shows what the agent CLIs already
wrote on this machine.

# AI agents — running them without babysitting a terminal

`@tag:use-case`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals behind the two AI widgets. Both exist for the same working pattern:
you delegate to an agent, switch away, and want to be **pulled back only when
there is something to do** — and you want to know how much of your token budget
that costs before you hit the limit.

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1), [P2](../steps.md#p2), [P3](../steps.md#p3) — the panel
  is on screen with the widget on it. **AI agent usage** is on the default
  panel; **AI agent status** is [added](../configure/add-widget.md).
- [P6](../steps.md#p6) — the agent CLI is installed and used from this account.
  The panel reports what those CLIs report; with none installed the widgets have
  nothing to draw.
- These widgets read **only local data** written by the agent CLIs on this
  machine. Nothing is sent anywhere, and no provider account or API key is
  involved.

## After

- Reading costs a glance and a hover ([S4](../steps.md#s4)); the tooltip is
  where the per-session and per-provider detail lives.
- History is **in memory**: a shell restart empties the graph. The
  configuration ([colours](../configure/tune-widget.md), the hook) persists.

## Cases

- [`connect-claude.md`](connect-claude.md) — "Nothing appears for Claude Code" —
  the one setup step these widgets need.
- [`watch-token-budget.md`](watch-token-budget.md) — "How close am I to the
  limit, and when does it reset?"
- [`agent-needs-me.md`](agent-needs-me.md) — "Tell me when the agent is waiting
  for me."
- [`run-several-agents.md`](run-several-agents.md) — "Three agents at once, one
  pair of eyes."

Reading the usage graph in detail — every column, bar and marker — is
[`../../ai-agent-usage.md`](../../ai-agent-usage.md), with an
[interactive demo](../../ai-agent-usage-preview.html).

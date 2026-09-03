# "Tell me when the agent is waiting for me"

`@tag:use-case` `@tag:widget-ai-agent-status`

Back to [AI agents](index.md) · [use cases](../index.md).

**Goal.** I gave the agent a task and switched to something else. I do not want
to keep alt-tabbing back to see whether it is still thinking, has asked me a
question, or has finished.

## Also assumes

The **AI agent status** widget on the panel
([add it](../configure/add-widget.md)) and, for Claude Code, its
[session hook](connect-claude.md) configured.

## Steps

1. **Work on something else.** The widget is one dot on the panel.
2. **When the dot pulses, go back.** The colour says why:
   - **pulsing red** — *waiting*: the agent is asking you something;
   - **pulsing amber** — *idle*: it has finished and is ready for your next
     prompt;
   - **solid blue** — *thinking*: it is generating, nothing to do;
   - **dim grey** — no open sessions.

   A **pulsing** dot means there is a session you can type into right now.
3. [S4](../steps.md#s4) if you need to know *which* session — the tooltip has a
   summary (`1 waiting · 1 idle · 2 thinking`) and a per-session table.

**Cost.** Zero clicks while it thinks; one glance to know that it stopped.

## Variants

- **Several sessions.** They collapse into one dot showing the loudest state —
  waiting beats idle beats thinking — so any session waiting turns the dot red
  even while others work. Sorting them out is
  [`run-several-agents.md`](run-several-agents.md).
- **The amber pulse is distracting.** Whether *idle* pulses is a setting, as are
  the three colours and the expiry timer
  ([`../configure/tune-widget.md`](../configure/tune-widget.md)).
- **A dot stuck on a state.** Sessions expire on the timer above; a terminal
  killed without exiting cleanly clears when it does.
- **How much is it costing?** A different question, and a different widget:
  [`watch-token-budget.md`](watch-token-budget.md).

## Result

You return to the terminal exactly when your input unblocks the agent or a turn
is done to check — which is what turns "keep glancing at the terminal" into
"glance at one dot", in almost no panel space.

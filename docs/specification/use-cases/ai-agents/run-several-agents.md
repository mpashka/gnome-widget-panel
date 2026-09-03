# "Three agents at once, one pair of eyes"

`@tag:use-case` `@tag:widget-ai-agent-status` `@tag:widget-ai-agent-usage`

Back to [AI agents](index.md) · [use cases](../index.md).

**Goal.** I want several agent sessions working in parallel while I do something
else, and to spend my attention only on the one that needs it.

## Also assumes

Both AI widgets on the panel: the **status** dot
([`agent-needs-me.md`](agent-needs-me.md)) and the **usage** graph
([`watch-token-budget.md`](watch-token-budget.md)).

## Steps

1. Start the sessions and switch away — the panel is now your only view of them.
2. **Watch the dot** for *whether* anyone needs you: it shows the loudest state
   across all sessions (waiting > idle > thinking).
3. When it pulses, [S4](../steps.md#s4) on the dot — the per-session table says
   **which** session is waiting and which are still thinking.
4. Go to that session; the others keep running.
5. Occasionally glance at the **usage graph**: it colours each sample by the
   provider that spent the most, so you can see which agent is eating the budget
   before the limit does it for you.

**Cost.** Two glances and a hover per round, for any number of sessions.

## Variants

- **Everything is red the whole time.** More sessions than you can answer;
  the dot is honest, and the queue is the problem.
- **Agents from different providers.** Both widgets keep provider identity — the
  dot's table lists sessions, the graph's colours attribute spend — so a mixed
  fleet is still readable.
- **I want an audible alert.** Not offered: the widget's contract is a light,
  not a notification. If interruption is what you want, that is a
  [request](../configure/request-widget.md).
- **I keep coming back too early.** *Solid blue* means "thinking, nothing to
  do"; only the pulse is an invitation.

## Result

Attention spent per agent drops to a glance, which is the entire justification
for these two widgets: the human is the scarce resource in the loop, so the
panel is built to spend the human last.

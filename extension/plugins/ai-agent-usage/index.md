# ai-agent-usage widget

Back to [plugins index](../index.md).

## Purpose

Shows one compact graph for AI agent token usage. Providers currently planned:
Codex and Claude Code.

## Source files

- `index.ts` — plugin entrypoint.
- `aiAgentUsageGraph.ts` — in-memory provider state, Claude HTTP hook server,
  Codex helper process management and graph rendering.
- `helpers/codex-usage-helper.ts` — out-of-process GJS helper that scans Codex
  JSONL logs and streams normalized JSON Lines to the widget. Codex
  `total_token_usage` is cumulative for a session, so the UI load uses
  `last_token_usage`; the cumulative value is preserved as
  `tokens.session_total` for diagnostics.

## Data model

Provider histories are kept separately in memory. Rendering may merge them into
one visible graph, but every rendered sample keeps the provider identity that
won by highest token consumption. Provider colors are configurable; Codex and
Claude segments must be visually distinguishable. The visible token-load graph
first applies an idle threshold: samples below `minActiveTokens` default to zero.
Active samples are autoscaled against the maximum active token count in a scale
window twice as wide as the visible graph. Codex `token_count` events are
counted once, so rereading the same newest JSONL event while Codex is idle does
not keep the graph at 100%.

The widget has a hover tooltip. It explains that the main graph is active token
load history, the blue vertical bar is current context-window usage, and the
yellow vertical bar is the best available server/rate-limit usage. The tooltip
also shows the active provider, current token values, threshold and scale max.

Claude uses a generated statusLine command hook that forwards stdin JSON to the
widget's localhost HTTP server. Codex uses stdout JSON Lines from the helper.
No cache file or persistence is part of the active architecture.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)

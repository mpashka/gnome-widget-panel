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
  JSONL logs and streams normalized JSON Lines to the widget.

## Data model

Provider histories are kept separately in memory. Rendering may merge them into
one visible graph, but every rendered sample keeps the provider identity that
won by highest token consumption. Provider colors are configurable; Codex and
Claude segments must be visually distinguishable.

Claude uses a generated statusLine command hook that forwards stdin JSON to the
widget's localhost HTTP server. Codex uses stdout JSON Lines from the helper.
No cache file or persistence is part of the active architecture.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)

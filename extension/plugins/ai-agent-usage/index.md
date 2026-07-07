# ai-agent-usage widget

`@tag:widget-ai-agent-usage`

Back to [plugins index](../index.md).

## Purpose

Shows one compact graph for AI agent token usage. Providers currently planned:
Codex and Claude Code.

## Source files

- `index.ts` — plugin entrypoint.
- `prefs.ts` — widget settings UI: per-provider enable/colour, a Claude Code
  status dot + Configure button, indicator colours, tooltip and advanced
  options; edits the widget `options` in `widgets.json`. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).
- `claudeHook.ts` — shared Claude hook helpers (`installHook`, `configStatus`,
  `isClaudeInstalled`), usable from both the shell and preferences processes.
- `aiAgentUsageGraph.ts` — in-memory provider state, Claude HTTP hook server,
  Codex helper process management and graph rendering.
- `helpers/codex-usage-helper.ts` — out-of-process GJS helper that scans Codex
  JSONL logs and streams normalized JSON Lines to the widget. Codex
  `total_token_usage` is cumulative for a session, so the UI load uses
  `last_token_usage`; the cumulative value is preserved as
  `tokens.session_total` for diagnostics. It also extracts recent user prompts
  (`response_item` messages with `role: user`) as a `requests` array, skipping
  injected environment/instruction blocks.

## Data model

Provider histories are kept separately in memory. Every graph column is coloured
by the provider that won that sample, using configurable per-provider colours
(defaults: OpenAI/Codex teal `#10a37f`, Anthropic/Claude clay `#d97757`). The two
vertical bars use configurable indicator colours — usage/rate-limit
(`usageColor`, default `#ffb82e`) and context window (`windowColor`, default
`#4ca6ff`) — and the matching tooltip icons reuse those same colours. The visible
token-load graph first applies an idle threshold: samples below `minActiveTokens`
default to zero.
Active samples are autoscaled against the maximum active token count in a scale
window twice as wide as the visible graph. Codex `token_count` events are
counted once, so rereading the same newest JSONL event while Codex is idle does
not keep the graph at 100%.

Requests (user prompts) reported by a provider in its `requests: AgentRequest[]`
array (see [`../../contracts.ts`](../../contracts.ts)) are drawn as vertical red
markers positioned by their timestamp within the visible graph window. Markers
are deduplicated and pruned to twice the visible window. Codex populates requests
today; Claude statusLine does not carry prompt text, so no Claude markers appear
yet.

The widget has a compact hover tooltip (Pango markup). Its first line is
`<Agent>: <cup> <usage%>[ ⧗ <reset>]`, where the agent name is drawn in the
provider colour, the usage cup uses the usage-bar colour and the reset hourglass
uses the context/window-bar colour (so the icons match the bars). Usage and reset
come from the rate-limit window with the highest usage (falling back to
context-window usage when no rate limit is reported, in which case the reset time
is omitted). Below the summary the visible requests are shown as a left-aligned
monospace table with columns `agent | time | first N characters of the prompt`
(N is `requestPreview`; the whole list can be hidden with `showRequests`; prompt
text is markup-escaped). The tooltip updates in place without re-fading, so it
does not blink while hovering.

Claude uses a generated statusLine command hook that forwards stdin JSON to the
widget's localhost HTTP server. The hook secret is normally per-session, but the
preferences **Configure** button persists a secret (and port) into the widget
options so the hook and the server agree after a reload; the widget prefers
`options.claudeSecret` when present. Codex uses stdout JSON Lines from the helper.
No cache file or persistence is part of the active architecture.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)

# ai-agent-usage widget

`@tag:widget-ai-agent-usage`

Back to [plugins index](../index.md).

## Purpose

Shows one compact graph for AI agent token usage. Providers: Codex, Claude Code
and Gemini CLI.

## Source files

- `index.ts` — plugin entrypoint.
- `prefs.ts` — widget settings UI: per-provider enable/colour, a Claude Code
  status dot + Configure button, per-indicator show/hide + colour, widget
  width/update-interval, tooltip and advanced options; edits the widget
  `options` in `widgets.json`. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).
- `claudeHook.ts` — shared Claude hook helpers (`installHook`, `configStatus`,
  `isClaudeInstalled`), usable from both the shell and preferences processes.
  It also owns the lifecycle **event** hooks (`installEventHooks`,
  `eventHooksStatus`, `eventHookScript`) used by the
  [`ai-agent-status`](../ai-agent-status/index.md) widget: a silent
  port-independent script POSTing Claude's UserPromptSubmit/Stop/Notification/
  SessionEnd payloads to `/agent-event` on every endpoint in the same shared
  ports registry.
- `aiAgentUsageGraph.ts` — in-memory provider state, Claude HTTP hook server,
  Codex helper process management and graph rendering.
- `helpers/codex-usage-helper.ts` — out-of-process GJS helper that scans Codex
  JSONL logs and streams normalized JSON Lines to the widget. Codex
  `total_token_usage` is cumulative for a session, so the UI load uses
  `last_token_usage`; the cumulative value is preserved as
  `tokens.session_total` for diagnostics. It also extracts recent user prompts
  (`response_item` messages with `role: user`) as a `requests` array, skipping
  injected environment/instruction blocks.
- `helpers/gemini-usage-helper.ts` — out-of-process GJS helper for Gemini CLI.
  It picks the most recently active project under `~/.gemini/tmp/<project_hash>/`
  (override the root with `GEMINI_DATA_DIR`, matching ccusage), reads recent user
  prompts from that project's `logs.json` (`{sessionId, messageId, type:"user",
  message, timestamp}` records) into a `requests` array, and defensively extracts
  the latest turn's token usage from the newest `chats/*.json` conversation
  record (Gemini `usageMetadata`: `totalTokenCount` / `promptTokenCount` /
  `candidatesTokenCount` / `cachedContentTokenCount`, plus snake_case fallbacks).
  Every read/parse is guarded and it emits nothing when the data dir is absent,
  so it never crashes or blocks the Shell. **Source/confidence:** the `logs.json`
  prompt records are a stable, observed format (high confidence); the on-disk
  token schema is version-dependent (a JSONL migration is in flight upstream), so
  token extraction is best-effort — when no token object is found, prompts are
  still emitted and tokens default to zero (lower confidence). No rate-limit data
  is available on disk, so Gemini reports no `limits`.

## Vertical panel rotation

The graph implements `setPanelLayout({vertical, rotation})`, called by the panel
host. When the panel is vertical it swaps its actor size and rotates the drawing
90° (direction from the panel `orientation` setting) so the token history,
request markers and indicator bars run along the vertical strip. See
[preferences](../../../docs/preferences.md).

In a vertical panel the hover tooltip is placed to the side of the widget (left
when the widget is in the right half of the monitor, otherwise right), vertically
centred and clamped to the monitor, so it does not overlap the strip; the
horizontal panel keeps the original above/below placement.

## Data model

Provider histories are kept separately in memory. Every graph column is coloured
by the provider that won that sample, using configurable per-provider colours
(defaults: OpenAI/Codex teal `#10a37f`, Anthropic/Claude clay `#d97757`,
Google/Gemini blue `#4285f4`). The two
vertical bars use configurable indicator colours — usage/rate-limit
(`usageColor`, default `#ffb82e`) and context window (`windowColor`, default
`#4ca6ff`) — and the matching tooltip icons reuse those same colours. The visible
token-load graph first applies an idle threshold: samples below `minActiveTokens`
default to zero.
Active samples are autoscaled (normalised) against the maximum active token
count in the **full window**. The visible window is `HISTORY_WIDTH` (36) sample
columns; the full window is `HISTORY_WIDTH * scaleWindowRatio` (default ratio 2,
so twice the visible window). The tallest active sample in the full window is
100% and every other column's height is normalised to it. `scaleWindowRatio` is
read from the widget `options` (default 2) but is intentionally **not** exposed
in the settings UI.

Each vertical bar can be hidden independently: `showUsageBar` (default true)
controls the usage/rate-limit bar and `showWindowBar` (default true) controls the
context/window bar. Hiding a bar also drops its part from the tooltip summary line
(the usage cup + percent for `showUsageBar`, the reset hourglass + time for
`showWindowBar`); when both are hidden the summary line still shows the agent
name. `width` (px, default 54, min 24) sets the drawing-area width, and the two
bars track the actor's right edge. `updateInterval` (seconds, default 5, min 1)
sets the sampling timer and, to keep the visible history consistent, also drives
the graph time window: the visible request window is `36 * updateInterval`
seconds and the red request markers are positioned by `age / updateInterval`. Codex `token_count` events are
counted once, so rereading the same newest JSONL event while Codex is idle does
not keep the graph at 100%.

Requests (user prompts) reported by a provider in its `requests: AgentRequest[]`
array (see [`../../contracts.ts`](../../contracts.ts)) are drawn as vertical red
markers positioned by their timestamp within the visible graph window. Markers
are deduplicated and pruned to twice the visible window. Codex and Gemini CLI
populate requests today (from their session/log files); Claude statusLine does not
carry prompt text, so no Claude markers appear yet.

Each provider has an enable toggle (`enableClaude`, `enableCodex`, `enableGemini`,
all default true) and a graph colour option (`claudeColor`, `codexColor`,
`geminiColor`). The Providers group in preferences shows a status dot per provider:
green when detected/configured, grey when the provider is not found on this system
(Codex looks for `~/.codex/sessions`, Gemini for `~/.gemini/tmp`).

The widget has a compact hover tooltip built from a user-editable template (see
[`../../tooltipTemplate.ts`](../../tooltipTemplate.ts), `@tag:ui`) rendered with
Pango markup. The default template `{agent}: {usage}{reset}\n{requests}`
reproduces the original layout. Its first line is
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

Template tokens (each a ready-built coloured markup fragment, empty when its
feature is hidden/unavailable so the template collapses cleanly):

- `{agent}` — provider-coloured agent name.
- `{usage}` — coloured cup + ` NN%` (empty when the usage bar is hidden).
- `{reset}` — ` ⧗ <time>` including the leading space, window-coloured (empty
  when the window bar is hidden or no reset time is available).
- `{requests}` — the left-aligned monospace request table (empty when there are
  no visible requests or `showRequests` is off).

Literal template text is Pango-escaped and `\n` is a line break; a trailing
newline is trimmed so an empty `{requests}` does not leave a blank line. The
settings page shows a live preview of the rendered template. `template` is stored
in the widget `options` (default as above).

Claude uses a generated statusLine command hook
(`~/.claude/gnome-widget-panel-claude-hook.js`, written by
[`claudeHook.ts`](claudeHook.ts)) that forwards stdin JSON to the widget's
localhost HTTP server. The hook is **port-independent**: it reads a shared
endpoint registry `~/.claude/gnome-widget-panel-ports.json` and fans the request
out to every registered `{port, secret}`, printing the first OK status line. Each
running widget registers its own `{claudePort, claudeSecret}` when it starts its
server and deregisters on `destroy()` (deduped by port). This lets several panel
instances on different `claudePort`s (e.g. a main session and a dev session) each
receive Claude data without overwriting one another's hook — same localhost port
on two instances still conflicts, different ports do not. The **Configure**
button persists a secret into the widget options and registers the endpoint so
the widget prefers `options.claudeSecret` after a reload. Codex uses stdout JSON
Lines from the helper. No cache file or persistence is part of the active
architecture.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)

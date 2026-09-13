# ai-agent-usage widget

`@tag:widget-ai-agent-usage` `@tag:ai-collector`

Back to [plugins index](../index.md).

## Purpose

Shows one compact graph for AI agent token usage. Providers: Codex, Claude Code
and Gemini CLI.

It is a **view of the panel's AI collector**
([`../../aiCollector.ts`](../../aiCollector.ts)) and collects nothing itself. The
localhost server, Claude's hooks and the helper child processes used to be built
in this widget's constructor, which made collection a side effect of the widget
existing; they now belong to the extension and run on the `ai-collector` setting.
With collection switched off the graph is struck through and the tooltip says so.
See [`../../../docs/implementation/ai-collector.md`](../../../docs/implementation/ai-collector.md).

## Source files

- `index.ts` — plugin entrypoint.
- `prefs.ts` — widget settings UI: the per-provider graph colours, per-indicator
  show/hide + colour, widget width/update-interval, tooltip and advanced options;
  edits the widget `options` in `widgets.json`. Which providers are collected
  from, and on which port, is the collector's settings group. See
  [`../../../docs/implementation/preferences.md`](../../../docs/implementation/preferences.md).
- `claudeHook.ts` — shared Claude hook helpers (`installHook`, `configStatus`,
  `isClaudeInstalled`, `lineIsDispatched`), usable from both the shell and
  preferences processes. File I/O only: the text of both generated scripts lives
  in `hookScriptText.ts`.
  It also owns the lifecycle **event** hooks (`installEventHooks`,
  `eventHooksStatus`, `eventHookScript`), installed by the collector and feeding
  both this widget's request markers and the
  [`ai-agent-status`](../ai-agent-status/index.md) widget: a silent
  port-independent script POSTing Claude's UserPromptSubmit/Stop/Notification/
  SessionEnd payloads to `/agent-event` on every endpoint in the same shared
  ports registry. Both generated hook scripts' shebang is `env -S gjs -m`
  (module mode) — the script bodies use ES module `import`; a bare `gjs`
  shebang runs gjs's legacy import system and crashes with a `SyntaxError` on
  every invocation, which was issue #6's root cause for the empty token graph.
  Both scripts are written through a temp file that is chmodded **before** it is
  renamed into place: Claude Code executes the hook file directly, so an install
  interrupted between the write and a later chmod would leave it without its
  executable bit and Claude would report "Permission denied" on every prompt.
  For the same reason `configStatus`/`eventHooksStatus` test `IS_EXECUTABLE`,
  not mere existence, so a broken install shows as `unconfigured` and the
  "Configure" button (or the next shell restart) repairs it.
- `hookScriptText.ts` — gi-free text of both generated hooks:
  `hookScriptText(paths, {segment})` and `eventHookScriptText(registry)`. The
  status-line hook has **two shapes**: owning the `statusLine` slot it renders
  the whole line, and as somebody's segment (`{segment: true}`) it prints only
  the lamp. Unit-tested in
  [`../../../tests/hookScriptText.test.mjs`](../../../tests/hookScriptText.test.mjs) —
  these scripts run in the user's `~/.claude`, where a mistake shows up as an
  empty status line a shell restart later.
- `claudeStatusLine.ts` — gi-free normalization of the two Claude HTTP hook
  payloads: `normalizeClaudeStatusLine` (statusLine → the per-provider sample,
  including mapping `rate_limits.five_hour`/`seven_day` onto
  `limits.primary`/`secondary`) and `claudePromptRequest`
  (`UserPromptSubmit` → an `AgentRequest` marker). Unit-tested in
  [`../../../tests/claudeStatusLine.test.mjs`](../../../tests/claudeStatusLine.test.mjs).
- `statusLineText.ts` — gi-free renderer of the status line Claude shows:
  `formatClaudeStatusLine(payload, {place, task, lamp})` and `FORMAT_STATUS_LINE_FN`,
  the same function's own source (`Function.prototype.toString()`), embedded
  verbatim into the generated hook — which has no module scope to import from,
  and a hand-copied string constant would drift from the function it mirrors.
  Unit-tested in
  [`../../../tests/statusLineText.test.mjs`](../../../tests/statusLineText.test.mjs),
  including that the embedded source still runs standalone.
- `aiAgentUsageGraph.ts` — the graph: the sampled history, the request markers
  and the rendering. It reads the collector's provider payloads and prompts and
  owns no collection.
- `helpers/*.gjs` — the two out-of-process helpers below. **`.gjs`, not `.ts`:**
  they are standalone programs the widget spawns with `gjs -m`, not modules of
  the extension, so they are copied into the built tree verbatim and stay out of
  the TypeScript module graph. EGO's checker expects every shipped `.js` to be
  reachable from `extension.js` or `prefs.js` (EGO-P-007), and these never are.
- `helpers/codex-usage-helper.gjs` — out-of-process GJS helper that scans Codex
  JSONL logs and streams normalized JSON Lines to the widget. Codex
  `total_token_usage` is cumulative for a session, so the UI load uses
  `last_token_usage`; the cumulative value is preserved as
  `tokens.session_total` for diagnostics. It also extracts recent user prompts
  (`response_item` messages with `role: user`) as a `requests` array, skipping
  injected environment/instruction blocks.
- `helpers/gemini-usage-helper.gjs` — out-of-process GJS helper for Gemini CLI.
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
[preferences](../../../docs/implementation/preferences.md).

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
`#4ca6ff`) — and the matching tooltip icons reuse those same colours. Each
sample's height is the **load** metric — `input + output + cache_creation`
(`parseTokenLoad`), i.e. what a turn actually consumed, deliberately excluding
the reused `cache_read` (tens of thousands of tokens even for a one-line reply,
which otherwise pinned every column to full height — the "solid block" bug).
The visible token-load graph first applies an idle threshold: samples below
`minActiveTokens` (default 500 load tokens) draw as zero.
Active samples are autoscaled (normalised) against the maximum active token
count in the **full window**. The visible window is `HISTORY_WIDTH` (36) sample
columns; the full window is `HISTORY_WIDTH * scaleWindowRatio` (default ratio 2,
so twice the visible window). The tallest active sample in the full window is
100% and every other column's height is normalised to it, then the drawn height
is **square-root compressed** so a single huge `cache_creation` turn (which can
be ~50× a normal reply) doesn't squash every ordinary turn to 1–2 px.
`scaleWindowRatio` is read from the widget `options` (default 2) but is
intentionally **not** exposed in the settings UI.

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
populate requests from their session/log files. Claude's `statusLine` payload
carries no prompt text, so its markers instead come from the separate
`UserPromptSubmit` lifecycle event hook (`claudeHook.ts`'s
`installEventHooks()`/`eventHookScript()`, installed alongside the statusLine
hook): the collector's `/agent-event` handler turns each event into an
`AgentRequest` via `claudePromptRequest()` (`claudeStatusLine.ts`), using the
event's receipt time as the timestamp since the payload carries none. The graph
then draws the ones inside its visible window.

Each provider has a graph colour option (`claudeColor`, `codexColor`,
`geminiColor`) here. **Whether** a provider is collected from is the collector's
`ai-collector-claude` / `-codex` / `-gemini` setting, shown in the AI collector
preferences group, which also states when an agent is not installed on this
system (Codex looks for `~/.codex/sessions`, Gemini for `~/.gemini/tmp`).

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
[`claudeHook.ts`](claudeHook.ts) from [`hookScriptText.ts`](hookScriptText.ts))
that forwards stdin JSON to the collector's
localhost HTTP server. The hook is **port-independent**: it reads a shared
endpoint registry `~/.claude/gnome-widget-panel-ports.json` and fans the request
out to every registered `{port, secret}`. Each running collector registers its
own port and per-session secret when it starts and deregisters when it stops
(deduped by port). This lets several panel instances on different
`ai-collector-port`s (e.g. a main session and a dev session) each receive Claude
data without overwriting one another's hook — the same localhost port on two
instances still conflicts, different ports do not. Codex uses stdout JSON Lines
from the helper. No cache file or persistence is part of the active
architecture.

**What the hook prints is its own work, not the server's answer.** It renders the
status line from its stdin with `formatClaudeStatusLine`
([`statusLineText.ts`](statusLineText.ts)) — model, place, task, context
percentage and both rate-limit windows, in the shape Codex uses:

```
Opus 5 high · ai_dispatcher · ISS-9639 · ctx 8% · 5h 97% · 7d 89%
```

Every segment is cut to what a laptop screen fits: the model without the
parenthetical naming its window variant, the place without the path leading to
it, the percentages without the words around them. `ctx` is what the session has
spent and the two windows are what is left of a quota — the question asked of a
context is how close it is to full, the question asked of a quota is how much
remains.

**The place and the task come from a caption file**, because the payload knows a
directory and nothing about tasks. Before rendering, the hook reads
`~/.claude/statusline/<session_id>.json` (`{place, task}`, both optional strings)
and passes it in. Whoever tracks the user's work writes it — on the author's
machine, the task dispatcher `ai_dispatcher`, which resolves a session to a task
card and names the place after the project or the Arcadia checkout. Nothing here
writes or requires that file: absent, unreadable or malformed alike mean no
caption, and the place falls back to the last component of the working directory
(`~/Projects/home/configs` → `configs`), which is what an install with no such
writer shows.

Delivery to the panel is gated and checked. The hook reads the panel's
`ai-collector` GSettings key (schema
`org.gnome.shell.extensions.floating-mini-panel`, loaded from the installed
extension's `schemas/` directory — it is not in the system schema source); it
POSTs only while collection is on, counts any **2xx** as delivered, and appends
` · 🚨` when collection is on but nothing accepted the payload — a locked screen (the
Shell disables extensions while locked, which stops the collector), a crashed
shell, a dead port, a stale registry entry. With collection off there is no POST and no
lamp. It used to ask whether an AI *widget* was configured, which was the wrong
question: it conflated "show me this" with "watch this".

The ports registry deliberately does **not** gate that: an entry outlives a
crashed GNOME Shell (deregistration happens on stop), so a stale one would light
the lamp for a collector the user turned off on purpose. The `Soup.Session`
carries a 3 s timeout, because this code runs on Claude's status-line path and an
endpoint that accepts a connection and then hangs must not hang the status line.

### When somebody else owns the line

`statusLine` is one setting holding one command, so whoever writes it owns the
whole line. A user may run a **dispatcher** in that slot instead — a command that
composes the line out of independent executables in
`~/.claude/status_line.d/`, so that each program contributes its own piece and
removing a program removes only that piece.

The directory is the whole protocol. When it exists, `installHook()` writes
`~/.claude/status_line.d/90-gnome-widget-panel` and **leaves `statusLine`
alone**; rewriting the setting there would take the slot back on every shell
start and put the panel in a fight with its own user. When it does not exist —
the default everywhere — nothing changes: the panel writes its own hook, points
`statusLine` at it and renders the full line as before.

The segment prints **only the lamp**, because everything else in the line is
built from a payload that is not the panel's: the model, the place, the
percentages belong to whoever else drops a segment in. Printing them here would
print them twice. Delivery to the widget is identical in both shapes, and
delivery is what the panel needs. An empty print means "no segment", and the
dispatcher drops it along with its separator.

The collector's server also has an `/agent-event` handler for the lifecycle
events (see "Requests" above); both handlers read the request's bearer token via
`msg.get_request_headers()`, not a `request_headers` property —
`Soup.ServerMessage` (the server-side request object) has no such GObject
property, unlike the client-side `Soup.Message` the hook scripts use, so reading
it directly is always `undefined` and throws.

## Related docs

- [AI collector](../../../docs/implementation/ai-collector.md) — what feeds this
  widget, and why it is not the widget's job.
- [Reading the graph (user guide)](../../../docs/specification/ai-agent-usage.md) — plain-language
  explanation + interactive preview of the token columns and request markers (issue #6).
- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)

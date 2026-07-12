# ai-agent-status widget

`@tag:widget-ai-agent-status`

Back to [plugins index](../index.md).

## Purpose

One glanceable cue for the state of *all* parallel AI-agent sessions (Claude
Code). The user kicks off one or more agents and switches away with the
conversation hidden; a **single dot** then tells them, without opening anything,
what an agent needs. Each open session is in one of three states:

- **waiting** — the agent explicitly wants the user (a permission/attention
  request). Red, pulsing. Highest priority.
- **idle** — the turn finished; the session is open and **ready for the next
  prompt** (the user may prompt it or leave it). Amber, pulsing.
- **thinking** — the agent is generating; nothing to do but wait. Blue, solid.

A **pulsing** dot always means "a session you can type into right now" (waiting
or idle). Sessions are open until they end (a `SessionEnd`, or the expiry
fallback); with none open the widget shows a dim grey placeholder (`no-sessions`).
The single dot shows the **most-urgent** state across every session —
priority **waiting > idle > thinking > no-sessions** — and the hover tooltip
carries the per-session breakdown (which agent is in which state). See the
[user guide](../../../user-guide/widgets.md#ai-agent-status--ai-agent-status--optional)
for the end-user framing.

Not in the default config; add it via the panel preferences.

## Source files

- `index.ts` — plugin entrypoint (`create(parent, options)`).
- `aiAgentStatus.ts` — the widget: localhost HTTP server receiving Claude hook
  events, the per-session state machine, the single aggregated-dot rendering and
  the templated tooltip.
- `prefs.ts` — widget settings UI: Claude hooks status dot + Configure button,
  port/expire rows, the three state colours, pulse switch and the tooltip
  template editor with live preview. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).

## Hook mechanism

Claude Code lifecycle hooks are installed by
[`../ai-agent-usage/claudeHook.ts`](../ai-agent-usage/claudeHook.ts)
(`installEventHooks()` / `eventHooksStatus()`, shared with the usage widget's
statusLine hook — the usage widget also auto-installs the event hook on
startup, for its own request markers, so it is configured even if this widget
is never added). `installEventHooks()` writes the port-independent script
`~/.claude/gnome-widget-panel-agent-event-hook.js` and idempotently merges an
entry for it into `~/.claude/settings.json` `hooks` for the events
`UserPromptSubmit`, `Stop`, `Notification` and `SessionEnd` (no matcher;
user-defined hook entries are preserved). The script reads the Claude JSON
payload from stdin, reads the shared endpoint registry
`~/.claude/gnome-widget-panel-ports.json` (`[{port, secret}...]`) and POSTs the
raw payload to `http://127.0.0.1:<port>/agent-event` on **every** registered
endpoint with an `X-Gnome-Widget-Panel-Token` header. It prints nothing and
always exits 0 — a Stop hook's stdout is interpreted by Claude, so the script
must stay silent and fast. Its shebang is `env -S gjs -m` (module mode), like
the statusLine hook's — see [`../ai-agent-usage/index.md`](../ai-agent-usage/index.md).

Coexistence with the statusLine hook (both fan out to all registered
endpoints):

- This widget answers `POST /claude-statusline` with **204 No Content**, never
  200, so the statusLine fan-out (which prints the *first 200 body*) never
  takes this widget's empty body as the status line text; the payload is still
  used as busy-activity evidence.
- The usage widget also has an `/agent-event` handler (for its own request
  markers): it only reacts to `UserPromptSubmit`, ignoring every other event
  this widget cares about (`Stop`, `Notification`, `SessionEnd`).

The widget starts its own `Soup.Server` on `options.port` (default 17871,
distinct from ai-agent-usage's 17861), registers `{port, secret}` in the shared
registry on start and deregisters on `destroy()`. It does not install the
statusLine hook (`installHook()` stays the usage widget's job).

## Session state machine

Per `session_id` (provider `claude`; label = basename of `cwd`, falling back to
the first 8 chars of the id):

| Input | State |
| --- | --- |
| `UserPromptSubmit` event | `thinking` |
| statusLine activity (fires only while generating) | `thinking` (but never demotes `waiting`) |
| `Notification` event (asking permission/attention) | `waiting` — highest priority |
| `Stop` event (turn finished, ready for the next prompt) | `idle` |
| `SessionEnd` event | session removed |
| `thinking` with no events for > 10 min (`THINKING_STALE_SECONDS`) | `idle` (missed Stop — no longer "working") |
| no events at all for > `expireMinutes` (default 180) | session removed (missed SessionEnd fallback) |

There is no separate grey "stale" state: an open session at rest is `idle`
(ready for the next prompt), and a session is either open or removed — liveness
comes from `SessionEnd` with the expiry as a fallback. Age transitions run on a
5 s tick. Each session stores `id`, `cwd`, `label`, `provider`, `state`,
`lastEvent` and `lastChange` timestamps.

## Visualization

**Chosen design: one aggregated dot** — a single ~12 px round Cairo dot filled
in the colour of the **most-urgent** session state. `_sortedSessions()` orders
sessions by `waiting`, `idle`, `thinking` (then by recency), and element 0 wins,
so one glyph reflects "the loudest thing an agent needs from you right now". The
two **promptable** states (`waiting`, `idle`) get a brighter 1 px ring and pulse
their opacity (600 ms ease cadence) — a pulsing dot means "a session you can type
into now"; `pulseIdle: false` limits the pulse to `waiting`. `thinking` is solid.
With no sessions a dim grey hollow placeholder dot keeps the widget visible and
hoverable.

The dot's whole job is a single "an agent needs you" cue while the conversation
is hidden, so it is deliberately **one glyph** regardless of session count — the
minimal panel footprint the widget is optimised for. Showing one dot per session
(the **rejected** earlier design) split the user's attention across glyphs and
grew the widget without adding actionable signal: the user acts on *one* agent at
a time, and the per-session detail (including simultaneous states) is already in
the tooltip. Merging by "highest state" keeps the at-a-glance signal honest — if
*any* session is `waiting` the dot is red even while others are `thinking`.

In a vertical panel the single dot needs no orientation change
(`setPanelLayout({vertical})` still switches the BoxLayout for consistency;
round dots need no rotation) and the hover tooltip is placed beside the widget
as in [`ai-agent-usage`](../ai-agent-usage/index.md).

The flicker-free hover tooltip is rendered from a user-editable template via
[`../../tooltipTemplate.ts`](../../tooltipTemplate.ts) (`@tag:ui`). Tokens:

- `{counts}` — summary line, e.g. `1 waiting · 1 idle · 2 thinking` (waiting and
  idle coloured with their state colour).
- `{sessions}` — monospace table, one line per session:
  state-coloured `●`, label, state (`waiting`/`idle`/`thinking`), `m:ss` since
  the last state change.

Default template: `{counts}\n{sessions}`.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `port` | `17871` | Localhost port of the widget's hook endpoint. |
| `secret` | random per run | Endpoint token; persisted by the Configure button. |
| `expireMinutes` | `180` | Minutes without any events before a session is dropped (missed-`SessionEnd` fallback). |
| `waitingColor` | `#f03333` | `waiting` dot colour (red). |
| `idleColor` | `#ffb82e` | `idle` (ready-for-prompt) dot colour (amber). |
| `thinkingColor` | `#4ca6ff` | `thinking` dot colour (blue). |
| `pulseIdle` | `true` | Also pulse the `idle` dot (`waiting` always pulses). |
| `showTooltip` | `true` | Enable the hover tooltip. |
| `template` | `{counts}\n{sessions}` | Tooltip template. |

## Codex / Gemini

**Not covered in v1.** Their CLIs have no push-style lifecycle hooks, so there
is nothing to notify this widget when a session stops or asks for input. A
follow-up could poll session-file mtimes (`~/.codex/sessions`,
`~/.gemini/tmp`) to approximate busy/idle, but it could not reliably detect
"waiting for you", so v1 is honestly Claude-only.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)

# ai-agent-status widget

`@tag:widget-ai-agent-status`

Back to [plugins index](../index.md).

## Purpose

At-a-glance status of multiple parallel AI-agent sessions (Claude Code). The
user runs several agent sessions at once; this widget makes it immediately
visible when any of them is **waiting for the user** — a finished turn
(`ready`) or a permission/attention request (`needs-input`) — versus still
`busy` or gone `idle`. Waiting-for-you sessions sort first and pulse.

Not in the default config; add it via the panel preferences.

## Source files

- `index.ts` — plugin entrypoint (`create(parent, options)`).
- `aiAgentStatus.ts` — the widget: localhost HTTP server receiving Claude hook
  events, the per-session state machine, the dot-row rendering and the
  templated tooltip.
- `prefs.ts` — widget settings UI: Claude hooks status dot + Configure button,
  port/idle/expire/maxDots rows, state colours, pulse switch and the tooltip
  template editor with live preview. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).

## Hook mechanism

Claude Code lifecycle hooks are installed by
[`../ai-agent-usage/claudeHook.ts`](../ai-agent-usage/claudeHook.ts)
(`installEventHooks()` / `eventHooksStatus()`, shared with the usage widget's
statusLine hook). `installEventHooks()` writes the port-independent script
`~/.claude/gnome-widget-panel-agent-event-hook.js` and idempotently merges an
entry for it into `~/.claude/settings.json` `hooks` for the events
`UserPromptSubmit`, `Stop`, `Notification` and `SessionEnd` (no matcher;
user-defined hook entries are preserved). The script reads the Claude JSON
payload from stdin, reads the shared endpoint registry
`~/.claude/gnome-widget-panel-ports.json` (`[{port, secret}...]`) and POSTs the
raw payload to `http://127.0.0.1:<port>/agent-event` on **every** registered
endpoint with an `X-Gnome-Widget-Panel-Token` header. It prints nothing and
always exits 0 — a Stop hook's stdout is interpreted by Claude, so the script
must stay silent and fast.

Coexistence with the statusLine hook (both fan out to all registered
endpoints):

- This widget answers `POST /claude-statusline` with **204 No Content**, never
  200, so the statusLine fan-out (which prints the *first 200 body*) never
  takes this widget's empty body as the status line text; the payload is still
  used as busy-activity evidence.
- The usage widget has no `/agent-event` handler, so event posts to it 404
  harmlessly (the event hook ignores per-endpoint errors).

The widget starts its own `Soup.Server` on `options.port` (default 17871,
distinct from ai-agent-usage's 17861), registers `{port, secret}` in the shared
registry on start and deregisters on `destroy()`. It does not install the
statusLine hook (`installHook()` stays the usage widget's job).

## Session state machine

Per `session_id` (provider `claude`; label = basename of `cwd`, falling back to
the first 8 chars of the id):

| Input | State |
| --- | --- |
| `UserPromptSubmit` event | `busy` |
| statusLine activity (fires only while generating) | `busy` (but never demotes `needs-input`) |
| `Notification` event (asking permission/attention) | `needs-input` — highest priority |
| `Stop` event (turn finished, waiting for the user) | `ready` |
| `SessionEnd` event | session removed |
| no events for > 10 min while `busy` | `idle` (a dead session must not look busy forever) |
| no events for > `idleMinutes` (default 30) | `idle` |
| no events for > `expireMinutes` (default 180) | session removed |

Age transitions run on a 5 s tick. Each session stores `id`, `cwd`, `label`,
`provider`, `state`, `lastEvent` and `lastChange` timestamps.

## Visualization

**Chosen design: one dot per session** — a row of ~12 px round Cairo dots,
filled in the state colour; `needs-input` and `ready` also get a brighter 1 px
ring and pulse their opacity (600 ms ease cadence; `pulseReady: false` limits
the pulse to `needs-input`). Sort order: `needs-input`, `ready`, `busy`,
`idle`. At most `maxDots` dots (default 8) plus a small `+N` overflow label;
with no sessions a single dim hollow placeholder dot keeps the widget visible.
A **rejected alternative** was a single cycling icon showing one aggregated
state: it hides simultaneous states (one busy + one waiting would be
invisible), which defeats the widget's purpose.

In a vertical panel the dots stack vertically (`setPanelLayout({vertical})`
switches the BoxLayout orientation; round dots need no rotation) and the hover
tooltip is placed beside the widget as in
[`ai-agent-usage`](../ai-agent-usage/index.md).

The flicker-free hover tooltip is rendered from a user-editable template via
[`../../tooltipTemplate.ts`](../../tooltipTemplate.ts) (`@tag:ui`). Tokens:

- `{counts}` — summary line, e.g. `1 waiting · 2 busy · 1 idle` (waiting =
  `needs-input` + `ready`, coloured with the needs-input colour).
- `{sessions}` — monospace table, one line per session:
  state-coloured `●`, label, state, `m:ss` since the last state change.

Default template: `{counts}\n{sessions}`.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `port` | `17871` | Localhost port of the widget's hook endpoint. |
| `secret` | random per run | Endpoint token; persisted by the Configure button. |
| `idleMinutes` | `30` | Minutes without events before a session shows `idle`. |
| `expireMinutes` | `180` | Minutes without events before a session is dropped. |
| `maxDots` | `8` | Dot cap (1–16); further sessions collapse into `+N`. |
| `needsInputColor` | `#f03333` | `needs-input` dot colour. |
| `readyColor` | `#3dc752` | `ready` dot colour. |
| `busyColor` | `#4ca6ff` | `busy` dot colour. |
| `idleColor` | `#777777` | `idle` dot colour. |
| `pulseReady` | `true` | Also pulse `ready` dots (not only `needs-input`). |
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

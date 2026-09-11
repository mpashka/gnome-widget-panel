# ai-agent-status widget

`@tag:widget-ai-agent-status` `@tag:ai-collector`

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
[user guide](../../../docs/specification/widgets.md#ai-agent-status--ai-agent-status--optional)
for the end-user framing.

It is a **view of the panel's AI collector**
([`../../aiCollector.ts`](../../aiCollector.ts)) and collects nothing itself:
sessions are recorded whether or not this widget is on the panel, and with
collection switched off the dot is struck through and the tooltip says so —
rather than showing the same empty dot a quiet hour shows. See
[`../../../docs/implementation/ai-collector.md`](../../../docs/implementation/ai-collector.md).

Not in the default config; add it via the panel preferences.

## Source files

- `index.ts` — plugin entrypoint (`create(parent, options)`).
- `aiAgentStatus.ts` — the widget: reads the collector's sessions, applies the
  expiry and staleness policy this widget configures, and draws the single
  aggregated dot and its templated tooltip.
- `prefs.ts` — widget settings UI: the expiry row, the three state colours, the
  pulse switch and the tooltip template editor with live preview. Which agents
  are watched, and on which port, is the collector's settings group. See
  [`../../../docs/implementation/preferences.md`](../../../docs/implementation/preferences.md).

## Where the events come from

The Claude Code lifecycle hooks, the localhost endpoint they post to and the
shared ports registry all belong to the collector — see
[`../../../docs/implementation/ai-collector.md`](../../../docs/implementation/ai-collector.md)
and [`../ai-agent-usage/claudeHook.ts`](../ai-agent-usage/claudeHook.ts). In
short: `installEventHooks()` writes
`~/.claude/gnome-widget-panel-agent-event-hook.js` and merges an entry for it
into `~/.claude/settings.json` for `UserPromptSubmit`, `Stop`, `Notification` and
`SessionEnd`; the script POSTs the raw payload to `/agent-event` on every
registered endpoint, prints nothing and exits 0 (a Stop hook's stdout is
interpreted by Claude, so it must stay silent and fast).

This widget used to run a **second** `Soup.Server` on its own port beside the
usage widget's, which is why it had to answer `POST /claude-statusline` with
`204 No Content`: the hook printed the first 2xx body as Claude's status line and
an empty 200 from here would have hijacked it. With one collector there is one
server and that hazard is gone.

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
| `thinking` with no events for > 10 min (`THINKING_STALE_SECONDS`) | reads as `idle` (missed Stop — no longer "working") |
| no events at all for > `expireMinutes` (default 180) | not shown (missed SessionEnd fallback) |

The first five rows are the **collector's** state machine; the last two are this
widget's, applied when it reads (`_openSessions()`) rather than stored. That is
the split the collector page describes: it records what happened, the viewer
decides how long that keeps meaning something — and it has to be that way round,
because `expireMinutes` is a per-widget setting and two widgets may disagree.

There is no separate grey "stale" state: an open session at rest is `idle`
(ready for the next prompt), and a session is either open or gone. A 5 s tick
re-reads the collector so the ages and those two derived transitions move.

## Visualization

**Chosen design: one aggregated dot** — a single ~12 px round Cairo dot filled
in the colour of the **most-urgent** session state. `_openSessions()` orders
sessions by `waiting`, `idle`, `thinking` (then by recency), and element 0 wins,
so one glyph reflects "the loudest thing an agent needs from you right now". The
two **promptable** states (`waiting`, `idle`) get a brighter 1 px ring and pulse
their opacity (600 ms ease cadence) — a pulsing dot means "a session you can type
into now"; `pulseIdle: false` limits the pulse to `waiting`. `thinking` is solid.
With no sessions a dim grey hollow placeholder dot keeps the widget visible and
hoverable; with **collection switched off** that same dot carries a diagonal
stroke, because "nothing is happening" and "nobody is collecting" are different
facts and used to be the same picture.

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

- [AI collector](../../../docs/implementation/ai-collector.md) — what feeds this
  widget, and why it is not the widget's job.
- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)

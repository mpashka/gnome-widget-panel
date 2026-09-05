# The AI collector

`@tag:ai-collector`

What the AI coding agents on this machine are doing, collected in one place that
belongs to the extension rather than to any widget. Code:
[`../../extension-src/aiCollector.ts`](../../extension-src/aiCollector.ts);
contracts in
[`../../extension-src/contracts.ts`](../../extension-src/contracts.ts).

## Why it exists

Collection used to be a **side effect of a widget existing**.
[`ai-agent-usage`](../../extension-src/plugins/ai-agent-usage/index.md) opened a
`Soup.Server`, installed Claude's hooks and spawned the Codex/Gemini helpers in
its constructor;
[`ai-agent-status`](../../extension-src/plugins/ai-agent-status/index.md) opened
a *second* server on a second port for the same events. Three things followed,
all of them wrong:

- **Removing a widget stopped collecting.** There was no way to say "watch my
  agents" without also putting a graph on the panel, and no way to keep the data
  flowing while the panel showed something else.
- **Editing a widget restarted collection.** Every settings edit rebuilt the
  actor, which tore the server down and put it back up.
- **"Nothing is happening" and "nobody is listening" drew the same picture.** An
  empty dot meant either, and the user could not tell which — the report this
  work came from.

So the collector is the thing and the widgets are views of it.

## What it owns, and what it does not

| Owned by the collector | Owned by each widget |
| --- | --- |
| the localhost `Soup.Server`, its port and per-session secret | how the data is drawn: colours, size, rotation |
| Claude's `statusLine` hook, the lifecycle-event hooks and the shared ports registry | the sampling cadence and the history built from it |
| the Codex and Gemini helper child processes | how long a payload counts as fresh |
| the latest payload per provider, the prompts seen, the open sessions | how long a quiet session still counts as open |

The split is **raw event truth here, display policy there**. The collector
records what happened and prunes only at a fixed 24-hour bound, which is a memory
limit and not a user-visible choice. Everything that answers "and how long does
that keep meaning something" is a setting on the widget that asks, applied where
the drawing happens — otherwise two widgets with different settings could not
share one collector.

## Settings

| Key | What it does |
| --- | --- |
| `ai-collector` | Master switch. Off means no hooks are posted to, no helper runs, and the AI widgets say so. |
| `ai-collector-port` | Localhost-only port Claude Code posts to. The collector rebinds immediately when it changes. |
| `ai-collector-claude` / `-codex` / `-gemini` | Which agents are collected from. |

They live in the panel's `Gio.Settings`, edited from the **AI collector** group
in preferences ([`preferences.md`](preferences.md)). Every one of them restarts
the collector: it is one socket and up to two child processes, which is cheaper
to recreate than to diff.

## Lifecycle

`extension.ts` builds the collector **before** the widgets — they read it in
`create()` through the host contract's `parent.aiCollector` — and destroys it
**after** them, since they hold listeners on it. `destroy()` releases the socket,
deregisters the Claude endpoint and kills the helper processes.

A widget subscribes with `addListener()` and re-renders when told; it never polls
the collector for change. Stopping collection deliberately **keeps** the data:
turning the switch off should not erase what a widget is showing mid-glance, and
turning it back on continues the picture rather than starting a blank one.

## One server, not two

The two widgets used to listen on two ports, both registered in the shared ports
registry, and Claude's status-line hook fanned out to both. That forced a
subtlety: the hook prints the first 2xx body as the status line, so the status
widget had to answer `204 No Content` and never `200`, or its empty body would
hijack the line from the usage widget. With one server the hazard is gone and
every accepted request answers `200`.

The hook still reads the registry at run time rather than embedding a port, so a
second panel instance (a dev session on another port) registers alongside instead
of overwriting the hook file.

## What the user sees when it is off

Both widgets show a **switched-off** picture rather than an empty one: the status
dot gets a diagonal stroke through it, the usage graph a dim stroke across its
body, and both tooltips say the collector is off and where to turn it on. The
wording has one owner, `COLLECTOR_OFF_TEXT` in `aiCollector.ts`, because it names
a specific setting and two copies would drift.

## Tests

- [`../../tests/ui/t-26-ai-collector.sh`](../../tests/ui/t-26-ai-collector.sh) —
  the collector runs with no AI widget configured, the setting stops and starts
  it live, and both widgets distinguish "nothing happening" from "nothing
  collecting".
- [`../../tests/ui/t-09-live-reload-ai-widgets.sh`](../../tests/ui/t-09-live-reload-ai-widgets.sh)
  — it survives a widget reload and outlives every AI widget being removed, and
  what it collected meanwhile is there when a widget comes back.
- [`../../tests/ui/t-14-agent-status-merge.sh`](../../tests/ui/t-14-agent-status-merge.sh)
  — the session state machine, driven through the collector.

## Related

- [`architecture.md`](architecture.md) — the host/plugin design this sits beside.
- [`object-model.md`](object-model.md) — who owns which actor, timer and signal.
- The widgets that view it:
  [`ai-agent-usage`](../../extension-src/plugins/ai-agent-usage/index.md),
  [`ai-agent-status`](../../extension-src/plugins/ai-agent-status/index.md).

Back to the [implementation index](index.md).

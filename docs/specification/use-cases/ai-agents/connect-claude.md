# "Nothing appears for Claude Code"

`@tag:use-case` `@tag:widget-ai-agent-usage` `@tag:widget-ai-agent-status`

Back to [AI agents](index.md) · [use cases](../index.md).

**Goal.** Codex usage shows up by itself, but the Claude Code half of the graph
(or the status dot) stays empty, and I do not want to hand-edit a JSON config to
fix it.

## Steps

1. [S5](../steps.md#s5) — open the widget's own settings
   ([P5](../steps.md#p5)).
2. Press **Configure**. It installs the hook Claude Code needs and points
   Claude's own configuration at it.
3. Start (or restart) a Claude Code session. Data appears as that session
   reports it.

**Cost.** Two clicks and one press — the widget does the file editing, because
telling you which file to edit would be one more step *and* a research task.

## Variants

- **Why is a hook needed at all?** Claude Code reports its usage through a
  status-line hook, so the widget provides one and listens locally. Codex needs
  no setup: it writes session files the panel reads directly.
- **It worked, then stopped.** Press **Configure** again — that repairs the hook
  — or restart GNOME Shell, which also repairs it.
- **A red lamp appeared at the end of my Claude status line.** The widget is
  switched on, the hook has data for it, and nothing accepted it: the widget
  crashed, its port is taken, or GNOME Shell restarted without it. Press
  **Configure**, or restart GNOME Shell. Switching the widget off clears the lamp
  too — with no widget enabled the hook neither sends nor reports.
- **Two widgets, one hook each.** The usage graph and the status dot each have
  their own **Configure** button for their own hook; connecting one does not
  connect the other.
- **I use a custom status line already.** The hook is what Claude's `statusLine`
  runs, and connecting the widget replaces that setting. What the hook prints is
  its own line — model, directory, context percentage and both usage windows —
  built from Claude's own data, not from anything this extension is doing, so it
  keeps working when the panel is closed, the widget is off or GNOME Shell is
  restarting.
- **Which providers can appear at all?** Claude Code, Codex and Gemini CLI, each
  with its own switch and colour in the settings
  ([`../configure/tune-widget.md`](../configure/tune-widget.md)).

## Result

The widget starts receiving that provider's data locally, with nothing sent off
the machine. The wiring [survives a restart](../steps.md#r2); what it collects
does not — the graph starts empty and fills as you work.

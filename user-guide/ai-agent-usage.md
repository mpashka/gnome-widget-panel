# AI agent usage widget — reading the graph

`@tag:widget-ai-agent-usage`

Back to the [user guide](index.md) · [all widgets](widgets.md). Developer notes
and data model: [`../extension-src/plugins/ai-agent-usage/index.md`](../extension-src/plugins/ai-agent-usage/index.md).

The **AI agent usage** widget (`ai-agent-usage`) shows a compact live graph of
how much your AI coding agents — Claude Code, Codex and Gemini CLI — are
consuming. This page explains, in plain language, what every part of the graph
means. It pairs with an interactive demo you can scrub through time:
**[`ai-agent-usage-preview.html`](ai-agent-usage-preview.html)** (open it in a
browser — it needs no server and no install). The intended behaviour is tracked
in issue [#6](https://github.com/mpashka/gnome-widget-panel/issues/6).

## The three things the graph draws

1. **Token-load history (the columns).** The widget samples, on a timer, how
   many tokens the AI agents are consuming. Each sample is one column. The
   column height is the token load at that moment (autoscaled so the busiest
   recent sample is full height). The column is **coloured by the provider that
   consumed the most tokens** at that sample — Claude clay `#d97757`, Codex teal
   `#10a37f`, Gemini blue `#4285f4`. So the colour tells you *who* was busy and
   the height tells you *how* busy.

2. **Per-request markers (the lines).** Every prompt you send to an agent draws
   a marker at the time you sent it, **in that agent's colour** (Claude clay,
   Codex teal, Gemini blue — the same provider colours as the columns), so you
   can see at a glance which agent each request went to:
   - **Horizontal panel** → the marker is a **vertical** line (time runs left to
     right, so a moment in time is a vertical slice).
   - **Vertical panel** → the marker is a **horizontal** line (the graph is
     rotated 90°, so a moment in time is a horizontal slice).

3. **Indicator bars — the active agent.** Two bars track the right edge (or the
   rotated edge in a vertical panel): the usage / rate-limit bar (`usageColor`,
   amber) and the context-window bar (`windowColor`, blue). They show the
   **active agent's** current levels — the agent you are interacting with right
   now (the most recent prompt / the one currently consuming tokens). When you
   switch agents the bars follow: write in Codex and they show Codex's
   usage/window; start writing in Claude and they switch to Claude's
   usage/window. These are the current level, not history.

## How time maps to the drawing

- The visible window is `HISTORY_WIDTH` = 36 columns.
- Each column is one sample, `updateInterval` seconds apart (default 5 s), so the
  visible history is `36 × updateInterval` seconds (3 minutes by default).
- A request marker is placed by its age: `age / updateInterval` columns back from
  "now". Newer requests sit near the leading edge, older ones scroll off.
- History is kept **separately per provider** and merged only at draw time, so a
  column always keeps the identity (and colour) of the provider that won it.

## ASCII sketch

Horizontal panel (time → right, `!` = request marker drawn in the agent's
colour, letters = winning provider column height; bars follow the active agent):

```
 tokens
   ^        !            !     !
   |        C            G     C
   |      C C C        G G   C C C
   |  c c C C C C  g g G G G C C C C   [usage][window]
   +--------------------------------->  time
      oldest ....................now
```

Vertical panel (time → down, markers become horizontal lines):

```
   oldest
     |  c c C C
     |  C C C C
   --!-----------  request marker (horizontal)
     |  G G G
   --!-----------
     |  C C C C
     now
   [usage]
   [window]
```

## What "empty graph" (the bug) looked like

Issue #6: with Claude Code active and prompts sent, none of the above appeared —
no coloured columns, no agent-coloured markers. Root cause: the generated Claude
hook scripts' shebang ran `gjs` in legacy (non-module) mode while their body used
ES module `import` statements, so every invocation crashed with a `SyntaxError`
before delivering any data, and separately the widget's HTTP handlers read a
`request_headers` property that does not exist on the server-side Soup message
(only `get_request_headers()` does), so even a successful delivery would have
been rejected. Both are fixed; Claude's request markers now come from the
`UserPromptSubmit` lifecycle event hook (the `statusLine` payload itself still
carries no prompt text). See the plugin doc's "Requests" and "Claude" sections.

## Confirm the intended look

Open **[`ai-agent-usage-preview.html`](ai-agent-usage-preview.html)** and drag
the time slider. It renders the widget from a fixed set of **test data** (a
timeline of per-provider token samples and prompt events) in both horizontal and
vertical layouts, so you can point at exactly the frame that is right or wrong.
The test data lives inline at the top of that file (`TEST_TIMELINE`) — edit it to
try other scenarios.

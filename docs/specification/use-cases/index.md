# Use cases — what people actually do with the panel

`@tag:use-case` `@tag:ux`

Back to the [user guide](../index.md) · [widgets catalog](../widgets.md).

The [widgets catalog](../widgets.md) answers *"what is this widget and what are
its settings"*. This tree answers the other question — **"I want to do X; what
does it cost me?"** — one page per goal, written in the user's words, starting
from the state the user is already in and counting the gestures it takes.

It exists for two readers. A **user** finds the shortest route to the thing they
came for. A **designer** (human or agent) gets the input [`ux.md`](../../process/ux.md)
demands before an interaction is designed: the use case first, the feature
second. A page here is also the place where a claimed step count can be checked
against what is built.

## How to read a case page

Every case page has the same shape:

- **Goal** — one sentence, in the user's words, with the state they start from.
- **Also assumes** — what this case needs *on top of* the [context](#the-reuse-mechanism)
  its directory already declares. Absent when it needs nothing more.
- **Steps** — numbered, from that state to the result. A step that recurs
  elsewhere is a link into [`steps.md`](steps.md) instead of prose.
- **Cost** — the gesture count for the main path, so a design change that makes
  it longer is visible.
- **Variants** — the near-neighbour goals that reuse the same steps.
- **Result** — what the user sees afterwards, and what persists.

## The reuse mechanism

Use cases overlap heavily — half of them start with "open the panel's menu" and
end with "the change applies live". Nothing here is copy-pasted, and there is
**no include/transclusion preprocessor**: these pages are read *raw* (on GitHub,
by an agent, through `grep`) and the repository has no documentation build step,
so a template tag would be a placeholder nobody expands. Reuse works on two
axes instead, both of them plain Markdown links:

**1. Vertical — inheritance down the tree.** Every directory's `index.md`
declares:

- `## Context` — the state that already holds for **every** case in that
  directory and below it;
- `## After` — what holds once any of them is done.

A case page never repeats either; it adds `## Also assumes` only for what is
specific to it. Nesting a sub-area under an area inherits both.

**2. Horizontal — a step library.** [`steps.md`](steps.md) owns the
preconditions (`P<n>`), steps (`S<n>`) and outcomes (`R<n>`) that recur *across*
areas. Each has a short anchor, so a case cites one as
`[S3](../steps.md#s3)` — a link a reader can follow and `grep` can count:

```bash
grep -rln "steps.md#s3" docs/specification/use-cases   # every case using step S3
grep -rc  "steps.md#"   docs/specification/use-cases/*/*.md
```

**Where a shared thing goes.** A step that appears in two cases moves into
`steps.md`. A precondition shared by every case in a directory moves into that
directory's `Context`. A step used once stays inline — a library of one-offs
stops being read.

**Tags.** Every case page carries `@tag:use-case` plus the `widget-<id>` tag of
the widget it exercises, so one search returns a widget's code, user guide, tests
**and** the goals it was built for:

```bash
grep -rn "@tag:widget-break-timer" extension-src docs tests
```

## The areas

| Area | The kind of goal it holds |
| --- | --- |
| [`setup/`](setup/index.md) | get the panel onto the screen and out of the way of everything else |
| [`configure/`](configure/index.md) | decide which widgets are on it, in which order, tuned how |
| [`launch/`](launch/index.md) | start applications, open folders, reach a window |
| [`monitor/`](monitor/index.md) | see the machine's state without opening anything |
| [`ai-agents/`](ai-agents/index.md) | run AI coding agents without babysitting a terminal |
| [`wellbeing/`](wellbeing/index.md) | stop working at sane intervals, and be left alone when it matters |
| [`support/`](support/index.md) | report what is broken, see what changed |

## Files

- [`steps.md`](steps.md) — the shared library: preconditions, steps and
  outcomes cited by id from the case pages.

## Related

- [`../widgets.md`](../widgets.md) — the widget each case uses, and its settings.
- [`../../process/ux.md`](../../process/ux.md) — the rules a design is held to
  once the use case is written, and the step-count bar.
- [`../../roadmap/index.md`](../../roadmap/index.md) — goals nothing serves yet.

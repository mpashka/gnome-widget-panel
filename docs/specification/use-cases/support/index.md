# Support — reporting what is broken, seeing what changed

`@tag:use-case` `@tag:process`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals that are about the extension itself rather than about your desktop:
getting a defect fixed, and finding out what a new version did.

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1) — the extension is installed; even a broken panel keeps
  its handle and therefore its menu ([S1](../steps.md#s1)), which is where these
  routes start.
- Everything here opens a **browser** page on GitHub or extensions.gnome.org;
  nothing is sent anywhere without you seeing it first.

## After

- Nothing on your desktop changes.
- Both routes exist twice on purpose — in the panel's own menu
  ([S1](../steps.md#s1)) and in the preferences **About** group — because a
  panel too broken to right-click still has a settings window, and vice versa.

## Cases

- [`report-bug.md`](report-bug.md) — "Something is wrong and I want it fixed."
- [`whats-new.md`](whats-new.md) — "What changed, and which version am I on?"
